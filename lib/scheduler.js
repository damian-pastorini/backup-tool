/**
 * Scheduler
 *
 * Runs the scheduled backups of configurations/inspect.config.js inside the main process (index.js), next to the web
 * panel. Every minute it re-reads the config, so new or changed schedules apply within a minute without a restart,
 * and starts the jobs whose cron expression matches (lib/schedule-planner.js decides which mappings each job covers).
 *
 * Each job runs as separate child processes: an inspection of the job's mappings, then, only when the inspection
 * found changes, a sync of the file list it generated. Jobs run in parallel, but a mapping that is still being
 * inspected or synced (by another scheduled job, or by a job started from the panel) is skipped until it finishes.
 * When it starts and once a day it removes old logs (settings.logs, see lib/log-retention.js).
 *
 * OUTPUT:
 * - logs/scheduler-YYYYMMDD.log: what the scheduler did, one file per day
 * - logs/scheduler-state.json: last results, kept across restarts
 * - logs/scheduler.lock: stops a second Backup Tool process from running the same jobs twice
 */

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { SchedulePlanner } = require('./schedule-planner');
const { LogRetention } = require('./log-retention');

class Scheduler
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.configPath = path.join(this.rootPath, 'configurations', 'inspect.config.js');
        this.logsPath = path.join(this.rootPath, 'logs');
        this.statePath = path.join(this.logsPath, 'scheduler-state.json');
        this.lockPath = path.join(this.logsPath, 'scheduler.lock');
        this.isConsoleOutput = false !== props.isConsoleOutput;
        // returns a description when something outside the scheduler (the panel) is running that mapping:
        this.externalBusyCheck = props.externalBusyCheck || false;
        this.isStarted = false;
        this.lockError = '';
        this.staleStateMs = 180000;
        this.planner = new SchedulePlanner();
        this.retention = new LogRetention({logsPath: this.logsPath});
        this.config = {settings: {}, mappings: []};
        this.plan = {jobs: [], warnings: []};
        this.planSignature = '';
        this.warningsText = '';
        this.configError = '';
        this.runningMappings = new Map();
        this.runs = new Map();
        this.children = new Set();
        this.lastRuns = {};
        this.nextRunId = 1;
        this.timer = false;
        this.stopping = false;
        this.lastCleanupDay = '';
        this.startedAt = new Date().toISOString();
        // not anchored: a progress line without its line break can come before the match
        this.outputFilePattern = /(Log file|File config): (.+)$/;
        this.changesPattern = /^Total files affected: (\d+)/;
        this.errorsPattern = /^Errors: (\d+)/;
    }

    start()
    {
        fs.mkdirSync(this.logsPath, {recursive: true});
        let previousState = this.loadPreviousState();
        if(!this.acquireLock(previousState)){
            return false;
        }
        this.lastRuns = previousState.lastRuns || {};
        this.isStarted = true;
        this.log('Scheduler started. Schedules run while this process runs; closing its window stops them.');
        let now = new Date();
        this.refreshPlan(now);
        this.cleanLogs(now);
        this.writeState(now);
        this.scheduleNextTick();
        return true;
    }

    loadPreviousState()
    {
        try{
            return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        }catch(error){
            return {};
        }
    }

    acquireLock(previousState)
    {
        let lockedPid = 0;
        try{
            lockedPid = Number(fs.readFileSync(this.lockPath, 'utf8').trim());
        }catch(error){
            lockedPid = 0;
        }
        let updatedAt = previousState.updatedAt ? new Date(previousState.updatedAt).getTime() : 0;
        // a lock left by a crash can point to a PID that Windows reused, a live scheduler updates its state every minute:
        let isRecent = Date.now()-updatedAt < this.staleStateMs;
        if(lockedPid && lockedPid !== process.pid && this.isProcessAlive(lockedPid) && isRecent){
            this.lockError = 'Another Backup Tool process (PID '+lockedPid+') is already running the schedules.';
            console.log(this.lockError);
            return false;
        }
        fs.writeFileSync(this.lockPath, String(process.pid), 'utf8');
        process.on('exit', () => {
            this.releaseLock();
        });
        return true;
    }

    releaseLock()
    {
        try{
            if(process.pid === Number(fs.readFileSync(this.lockPath, 'utf8').trim())){
                fs.unlinkSync(this.lockPath);
            }
        }catch(error){
            // already removed
        }
    }

    isProcessAlive(pid)
    {
        try{
            process.kill(pid, 0);
            return true;
        }catch(error){
            return 'EPERM' === error.code;
        }
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
        this.releaseLock();
    }

    stopChildren()
    {
        // the scripts save their log, marked INTERRUPTED, then exit:
        for(let child of this.children){
            if(child.connected){
                child.send('stop');
            }
        }
    }

    hasRunningChildren()
    {
        return 0 < this.children.size;
    }

    findBusyMappingKey(key)
    {
        let busyWith = this.runningMappings.get(key);
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
        this.refreshPlan(minute);
        this.cleanLogs(minute);
        let started = [];
        for(let job of this.plan.jobs){
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

    loadConfig()
    {
        try{
            delete require.cache[require.resolve(this.configPath)];
            let config = require(this.configPath);
            if(!config || !Array.isArray(config.mappings)){
                throw new Error('it has no "mappings" list');
            }
            if('' !== this.configError){
                this.log('The config can be read again.');
            }
            this.configError = '';
            return config;
        }catch(error){
            let message = 'Could not read '+this.configPath+': '+error.message
                +(0 < this.plan.jobs.length ? ' (the previous schedule is kept)' : '');
            if(message !== this.configError){
                this.log(message);
            }
            this.configError = message;
            return false;
        }
    }

    refreshPlan(now)
    {
        let config = this.loadConfig();
        if(!config){
            return;
        }
        this.config = config;
        this.plan = this.planner.plan(config);
        let warningsText = this.plan.warnings.join('\n');
        if(warningsText !== this.warningsText){
            for(let warning of this.plan.warnings){
                this.log('Warning: '+warning);
            }
            this.warningsText = warningsText;
        }
        let signature = JSON.stringify(this.plan.jobs.map((job) => {
            return [job.key, job.cron, job.mappingIndexes];
        }));
        if(signature !== this.planSignature){
            this.planSignature = signature;
            this.logPlan(now);
        }
    }

    logPlan(now)
    {
        if(0 === this.plan.jobs.length){
            this.log('No scheduled jobs. Turn on the general schedule or a mapping\'s schedule in the web panel.');
            return;
        }
        this.log('Scheduled jobs:');
        for(let job of this.planner.describeJobs(this.plan, this.config.mappings, now)){
            let nextRun = job.nextRunAt ? this.formatTime(new Date(job.nextRunAt)) : 'never';
            this.log('  '+job.name+' ['+job.cron+'] '+job.description+', mappings #'+job.mappingNumbers.join(', #')+', next run '+nextRun);
        }
    }

    launch(job)
    {
        let free = [];
        for(let index of job.mappingIndexes){
            let mapping = this.config.mappings[index];
            let key = this.planner.mappingKey(mapping);
            let busyWith = this.findBusyMappingKey(key);
            if(busyWith){
                this.log('['+job.name+'] Skipping mapping #'+(index+1)+' ('+mapping.from+'): '+busyWith+' is still running it.');
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
        });
        return run;
    }

    async execute(run, runLabel)
    {
        let trigger = '--triggered-by=schedule: '+run.jobName;
        let inspection = await this.runScript('run-inspect-folders.js', ['--mapping='+run.mappingNumbers.join(','), trigger], runLabel);
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
        let sync = await this.runScript('run-sync.js', ['--config-files='+inspection.files['File config'], trigger], runLabel);
        outcome.syncLog = sync.files['Log file'] || '';
        if(0 !== sync.code){
            return Object.assign(outcome, {result: 'sync failed (exit code '+sync.code+')', status: 'error'});
        }
        if(0 < sync.errors){
            return Object.assign(outcome, {result: 'synced with '+sync.errors+' errors, see '+outcome.syncLog, status: 'error'});
        }
        return Object.assign(outcome, {result: 'synced '+inspection.changes+' changes', status: 'ok'});
    }

    runScript(script, args, runLabel)
    {
        return new Promise((resolve) => {
            let result = {code: null, files: {}, changes: 0, errors: 0};
            let pending = '';
            // forked with an IPC channel, so stopChildren() can ask the script to stop and save its log:
            let child = fork(path.join(this.rootPath, script), args, {cwd: this.rootPath, silent: true, windowsHide: true});
            this.children.add(child);
            let onData = (chunk) => {
                pending += chunk.toString();
                let lines = pending.split(/\r?\n/);
                pending = lines.pop();
                for(let line of lines){
                    this.handleScriptLine(line, result, runLabel);
                }
            };
            child.stdout.on('data', onData);
            child.stderr.on('data', onData);
            child.on('error', (error) => {
                this.log('['+runLabel+'] Could not start '+script+': '+error.message);
                result.code = -1;
                resolve(result);
            });
            child.on('close', (code) => {
                this.children.delete(child);
                if('' !== pending){
                    this.handleScriptLine(pending, result, runLabel);
                }
                if(null === result.code){
                    result.code = code;
                }
                resolve(result);
            });
        });
    }

    handleScriptLine(rawLine, result, runLabel)
    {
        // progress lines overwrite themselves with "\r", keep what would be visible in a console:
        let line = rawLine.substring(rawLine.lastIndexOf('\r')+1).trim();
        if('' === line){
            return;
        }
        let fileMatch = this.outputFilePattern.exec(line);
        if(fileMatch){
            result.files[fileMatch[1]] = path.basename(fileMatch[2].trim());
        }
        let changesMatch = this.changesPattern.exec(line);
        if(changesMatch){
            result.changes = Number(changesMatch[1]);
        }
        let errorsMatch = this.errorsPattern.exec(line);
        if(errorsMatch){
            result.errors = Number(errorsMatch[1]);
        }
        this.log('['+runLabel+'] '+line);
    }

    cleanLogs(now)
    {
        let day = now.toDateString();
        if(day === this.lastCleanupDay){
            return;
        }
        this.lastCleanupDay = day;
        let cleanup = this.retention.clean(this.config.settings || {}, now);
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
            lockError: this.lockError,
            configError: this.configError,
            warnings: this.plan.warnings,
            jobs: this.planner.describeJobs(this.plan, this.config.mappings || [], now),
            running: running,
            lastRuns: this.lastRuns
        };
    }

    writeState(now, isStopped)
    {
        try{
            fs.writeFileSync(this.statePath+'.tmp', JSON.stringify(this.buildState(now, isStopped), null, 4), 'utf8');
            fs.renameSync(this.statePath+'.tmp', this.statePath);
        }catch(error){
            // the state file only keeps the last results across restarts, the next minute writes it again
        }
    }

    log(message)
    {
        let now = new Date();
        let line = '['+this.formatTime(now)+'] '+message;
        if(this.isConsoleOutput){
            console.log(line);
        }
        try{
            fs.appendFileSync(path.join(this.logsPath, 'scheduler-'+this.formatDay(now)+'.log'), line+'\n', 'utf8');
        }catch(error){
            // the console still shows it
        }
    }

    pad2(value)
    {
        return (10 > value ? '0' : '')+value;
    }

    formatDay(date)
    {
        return date.getFullYear().toString()+this.pad2(date.getMonth()+1)+this.pad2(date.getDate());
    }

    formatTime(date)
    {
        return date.getFullYear().toString()+'-'+this.pad2(date.getMonth()+1)+'-'+this.pad2(date.getDate())
            +' '+this.pad2(date.getHours())+':'+this.pad2(date.getMinutes())+':'+this.pad2(date.getSeconds());
    }

}

module.exports.Scheduler = Scheduler;
