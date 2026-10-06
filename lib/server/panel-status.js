/**
 * Panel Status
 *
 * Everything the web panel shows, in one response: the running job, the settings, the mappings and which scheduled
 * job runs each one, the scheduler state, the configs and the logs.
 */

class PanelStatus
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.projectFiles = props.projectFiles;
        this.mappingsConfig = props.mappingsConfig;
        this.schedulePlanner = props.schedulePlanner;
        this.jobRunner = props.jobRunner;
        this.scheduler = props.scheduler;
    }

    fetch()
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

}

module.exports.PanelStatus = PanelStatus;
