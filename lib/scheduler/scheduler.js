/**
 * Scheduler
 *
 * Runs the scheduled backups of configurations/inspect.config.js inside the main process (index.js), next to the web
 * panel. Every minute it re-reads the config, so new or changed schedules apply within a minute without a restart,
 * and starts the jobs whose cron expression matches (lib/scheduler/schedule-planner.js decides which mappings each
 * job covers).
 *
 * Each job runs as separate child processes: an inspection of the job's mappings, then, only when the inspection
 * found changes, a sync of the file list it generated. Jobs run in parallel, but a mapping that is still being
 * inspected or synced (by another scheduled job, or by a job started from the panel) is skipped until it finishes.
 * When it starts and once a day it removes old logs (settings.logs, see lib/scheduler/log-retention.js).
 *
 * OUTPUT:
 * - logs/scheduler-YYYYMMDD.log: what the scheduler did, one file per day
 * - logs/scheduler-state.json: last results, kept across restarts
 * - logs/scheduler.lock: stops a second Backup Tool process from running the same jobs twice
 */

const fs = require('fs');
const path = require('path');
const { LogRetention } = require('./log-retention');
const { SchedulerLock } = require('./scheduler-lock');
const { SchedulerLog } = require('./scheduler-log');
const { SchedulerStateFile } = require('./scheduler-state-file');
const { CurrentSchedule } = require('./current-schedule');
const { ScriptProcesses } = require('./script-processes');

class Scheduler
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.logsPath = path.join(this.rootPath, 'logs');
        // returns a description when something outside the scheduler (the panel) is running that mapping:
        this.externalBusyCheck = props.externalBusyCheck || false;
        this.logger = new SchedulerLog({logsPath: this.logsPath, isConsoleOutput: false !== props.isConsoleOutput});
        this.lock = new SchedulerLock({lockPath: path.join(this.logsPath, 'scheduler.lock'), staleStateMs: 180000});
        this.stateFile = new SchedulerStateFile({statePath: path.join(this.logsPath, 'scheduler-state.json')});
        this.schedule = new CurrentSchedule({
            configPath: path.join(this.rootPath, 'configurations', 'inspect.config.js'),
            logger: this.logger
        });
        this.scripts = new ScriptProcesses({rootPath: this.rootPath, logger: this.logger});
        this.retention = new LogRetention({logsPath: this.logsPath});
        this.isStarted = false;
        this.runningMappings = new Map();
        this.runs = new Map();
        this.lastRuns = {};
        this.nextRunId = 1;
        this.timer = false;
        this.stopping = false;
        this.lastCleanupDay = '';
        this.startedAt = new Date().toISOString();
    }

    start()
    {
        fs.mkdirSync(this.logsPath, {recursive: true});
        let previousState = this.stateFile.load();
        if(!this.lock.acquire(previousState)){
            return false;
        }
        this.lastRuns = previousState.lastRuns || {};
        this.isStarted = true;
        this.log('Scheduler started. Schedules run while this process runs; closing its window stops them.');
        let now = new Date();
        this.schedule.refresh(now);
        this.cleanLogs(now);
        this.writeState(now);
        this.scheduleNextTick();
        return true;
    }

    stop()
    {
        if(this.stopping || !this.isStarted){
            return;
        }
        this.stopping = true;
        this.isStarted = false;
        clearTimeout(this.timer);
        let running = 0 < this.runs.size ? ' '+this.runs.size+' running job(s) cancelled, their scripts save their logs.' : '';
        this.log('Scheduler stopped.'+running);
        this.writeState(new Date(), true);
        this.lock.release();
    }

    stopChildren()
    {
        this.scripts.stopAll();
    }

    hasRunningChildren()
    {
        return this.scripts.hasRunning();
    }

    findRunningLabel(key)
    {
        return this.runningMappings.get(key) || '';
    }

    findBusyMappingKey(key)
    {
        let busyWith = this.findRunningLabel(key);
        if(busyWith){
            return busyWith;
        }
        return this.externalBusyCheck ? this.externalBusyCheck(key) : '';
    }

    scheduleNextTick()
    {
        // wake up just after the start of the next minute:
        let delayMs = 60000-(Date.now()%60000)+200;
        this.timer = setTimeout(() => {
            this.tick(new Date());
            this.scheduleNextTick();
        }, delayMs);
    }

    tick(now)
    {
        let minute = new Date(now.getTime());
        minute.setSeconds(0, 0);
        this.schedule.refresh(minute);
        this.cleanLogs(minute);
        let started = [];
        for(let job of this.schedule.plan.jobs){
            if(!job.expression.matches(minute)){
                continue;
            }
            let run = this.launch(job);
            if(run){
                started.push(run);
            }
        }
        this.writeState(new Date());
        return started;
    }

    launch(job)
    {
        let free = [];
        for(let index of job.mappingIndexes){
            let key = this.schedule.mappingKey(index);
            let busyWith = this.findBusyMappingKey(key);
            if(busyWith){
                this.log('['+job.name+'] Skipping mapping #'+(index+1)+' ('+this.schedule.config.mappings[index].from+'): '+busyWith+' is still running it.');
                continue;
            }
            free.push({index: index, key: key});
        }
        if(0 === free.length){
            return false;
        }
        let run = {
            id: this.nextRunId,
            jobKey: job.key,
            jobName: job.name,
            mappingNumbers: free.map((item) => {
                return item.index+1;
            }),
            mappingKeys: free.map((item) => {
                return item.key;
            }),
            startedAt: new Date().toISOString(),
            step: 'inspection',
            promise: null
        };
        this.nextRunId += 1;
        let runLabel = job.name+' (run '+run.id+')';
        for(let key of run.mappingKeys){
            this.runningMappings.set(key, runLabel);
        }
        this.runs.set(run.id, run);
        this.log('['+runLabel+'] Started: inspecting mapping'+(1 < run.mappingNumbers.length ? 's' : '')+' #'+run.mappingNumbers.join(', #'));
        run.promise = this.execute(run, runLabel).catch((error) => {
            return {result: 'failed: '+error.message, status: 'error'};
        }).then((outcome) => {
            return this.finishRun(run, runLabel, outcome);
        });
        return run;
    }

    finishRun(run, runLabel, outcome)
    {
        for(let key of run.mappingKeys){
            this.runningMappings.delete(key);
        }
        this.runs.delete(run.id);
        this.lastRuns[run.jobKey] = Object.assign({
            jobName: run.jobName,
            mappingNumbers: run.mappingNumbers,
            startedAt: run.startedAt,
            finishedAt: new Date().toISOString()
        }, outcome);
        this.log('['+runLabel+'] Finished: '+outcome.result);
        this.writeState(new Date());
        return outcome;
    }

    async execute(run, runLabel)
    {
        let trigger = '--triggered-by=schedule: '+run.jobName;
        let inspection = await this.scripts.run('run-inspect-folders.js', ['--mapping='+run.mappingNumbers.join(','), trigger], runLabel);
        let outcome = {inspectionLog: inspection.files['Log file'] || '', syncLog: '', changes: inspection.changes};
        if(0 !== inspection.code){
            return Object.assign(outcome, {result: 'inspection failed (exit code '+inspection.code+')', status: 'error'});
        }
        if(!inspection.files['File config']){
            return Object.assign(outcome, {result: 'no changes, nothing to sync', status: 'ok'});
        }
        run.step = 'sync';
        this.writeState(new Date());
        this.log('['+runLabel+'] '+inspection.changes+' changes found, syncing '+inspection.files['File config']);
        let sync = await this.scripts.run('run-sync.js', ['--config-files='+inspection.files['File config'], trigger], runLabel);
        outcome.syncLog = sync.files['Log file'] || '';
        if(0 !== sync.code){
            return Object.assign(outcome, {result: 'sync failed (exit code '+sync.code+')', status: 'error'});
        }
        if(0 < sync.errors){
            return Object.assign(outcome, {result: 'synced with '+sync.errors+' errors, see '+outcome.syncLog, status: 'error'});
        }
        return Object.assign(outcome, {result: 'synced '+inspection.changes+' changes', status: 'ok'});
    }

    cleanLogs(now)
    {
        let day = now.toDateString();
        if(day === this.lastCleanupDay){
            return;
        }
        this.lastCleanupDay = day;
        let cleanup = this.retention.clean(this.schedule.config.settings || {}, now);
        if(!cleanup.options.removeOldLogs){
            this.log('Old logs are kept: settings.logs.removeOldLogs is off.');
            return;
        }
        if(0 < cleanup.removed.length){
            this.log('Removed '+cleanup.removed.length+' logs older than '+cleanup.options.keepDays+' days.');
        }
    }

    buildState(now, isStopped)
    {
        let running = Array.from(this.runs.values()).map((run) => {
            return {jobKey: run.jobKey, jobName: run.jobName, mappingNumbers: run.mappingNumbers, startedAt: run.startedAt, step: run.step};
        });
        return {
            pid: process.pid,
            startedAt: this.startedAt,
            updatedAt: now.toISOString(),
            stopped: true === isStopped,
            lockError: this.lock.error,
            configError: this.schedule.configError,
            warnings: this.schedule.plan.warnings,
            jobs: this.schedule.describeJobs(now),
            running: running,
            lastRuns: this.lastRuns
        };
    }

    writeState(now, isStopped)
    {
        this.stateFile.write(this.buildState(now, isStopped));
    }

    log(message)
    {
        this.logger.log(message);
    }

}

module.exports.Scheduler = Scheduler;
