/**
 * Config Settings
 *
 * The general settings of configurations/inspect.config.js shown and edited in the web panel: the modified time
 * threshold, the general schedule and the log retention.
 */

const { ModifiedTimeThreshold } = require('../common/modified-time-threshold');
const { LogRetention } = require('../scheduler/log-retention');
const { ScheduleNormalizer } = require('./schedule-normalizer');

class ConfigSettings
{

    constructor()
    {
        this.modifiedTimeThreshold = new ModifiedTimeThreshold();
        this.logRetention = new LogRetention({logsPath: ''});
        this.scheduleNormalizer = new ScheduleNormalizer();
        this.maxModifiedTimeThresholdMs = 3600000;
        this.maxKeepDays = 3650;
    }

    describe(settings)
    {
        let configured = this.modifiedTimeThreshold.fromSettings(settings);
        let schedule = settings.schedule || {};
        return {
            modifiedTimeThresholdMs: null !== configured ? configured : this.modifiedTimeThreshold.defaultMs,
            isDefaultThreshold: null === configured,
            schedule: {enabled: true === schedule.enabled, cron: String(schedule.cron || '')},
            logs: this.logRetention.resolve(settings)
        };
    }

    apply(settings, input)
    {
        if(undefined !== input.modifiedTimeThresholdMs){
            let thresholdMs = Number(input.modifiedTimeThresholdMs);
            if(!Number.isFinite(thresholdMs) || 0 > thresholdMs || this.maxModifiedTimeThresholdMs < thresholdMs){
                return 'The time tolerance must be between 0 and 3600 seconds.';
            }
            settings.modifiedTimeThresholdMs = Math.round(thresholdMs);
        }
        if(input.schedule && 'object' === typeof input.schedule){
            let schedule = this.scheduleNormalizer.normalize(input.schedule, 'The general schedule');
            if(schedule.error){
                return schedule.error;
            }
            if(schedule.enabled && '' === schedule.cron){
                return 'The general schedule is on but has no cron expression, set one or turn it off.';
            }
            settings.schedule = {enabled: schedule.enabled, cron: schedule.cron};
        }
        if(input.logs && 'object' === typeof input.logs){
            let keepDays = Number(input.logs.keepDays);
            if(!Number.isInteger(keepDays) || 1 > keepDays || this.maxKeepDays < keepDays){
                return 'Logs must be kept between 1 and '+this.maxKeepDays+' days.';
            }
            settings.logs = {removeOldLogs: false !== input.logs.removeOldLogs, keepDays: keepDays};
        }
        return '';
    }

}

module.exports.ConfigSettings = ConfigSettings;
