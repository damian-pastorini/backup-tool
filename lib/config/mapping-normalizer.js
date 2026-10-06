/**
 * Mapping Normalizer
 *
 * Validates a folder mapping edited in the web panel and returns it in the format saved in the config, with warnings
 * for folders that don't exist right now.
 */

const path = require('path');
const { FileHandler } = require('@reldens/server-utils');
const { FolderPathRules } = require('./folder-path-rules');
const { ScheduleNormalizer } = require('./schedule-normalizer');

class MappingNormalizer
{

    constructor()
    {
        this.pathRules = new FolderPathRules();
        this.scheduleNormalizer = new ScheduleNormalizer();
    }

    normalize(input)
    {
        let warnings = [];
        let from = this.pathRules.normalize(input.from);
        let fromError = this.pathRules.validate(from, 'Source folder');
        if(fromError){
            return {error: fromError};
        }
        if(!FileHandler.isFolder(from)){
            warnings.push('Source folder not found right now: '+from);
        }
        let to = [];
        for(let destination of this.toList(input.to)){
            let normalizedDestination = this.pathRules.normalize(destination);
            let destinationError = this.pathRules.validate(normalizedDestination, 'Destination folder');
            if(destinationError){
                return {error: destinationError};
            }
            if(this.pathRules.isSameOrInside(normalizedDestination, from)){
                return {error: 'The destination '+normalizedDestination+' is the source folder or inside it.'};
            }
            if(this.pathRules.isSameOrInside(from, normalizedDestination)){
                return {error: 'The source folder is inside the destination '+normalizedDestination+'.'};
            }
            if(this.pathRules.contains(to, normalizedDestination)){
                continue;
            }
            if(!FileHandler.isFolder(normalizedDestination)){
                warnings.push(
                    'Destination not found right now: '+normalizedDestination
                    +' (the inspection skips missing destinations, create it first).'
                );
            }
            to.push(normalizedDestination);
        }
        if(0 === to.length){
            return {error: 'Add at least one destination folder.'};
        }
        let maxSizeBytes = Number(input.maxSizeBytes || 0);
        if(!Number.isFinite(maxSizeBytes) || 0 > maxSizeBytes){
            return {error: 'The maximum file size must be 0 (no limit) or a positive number.'};
        }
        let schedule = this.scheduleNormalizer.normalize(input.schedule, 'The mapping schedule');
        if(schedule.error){
            return schedule;
        }
        return {
            warnings: warnings,
            mapping: {
                from: from,
                to: to,
                enabled: false !== input.enabled,
                allowRemove: true === input.allowRemove,
                schedule: schedule,
                includeExtensions: this.normalizeExtensions(input.includeExtensions),
                excludeExtensions: this.normalizeExtensions(input.excludeExtensions),
                maxSizeBytes: Math.round(maxSizeBytes),
                excludeHidden: true === input.excludeHidden,
                excludeSystem: true === input.excludeSystem,
                excludeNames: this.uniqueList(this.toList(input.excludeNames))
            }
        };
    }

    findDuplicate(mappings, mapping, skipIndex)
    {
        for(let i = 0; i < mappings.length; i++){
            if(i === skipIndex || '' !== path.relative(mappings[i].from || '', mapping.from)){
                continue;
            }
            for(let destination of mapping.to){
                if(this.pathRules.contains(mappings[i].to || [], destination)){
                    return 'Another mapping already copies '+mapping.from+' to '+destination+'.';
                }
            }
        }
        return '';
    }

    toList(value)
    {
        if(Array.isArray(value)){
            return value.map((item) => {
                return String(item || '').trim();
            }).filter((item) => {
                return '' !== item;
            });
        }
        return String(value || '').split(',').map((item) => {
            return item.trim();
        }).filter((item) => {
            return '' !== item;
        });
    }

    normalizeExtensions(value)
    {
        let extensions = this.toList(value).map((extension) => {
            let lower = extension.toLowerCase();
            return '.' === lower.charAt(0) ? lower : '.'+lower;
        });
        return this.uniqueList(extensions);
    }

    uniqueList(list)
    {
        let unique = [];
        for(let item of list){
            if(-1 === unique.indexOf(item)){
                unique.push(item);
            }
        }
        return unique;
    }

}

module.exports.MappingNormalizer = MappingNormalizer;
