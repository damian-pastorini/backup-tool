/**
 * Modified Time Threshold
 *
 * How much newer a source file must be than its copy to count as changed: the --modified-time-threshold option,
 * then settings.modifiedTimeThresholdMs from the config, then 2 seconds. No dependencies.
 */

class ModifiedTimeThreshold
{

    constructor()
    {
        // FAT32 and exFAT copies made by other tools often keep the modified time with 2 second precision:
        this.defaultMs = 2000;
        this.pattern = /^(\d+(?:\.\d+)?)(ms|s)?$/;
    }

    parse(value)
    {
        let match = this.pattern.exec(String(value).trim());
        if(!match){
            return false;
        }
        return Math.round(Number(match[1])*('s' === match[2] ? 1000 : 1));
    }

    fromSettings(settings)
    {
        let configured = Number(settings.modifiedTimeThresholdMs);
        if(undefined !== settings.modifiedTimeThresholdMs && Number.isFinite(configured) && 0 <= configured){
            return Math.round(configured);
        }
        return null;
    }

    resolve(optionValue, settings)
    {
        if(null !== optionValue){
            return optionValue;
        }
        let configured = this.fromSettings(settings);
        if(null !== configured){
            return configured;
        }
        return this.defaultMs;
    }

}

module.exports.ModifiedTimeThreshold = ModifiedTimeThreshold;
