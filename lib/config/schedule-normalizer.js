/**
 * Schedule Normalizer
 *
 * Validates a schedule ({enabled, cron}) edited in the web panel: the cron expression is optional, but must be valid.
 */

const { CronExpression } = require('../scheduler/cron-expression');

class ScheduleNormalizer
{

    normalize(input, label)
    {
        let schedule = input && 'object' === typeof input ? input : {};
        let cron = String(schedule.cron || '').trim().replace(/\s+/g, ' ');
        if('' !== cron){
            let expression = new CronExpression(cron);
            if(!expression.isValid()){
                return {error: label+': '+expression.error};
            }
        }
        return {enabled: true === schedule.enabled, cron: cron};
    }

}

module.exports.ScheduleNormalizer = ScheduleNormalizer;
