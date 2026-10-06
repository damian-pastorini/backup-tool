/**
 * Schedule Planner
 *
 * Turns the schedule settings of configurations/inspect.config.js into the list of scheduled jobs. Used by the
 * scheduler to run them and by the web panel to show them. No dependencies, so the scheduler only needs Node.js.
 *
 * Rules:
 * - a mapping is only scheduled when the mapping is enabled and its own schedule is on (mapping.schedule.enabled);
 * - a scheduled mapping with its own cron runs on its own, its cron overrides the general one;
 * - a scheduled mapping without its own cron runs in the general job when the general schedule is on
 *   (settings.schedule.enabled), or on its own with the general cron when the general schedule is off.
 * Each job inspects its mappings and only syncs when the inspection finds changes (see lib/scheduler.js).
 */

const { CronExpression } = require('./cron-expression');

class SchedulePlanner
{

    plan(config)
    {
        let settings = config && config.settings ? config.settings : {};
        let general = settings.schedule || {};
        let generalCron = String(general.cron || '').trim();
        let isGeneralEnabled = true === general.enabled;
        let generalExpression = '' === generalCron ? false : new CronExpression(generalCron);
        let mappings = config && Array.isArray(config.mappings) ? config.mappings : [];
        let jobs = [];
        let warnings = [];
        let generalMappingIndexes = [];
        if(isGeneralEnabled && (!generalExpression || !generalExpression.isValid())){
            warnings.push('The general schedule is on, but its cron expression is '+(generalExpression ? 'invalid: '+generalExpression.error : 'empty.'));
        }
        for(let index = 0; index < mappings.length; index++){
            let mapping = mappings[index];
            let schedule = mapping.schedule || {};
            if(false === mapping.enabled || true !== schedule.enabled){
                continue;
            }
            let ownCron = String(schedule.cron || '').trim();
            if('' === ownCron && isGeneralEnabled){
                generalMappingIndexes.push(index);
                continue;
            }
            let cron = '' !== ownCron ? ownCron : generalCron;
            if('' === cron){
                warnings.push('Mapping #'+(index+1)+' is scheduled, but it has no cron expression and the general schedule has none either.');
                continue;
            }
            let expression = '' !== ownCron ? new CronExpression(ownCron) : generalExpression;
            if(!expression.isValid()){
                warnings.push('Mapping #'+(index+1)+' has an invalid cron expression: '+expression.error);
                continue;
            }
            jobs.push({
                key: 'mapping: '+this.mappingKey(mapping),
                name: 'mapping #'+(index+1),
                cron: cron,
                expression: expression,
                mappingIndexes: [index]
            });
        }
        if(isGeneralEnabled && generalExpression && generalExpression.isValid() && 0 < generalMappingIndexes.length){
            jobs.unshift({
                key: 'general',
                name: 'general schedule',
                cron: generalCron,
                expression: generalExpression,
                mappingIndexes: generalMappingIndexes
            });
        }
        return {jobs: jobs, warnings: warnings};
    }

    mappingKey(mapping)
    {
        // identifies a mapping across config edits, used to stop two jobs from running the same mapping at once:
        return String(mapping.from || '')+' -> '+(mapping.to || []).join(', ');
    }

    describeJobs(plan, mappings, now)
    {
        let described = [];
        for(let job of plan.jobs){
            let nextRun = job.expression.next(now || new Date());
            described.push({
                key: job.key,
                name: job.name,
                cron: job.cron,
                description: job.expression.describe(),
                mappingNumbers: job.mappingIndexes.map((index) => {
                    return index+1;
                }),
                mappingSources: job.mappingIndexes.map((index) => {
                    return mappings[index] ? mappings[index].from : '';
                }),
                nextRunAt: nextRun ? nextRun.toISOString() : ''
            });
        }
        return described;
    }

}

module.exports.SchedulePlanner = SchedulePlanner;
