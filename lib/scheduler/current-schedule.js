/**
 * Current Schedule
 *
 * Re-reads configurations/inspect.config.js and plans the scheduled jobs (lib/scheduler/schedule-planner.js). When the
 * config can't be read, the previous plan is kept. Logs the plan and the warnings when they change.
 */

const { SchedulePlanner } = require('./schedule-planner');

class CurrentSchedule
{

    constructor(props)
    {
        this.configPath = props.configPath;
        this.logger = props.logger;
        this.planner = new SchedulePlanner();
        this.config = {settings: {}, mappings: []};
        this.plan = {jobs: [], warnings: []};
        this.planSignature = '';
        this.warningsText = '';
        this.configError = '';
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
                this.logger.log('The config can be read again.');
            }
            this.configError = '';
            return config;
        }catch(error){
            let message = 'Could not read '+this.configPath+': '+error.message
                +(0 < this.plan.jobs.length ? ' (the previous schedule is kept)' : '');
            if(message !== this.configError){
                this.logger.log(message);
            }
            this.configError = message;
            return false;
        }
    }

    refresh(now)
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
                this.logger.log('Warning: '+warning);
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
            this.logger.log('No scheduled jobs. Turn on the general schedule or a mapping\'s schedule in the web panel.');
            return;
        }
        this.logger.log('Scheduled jobs:');
        for(let job of this.describeJobs(now)){
            let nextRun = job.nextRunAt ? this.logger.formatTime(new Date(job.nextRunAt)) : 'never';
            this.logger.log('  '+job.name+' ['+job.cron+'] '+job.description+', mappings #'+job.mappingNumbers.join(', #')+', next run '+nextRun);
        }
    }

    describeJobs(now)
    {
        return this.planner.describeJobs(this.plan, this.config.mappings || [], now);
    }

    mappingKey(index)
    {
        return this.planner.mappingKey(this.config.mappings[index]);
    }

}

module.exports.CurrentSchedule = CurrentSchedule;
