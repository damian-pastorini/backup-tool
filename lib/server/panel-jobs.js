/**
 * Panel Jobs
 *
 * Starts the inspections and syncs requested from the web panel (one at a time, with the JobRunner). A sync of a
 * mapping always inspects first and only syncs the generated file list when something changed. A mapping is never
 * run by the panel and the schedule at the same time.
 */

const { FileHandler } = require('@reldens/server-utils');

class PanelJobs
{

    constructor(props)
    {
        this.jobRunner = props.jobRunner;
        this.scheduler = props.scheduler;
        this.mappingsConfig = props.mappingsConfig;
        this.projectFiles = props.projectFiles;
        this.schedulePlanner = props.schedulePlanner;
        this.chainedSync = false;
        // mappings the current panel job works on, so the scheduler skips them and the panel refuses scheduled ones:
        this.panelJobMappingKeys = new Set();
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
            let runLabel = this.scheduler.findRunningLabel(key);
            if(runLabel){
                return 'The schedule is running '+key+' right now ('+runLabel+'), try again when it finishes.';
            }
        }
        return '';
    }

    run(params)
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
        return this.runConfigSync(params);
    }

    runConfigSync(params)
    {
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

    handleFinished(finishedJob)
    {
        this.startChainedSync(finishedJob);
        if(!this.jobRunner.isRunning()){
            this.panelJobMappingKeys = new Set();
        }
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

module.exports.PanelJobs = PanelJobs;
