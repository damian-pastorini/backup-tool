/**
 * Backup Tool Server
 *
 * Local web panel to check the backup status and configs, and to run the inspect and sync scripts. The same process
 * runs the scheduled backups (lib/scheduler/scheduler.js), which re-reads the config every minute, so schedule
 * changes never need a restart.
 * Not secured: it only listens on 127.0.0.1 by default.
 * Default port 9977, an uncommon one so it doesn't clash with other local development servers.
 */

const http = require('http');
const { AppServerFactory, FileHandler } = require('@reldens/server-utils');
const { StopSignalListener } = require('../common/stop-signal-listener');
const { MappingsConfig } = require('../config/mappings-config');
const { SchedulePlanner } = require('../scheduler/schedule-planner');
const { Scheduler } = require('../scheduler/scheduler');
const { ProjectFiles } = require('./project-files');
const { JobRunner } = require('./job-runner');
const { FolderBrowser } = require('./folder-browser');
const { PanelJobs } = require('./panel-jobs');
const { PanelStatus } = require('./panel-status');
const { ApiRoutes } = require('./api-routes');
const { BrowserOpener } = require('./browser-opener');

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
        this.isShuttingDown = false;
        this.projectFiles = new ProjectFiles({rootPath: this.rootPath});
        this.mappingsConfig = new MappingsConfig({configurationsPath: this.projectFiles.configurationsPath});
        this.schedulePlanner = new SchedulePlanner();
        this.scheduler = new Scheduler({
            rootPath: this.rootPath,
            externalBusyCheck: (mappingKey) => {
                return this.panelJobs.findPanelJobFor(mappingKey);
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
        this.panelJobs = new PanelJobs({
            jobRunner: this.jobRunner,
            scheduler: this.scheduler,
            mappingsConfig: this.mappingsConfig,
            projectFiles: this.projectFiles,
            schedulePlanner: this.schedulePlanner
        });
        this.apiRoutes = new ApiRoutes({
            projectFiles: this.projectFiles,
            mappingsConfig: this.mappingsConfig,
            folderBrowser: new FolderBrowser(),
            jobRunner: this.jobRunner,
            panelJobs: this.panelJobs,
            panelStatus: new PanelStatus({
                rootPath: this.rootPath,
                projectFiles: this.projectFiles,
                mappingsConfig: this.mappingsConfig,
                schedulePlanner: this.schedulePlanner,
                jobRunner: this.jobRunner,
                scheduler: this.scheduler
            }),
            onShutdown: () => {
                this.shutdown();
            }
        });
        this.stopSignalListener = new StopSignalListener();
        this.browserOpener = new BrowserOpener();
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
        this.apiRoutes.register(this.app);
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
            // Ctrl+C, and on Windows closing the console window (SIGHUP); the job scripts get the same signal and save their logs
            this.stopSignalListener.listen(() => {
                return this.shutdown();
            });
            this.scheduler.start();
            console.log('Waiting for jobs...');
            if(this.openOnStart){
                this.browserOpener.open(this.url());
            }
        });
        return true;
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
        this.panelJobs.handleFinished(job);
        if(!this.jobRunner.isRunning()){
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
                this.browserOpener.open(this.url());
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

}

module.exports.BackupToolServer = BackupToolServer;
