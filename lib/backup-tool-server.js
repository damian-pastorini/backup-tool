/**
 * Backup Tool Server
 *
 * Local web panel to check the backup status and configs, and to run the inspect and sync scripts. The same process
 * runs the scheduled backups (lib/scheduler.js), which re-reads the config every minute, so schedule changes never
 * need a restart.
 * Not secured: it only listens on 127.0.0.1 by default.
 * Default port 9977, an uncommon one so it doesn't clash with other local development servers.
 */

const http = require('http');
const { spawn } = require('child_process');
const { AppServerFactory, FileHandler } = require('@reldens/server-utils');
const { ProjectFiles } = require('./project-files');
const { JobRunner } = require('./job-runner');
const { MappingsConfig } = require('./mappings-config');
const { FolderBrowser } = require('./folder-browser');
const { CronExpression } = require('./cron-expression');
const { SchedulePlanner } = require('./schedule-planner');
const { Scheduler } = require('./scheduler');

class BackupToolServer
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.host = props.host || '127.0.0.1';
        this.port = Number(props.port || 9977);
        this.openOnStart = true === props.openOnStart;
        this.title = 'Backup Tool';
        this.publicPath = FileHandler.joinPaths(this.rootPath, 'public');
        this.projectFiles = new ProjectFiles({rootPath: this.rootPath});
        this.mappingsConfig = new MappingsConfig({configurationsPath: this.projectFiles.configurationsPath});
        this.folderBrowser = new FolderBrowser();
        this.schedulePlanner = new SchedulePlanner();
        this.chainedSync = false;
        // mappings the current panel job works on, so the scheduler skips them and the panel refuses scheduled ones:
        this.panelJobMappingKeys = new Set();
        this.scheduler = new Scheduler({
            rootPath: this.rootPath,
            externalBusyCheck: (mappingKey) => {
                return this.findPanelJobFor(mappingKey);
            }
        });
        this.jobRunner = new JobRunner({
            rootPath: this.rootPath,
            onOutput: (text) => {
                // mirror the script output in this console window:
                process.stdout.write(text);
            },
            onJobChange: (job) => {
                this.reportJobChange(job);
            }
        });
        this.appServerFactory = new AppServerFactory();
        this.app = false;
        this.appServer = false;
    }

    async start()
    {
        let serverResult = this.appServerFactory.createAppServer({
            port: this.port,
            autoListen: false,
            // plain HTTP only: no SSL, no HSTS or CSP "upgrade-insecure-requests", no redirects to HTTPS
            useHttps: false,
            useHelmet: false,
            enforceProtocol: false,
            // always in development mode, so static files are not cached and every host works the same
            developmentEnvironments: [process.env.NODE_ENV || 'production'],
            // the HTML sanitizer would turn "&" in folder paths into "&amp;"; the page never renders data as HTML:
            useXssProtection: false,
            useCors: false,
            maxRequestSize: '1mb'
        });
        if(!serverResult){
            console.error('Could not create the server: '+this.appServerFactory.error.message);
            return false;
        }
        this.app = serverResult.app;
        this.appServer = serverResult.appServer;
        this.setupRoutes();
        await this.appServerFactory.enableServeHome(this.app, async () => {
            return FileHandler.readFile(FileHandler.joinPaths(this.publicPath, 'index.html'));
        });
        await this.appServerFactory.serveStatics(this.app, this.publicPath);
        this.appServer.on('error', async (error) => {
            await this.handleListenError(error);
        });
        this.appServer.listen(this.port, this.host, () => {
            process.title = this.title+' - idle';
            console.log('Backup tool running on '+this.url());
            console.log('Closing this window stops the panel and the schedules, and cancels any running job (its log is still saved).');
            this.setupStopHandlers();
            this.scheduler.start();
            console.log('Waiting for jobs...');
            if(this.openOnStart){
                this.openBrowser();
            }
        });
        return true;
    }

    setupStopHandlers()
    {
        // Ctrl+C, and on Windows closing the console window (SIGHUP); the job scripts get the same signal and save their logs
        process.on('SIGINT', () => {
            this.shutdown();
        });
        process.on('SIGHUP', () => {
            this.shutdown();
        });
        process.stdout.on('error', () => {});
        process.stderr.on('error', () => {});
    }

    async shutdown()
    {
        if(this.isShuttingDown){
            return;
        }
        this.isShuttingDown = true;
        console.log('Stopping the Backup Tool, the running jobs save their logs first...');
        this.scheduler.stop();
        this.scheduler.stopChildren();
        this.jobRunner.stop();
        // wait for the job scripts to save their logs, up to 15 seconds:
        for(let i = 0; i < 60 && (this.jobRunner.isRunning() || this.scheduler.hasRunningChildren()); i++){
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        process.exit(0);
    }

    isLocalRequest(req)
    {
        let address = String(req.socket.remoteAddress || '');
        return '127.0.0.1' === address || '::1' === address || '::ffff:127.0.0.1' === address;
    }

    findPanelJobFor(mappingKey)
    {
        if(!this.jobRunner.isRunning() || !this.panelJobMappingKeys.has(mappingKey)){
            return '';
        }
        return 'the panel job "'+this.jobRunner.job.label+'"';
    }

    jobMappingKeys(params)
    {
        let config = this.mappingsConfig.load();
        let mappings = config ? config.mappings : [];
        if(undefined !== params.mapping && null !== params.mapping){
            let mapping = mappings[Number(params.mapping)];
            return mapping ? [this.schedulePlanner.mappingKey(mapping)] : [];
        }
        // full inspections cover the enabled mappings, syncs of a config file can touch any of them:
        return mappings.filter((mapping) => {
            return 'inspect' !== params.action || false !== mapping.enabled;
        }).map((mapping) => {
            return this.schedulePlanner.mappingKey(mapping);
        });
    }

    findScheduledConflict(mappingKeys)
    {
        for(let key of mappingKeys){
            let runLabel = this.scheduler.runningMappings.get(key);
            if(runLabel){
                return 'The schedule is running '+key+' right now ('+runLabel+'), try again when it finishes.';
            }
        }
        return '';
    }

    reportJobChange(job)
    {
        let time = new Date().toLocaleTimeString();
        if(job.running){
            process.title = this.title+' - RUNNING: '+job.label;
            console.log('\n['+time+'] STARTED: '+job.label);
            console.log('['+time+'] node '+[job.script].concat(job.args).join(' ')+'\n');
            return;
        }
        process.title = this.title+' - idle (last: '+job.label+', exit code '+job.exitCode+')';
        console.log('\n['+time+'] FINISHED: '+job.label+' (exit code '+job.exitCode+')');
        this.startChainedSync(job);
        if(!this.jobRunner.isRunning()){
            this.panelJobMappingKeys = new Set();
            console.log('Waiting for jobs...');
        }
    }

    url()
    {
        let isLocal = '127.0.0.1' === this.host || '0.0.0.0' === this.host;
        return 'http://'+(isLocal ? 'localhost' : this.host)+':'+this.port;
    }

    async handleListenError(error)
    {
        if('EADDRINUSE' === error.code && await this.isAlreadyRunning()){
            // a second start (e.g. the desktop shortcut clicked again) only opens the browser:
            console.log('Backup tool is already running on '+this.url());
            if(this.openOnStart){
                this.openBrowser();
            }
            process.exit(0);
        }
        console.error('Server error: '+error.message);
        process.exit(1);
    }

    isAlreadyRunning()
    {
        let checkHost = '0.0.0.0' === this.host ? '127.0.0.1' : this.host;
        return new Promise((resolve) => {
            let request = http.get('http://'+checkHost+':'+this.port+'/api/status', (response) => {
                response.resume();
                resolve(200 === response.statusCode);
            });
            request.on('error', () => {
                resolve(false);
            });
            request.setTimeout(5000, () => {
                request.destroy();
                resolve(false);
            });
        });
    }

    openBrowser()
    {
        let command = 'xdg-open';
        let args = [this.url()];
        if('win32' === process.platform){
            // the empty argument is the window title that "start" expects before the URL:
            command = 'cmd';
            args = ['/c', 'start', '', this.url()];
        }
        if('darwin' === process.platform){
            command = 'open';
        }
        let child = spawn(command, args, {detached: true, stdio: 'ignore', windowsHide: true});
        child.on('error', (error) => {
            console.log('Could not open the browser ('+error.message+'), open '+this.url()+' manually.');
        });
        child.unref();
    }

    setupRoutes()
    {
        this.app.get('/api/status', (req, res) => {
            return res.json(this.fetchStatus());
        });
        this.app.get('/api/job', (req, res) => {
            return res.json({job: this.jobRunner.serialize(req.query.from)});
        });
        this.app.get('/api/configs/:name', (req, res) => {
            if(!this.projectFiles.isConfigName(req.params.name)){
                return res.status(404).json({error: 'Unknown config.'});
            }
            let details = this.projectFiles.fetchConfigDetails(req.params.name);
            if(!details){
                return res.status(404).json({error: 'Config not found.'});
            }
            return res.json(details);
        });
        this.app.get('/api/logs/:name', (req, res) => {
            if(!this.projectFiles.isLogName(req.params.name)){
                return res.status(404).json({error: 'Unknown log.'});
            }
            let details = this.projectFiles.fetchLogDetails(req.params.name);
            if(!details){
                return res.status(404).json({error: 'Log not found.'});
            }
            return res.json(details);
        });
        this.app.get('/raw/logs/:name', (req, res) => {
            if(!this.projectFiles.isLogName(req.params.name)){
                return res.status(404).send('Unknown log.');
            }
            return res.type('text/plain').sendFile(this.projectFiles.logPath(req.params.name));
        });
        this.app.get('/raw/configs/:name', (req, res) => {
            if(!this.projectFiles.isConfigName(req.params.name)){
                return res.status(404).send('Unknown config.');
            }
            return res.type('text/plain').sendFile(this.projectFiles.configPath(req.params.name));
        });
        this.app.post('/api/run', (req, res) => {
            let result = this.runJob(req.body || {});
            if(result.error){
                return res.status(400).json(result);
            }
            return res.json(result);
        });
        this.app.post('/api/stop', (req, res) => {
            return res.json({stopping: this.jobRunner.stop()});
        });
        // used by the tray's Exit: stops everything cleanly, only from this machine
        this.app.post('/api/shutdown', (req, res) => {
            if(!this.isLocalRequest(req)){
                return res.status(403).json({error: 'Only allowed from this machine.'});
            }
            res.json({stopping: true});
            setTimeout(() => {
                this.shutdown();
            }, 100);
        });
        this.app.post('/api/mappings', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.add(req.body || {}));
        });
        this.app.put('/api/mappings/:index', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.update(Number(req.params.index), body.expectedFrom, body.mapping || {}));
        });
        this.app.delete('/api/mappings/:index', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.remove(Number(req.params.index), String(req.query.from || '')));
        });
        this.app.put('/api/mappings/:index/enabled', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.setEnabled(Number(req.params.index), body.expectedFrom, body.enabled));
        });
        this.app.put('/api/settings', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.updateSettings(req.body || {}));
        });
        this.app.put('/api/mappings/:index/schedule', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.setScheduleEnabled(Number(req.params.index), body.expectedFrom, body.enabled));
        });
        this.app.get('/api/cron', (req, res) => {
            let expression = new CronExpression(String(req.query.expression || ''));
            if(!expression.isValid()){
                return res.json({valid: false, error: expression.error});
            }
            let nextRuns = expression.nextRuns(new Date(), 3).map((date) => {
                return date.toISOString();
            });
            return res.json({valid: true, description: expression.describe(), nextRuns: nextRuns});
        });
        this.app.get('/api/browse', async (req, res) => {
            return this.sendResult(res, await this.folderBrowser.list(req.query.path || ''));
        });
        this.app.post('/api/folders', async (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, await this.folderBrowser.createFolder(body.parent, body.name));
        });
    }

    sendResult(res, result)
    {
        if(result.error){
            return res.status(400).json(result);
        }
        return res.json(result);
    }

    fetchStatus()
    {
        let mappingsResult = this.projectFiles.fetchMappings();
        let configs = this.projectFiles.fetchConfigsList();
        let logs = this.projectFiles.fetchLogsList();
        let latestSync = false;
        let latestInspect = false;
        for(let log of logs){
            if(!latestSync && 'sync' === log.type && !log.dryRun){
                latestSync = log;
            }
            if(!latestInspect && 'inspect' === log.type){
                latestInspect = log;
            }
        }
        let latestFilesConfig = false;
        for(let config of configs){
            if(config.generated && 'files' === config.type){
                latestFilesConfig = config;
                break;
            }
        }
        let latestFilesConfigSyncedBy = false;
        if(latestFilesConfig){
            for(let log of logs){
                if('sync' === log.type && !log.dryRun && log.config === latestFilesConfig.name){
                    latestFilesConfigSyncedBy = log;
                    break;
                }
            }
        }
        let schedule = this.fetchSchedule(mappingsResult.mappings);
        return {
            rootPath: this.rootPath,
            job: this.jobRunner.serialize(Number.MAX_SAFE_INTEGER),
            settings: this.mappingsConfig.fetchSettings(),
            mappings: mappingsResult.mappings,
            mappingsError: mappingsResult.error,
            schedule: schedule,
            scheduler: {isRunning: this.scheduler.isStarted, state: this.scheduler.buildState(new Date())},
            configs: configs,
            logs: logs,
            latestSync: latestSync,
            latestInspect: latestInspect,
            latestFilesConfig: latestFilesConfig,
            latestFilesConfigSyncedBy: latestFilesConfigSyncedBy
        };
    }

    fetchSchedule(mappings)
    {
        let config = this.mappingsConfig.load();
        if(!config){
            return {jobs: [], warnings: []};
        }
        let plan = this.schedulePlanner.plan(config);
        let jobs = this.schedulePlanner.describeJobs(plan, config.mappings, new Date());
        // tell every mapping which job runs it, for the mapping list:
        for(let job of jobs){
            for(let number of job.mappingNumbers){
                let mapping = mappings[number-1];
                if(mapping){
                    mapping.schedule.jobName = job.name;
                    mapping.schedule.effectiveCron = job.cron;
                    mapping.schedule.description = job.description;
                    mapping.schedule.nextRunAt = job.nextRunAt;
                }
            }
        }
        return {jobs: jobs, warnings: plan.warnings};
    }

    runJob(params)
    {
        if(this.jobRunner.isRunning()){
            return {error: 'Another job is already running.'};
        }
        if('inspect' !== params.action && 'sync' !== params.action){
            return {error: 'Unknown action.'};
        }
        // a mapping is never run by the panel and the schedule at the same time:
        let mappingKeys = this.jobMappingKeys(params);
        let conflict = this.findScheduledConflict(mappingKeys);
        if(conflict){
            return {error: conflict};
        }
        this.panelJobMappingKeys = new Set(mappingKeys);
        if(undefined !== params.mapping && null !== params.mapping){
            return this.runMappingJob(params);
        }
        if('inspect' === params.action){
            let args = [];
            if(true === params.withHash){
                args.push('--with-hash');
            }
            return {job: this.serializeStarted(this.jobRunner.start('Inspection', 'run-inspect-folders.js', args))};
        }
        let configName = String(params.config || '');
        if(!this.projectFiles.isConfigName(configName)){
            return {error: 'Unknown config: '+configName};
        }
        if(!FileHandler.exists(this.projectFiles.configPath(configName))){
            return {error: 'Config file not found: '+configName};
        }
        let isFilesConfig = this.projectFiles.isFilesConfig(configName);
        let args = [(isFilesConfig ? '--config-files=' : '--config=')+configName];
        if(true === params.dryRun){
            args.push('--dry-run');
        }
        if(true === params.withHash){
            args.push('--with-hash');
        }
        if(true === params.allowRemove && !isFilesConfig){
            args.push('--allow-remove');
        }
        let label = (true === params.dryRun ? 'Sync preview (dry run)' : 'Sync')+' - '+configName;
        return {job: this.serializeStarted(this.jobRunner.start(label, 'run-sync.js', args))};
    }

    runMappingJob(params)
    {
        let index = Number(params.mapping);
        let found = this.mappingsConfig.findForRun(index, params.expectedFrom);
        if(found.error){
            return found;
        }
        let mappingLabel = 'mapping #'+(index+1)+' ('+found.mapping.from+')';
        let inspectArgs = ['--mapping='+(index+1)];
        if(true === params.withHash){
            inspectArgs.push('--with-hash');
        }
        if('inspect' === params.action || true === params.dryRun){
            return {job: this.serializeStarted(this.jobRunner.start('Inspection - '+mappingLabel, 'run-inspect-folders.js', inspectArgs))};
        }
        // like every backup: inspect first, then sync the generated file list only when something changed
        let job = this.jobRunner.start('Sync - '+mappingLabel+': inspection', 'run-inspect-folders.js', inspectArgs);
        if(job){
            this.chainedSync = {inspectionJobId: job.id, label: 'Sync - '+mappingLabel+': copying the changes'};
        }
        return {job: this.serializeStarted(job)};
    }

    startChainedSync(finishedJob)
    {
        if(!this.chainedSync || this.chainedSync.inspectionJobId !== finishedJob.id){
            return;
        }
        let chain = this.chainedSync;
        this.chainedSync = false;
        let fileConfig = finishedJob.outputFiles['File config'];
        if(0 !== finishedJob.exitCode || !fileConfig){
            console.log(0 !== finishedJob.exitCode ? 'The inspection failed, nothing synced.' : 'No changes found, nothing to sync.');
            return;
        }
        this.jobRunner.start(chain.label, 'run-sync.js', ['--config-files='+fileConfig]);
    }

    serializeStarted(job)
    {
        if(!job){
            return false;
        }
        return this.jobRunner.serialize(0);
    }

}

module.exports.BackupToolServer = BackupToolServer;
