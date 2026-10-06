/**
 * Mappings Config
 *
 * Loads, validates and saves the settings and the folder mappings of configurations/inspect.config.js for the web
 * panel editor. The file is rewritten as plain data on every save, so comments or custom formatting are not kept.
 */

const path = require('path');
const { FileHandler } = require('@reldens/server-utils');
const { CronExpression } = require('./cron-expression');
const { LogRetention } = require('./log-retention');

class MappingsConfig
{

    constructor(props)
    {
        this.configurationsPath = props.configurationsPath;
        this.filePath = FileHandler.joinPaths(this.configurationsPath, 'inspect.config.js');
        this.invalidNamePattern = /[<>:"|?*]/;
        this.defaultModifiedTimeThresholdMs = 2000;
        this.maxModifiedTimeThresholdMs = 3600000;
        this.maxKeepDays = 3650;
        this.logRetention = new LogRetention({logsPath: ''});
    }

    load()
    {
        if(!FileHandler.exists(this.filePath)){
            return {settings: {}, mappings: []};
        }
        try{
            delete require.cache[require.resolve(this.filePath)];
            let config = require(this.filePath);
            if(!config || !Array.isArray(config.mappings)){
                return false;
            }
            let settings = config.settings && 'object' === typeof config.settings ? config.settings : {};
            return {settings: Object.assign({}, settings), mappings: config.mappings};
        }catch(error){
            return false;
        }
    }

    loadForEdit()
    {
        let config = this.load();
        if(false === config){
            return {error: 'configurations/inspect.config.js could not be read, fix it by hand before editing it here.'};
        }
        return config;
    }

    fetchSettings()
    {
        let config = this.load();
        let settings = config ? config.settings : {};
        let configured = Number(settings.modifiedTimeThresholdMs);
        let isConfigured = undefined !== settings.modifiedTimeThresholdMs && Number.isFinite(configured) && 0 <= configured;
        let schedule = settings.schedule || {};
        return {
            modifiedTimeThresholdMs: isConfigured ? Math.round(configured) : this.defaultModifiedTimeThresholdMs,
            isDefaultThreshold: !isConfigured,
            schedule: {enabled: true === schedule.enabled, cron: String(schedule.cron || '')},
            logs: this.logRetention.resolve(settings)
        };
    }

    updateSettings(input)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        if(undefined !== input.modifiedTimeThresholdMs){
            let thresholdMs = Number(input.modifiedTimeThresholdMs);
            if(!Number.isFinite(thresholdMs) || 0 > thresholdMs || this.maxModifiedTimeThresholdMs < thresholdMs){
                return {error: 'The time tolerance must be between 0 and 3600 seconds.'};
            }
            loaded.settings.modifiedTimeThresholdMs = Math.round(thresholdMs);
        }
        if(input.schedule && 'object' === typeof input.schedule){
            let schedule = this.normalizeSchedule(input.schedule, 'The general schedule');
            if(schedule.error){
                return schedule;
            }
            if(schedule.enabled && '' === schedule.cron){
                return {error: 'The general schedule is on but has no cron expression, set one or turn it off.'};
            }
            loaded.settings.schedule = {enabled: schedule.enabled, cron: schedule.cron};
        }
        if(input.logs && 'object' === typeof input.logs){
            let keepDays = Number(input.logs.keepDays);
            if(!Number.isInteger(keepDays) || 1 > keepDays || this.maxKeepDays < keepDays){
                return {error: 'Logs must be kept between 1 and '+this.maxKeepDays+' days.'};
            }
            loaded.settings.logs = {removeOldLogs: false !== input.logs.removeOldLogs, keepDays: keepDays};
        }
        return this.save(loaded, []);
    }

    normalizeSchedule(input, label)
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

    setScheduleEnabled(index, expectedFrom, enabled)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        let schedule = loaded.mappings[index].schedule || {};
        loaded.mappings[index].schedule = {enabled: true === enabled, cron: String(schedule.cron || '')};
        return this.save(loaded, []);
    }

    setEnabled(index, expectedFrom, enabled)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        loaded.mappings[index].enabled = true === enabled;
        return this.save(loaded, []);
    }

    findForRun(index, expectedFrom)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        return {mapping: loaded.mappings[index]};
    }

    add(input)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let result = this.normalize(input);
        if(result.error){
            return result;
        }
        let duplicateError = this.findDuplicate(loaded.mappings, result.mapping, -1);
        if(duplicateError){
            return {error: duplicateError};
        }
        loaded.mappings.push(result.mapping);
        return this.save(loaded, result.warnings);
    }

    update(index, expectedFrom, input)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        let result = this.normalize(input);
        if(result.error){
            return result;
        }
        let duplicateError = this.findDuplicate(loaded.mappings, result.mapping, index);
        if(duplicateError){
            return {error: duplicateError};
        }
        loaded.mappings[index] = result.mapping;
        return this.save(loaded, result.warnings);
    }

    remove(index, expectedFrom)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        loaded.mappings.splice(index, 1);
        return this.save(loaded, []);
    }

    validateIndex(mappings, index, expectedFrom)
    {
        if(!Number.isInteger(index) || 0 > index || mappings.length <= index){
            return 'That mapping does not exist anymore, refresh the page.';
        }
        // protects against editing the wrong entry when the file changed after the page was loaded:
        if(mappings[index].from !== expectedFrom){
            return 'The mappings changed since the page was loaded, refresh the page and try again.';
        }
        return '';
    }

    normalize(input)
    {
        let warnings = [];
        let from = this.normalizePath(input.from);
        let fromError = this.validatePath(from, 'Source folder');
        if(fromError){
            return {error: fromError};
        }
        if(!FileHandler.isFolder(from)){
            warnings.push('Source folder not found right now: '+from);
        }
        let to = [];
        for(let destination of this.toList(input.to)){
            let normalizedDestination = this.normalizePath(destination);
            let destinationError = this.validatePath(normalizedDestination, 'Destination folder');
            if(destinationError){
                return {error: destinationError};
            }
            if(this.isSameOrInside(normalizedDestination, from)){
                return {error: 'The destination '+normalizedDestination+' is the source folder or inside it.'};
            }
            if(this.isSameOrInside(from, normalizedDestination)){
                return {error: 'The source folder is inside the destination '+normalizedDestination+'.'};
            }
            if(this.containsPath(to, normalizedDestination)){
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
        let schedule = this.normalizeSchedule(input.schedule, 'The mapping schedule');
        if(schedule.error){
            return schedule;
        }
        return {
            warnings: warnings,
            mapping: {
                from: from,
                to: to,
                enabled: false !== input.enabled,
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

    normalizePath(value)
    {
        let trimmed = String(value || '').trim();
        if('' === trimmed){
            return '';
        }
        let normalized = path.normalize(trimmed);
        // keep "D:\" and "\\server\share" roots, drop any other trailing separator:
        while(3 < normalized.length && /[\\/]$/.test(normalized) && path.parse(normalized).root !== normalized){
            normalized = normalized.substring(0, normalized.length-1);
        }
        return normalized;
    }

    validatePath(value, label)
    {
        if('' === value){
            return label+' is required.';
        }
        if(!path.isAbsolute(value) || /^[a-zA-Z]:[^\\/]/.test(value)){
            return label+' must be a full path, like D:\\folder or \\\\server\\share: '+value;
        }
        let withoutDrive = value.replace(/^[a-zA-Z]:/, '');
        if(this.invalidNamePattern.test(withoutDrive)){
            return label+' contains characters Windows does not allow (< > : " | ? *): '+value;
        }
        return '';
    }

    isSameOrInside(childPath, parentPath)
    {
        let relative = path.relative(parentPath, childPath);
        if('' === relative){
            return true;
        }
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    containsPath(list, value)
    {
        for(let item of list){
            if('' === path.relative(item, value)){
                return true;
            }
        }
        return false;
    }

    findDuplicate(mappings, mapping, skipIndex)
    {
        for(let i = 0; i < mappings.length; i++){
            if(i === skipIndex || '' !== path.relative(mappings[i].from || '', mapping.from)){
                continue;
            }
            for(let destination of mapping.to){
                if(this.containsPath(mappings[i].to || [], destination)){
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

    save(config, warnings)
    {
        if(!FileHandler.createFolder(this.configurationsPath)){
            return {error: 'Could not create the configurations folder: '+FileHandler.error.message};
        }
        let content = '/**\n * Backup settings and folder mappings, edited from the Backup Tool web panel.\n */\n\n'
            +'module.exports = {\n    settings: '+this.indentJson(config.settings || {})
            +',\n    mappings: '+this.indentJson(config.mappings)+'\n};\n';
        if(!FileHandler.writeFile(this.filePath, content)){
            return {error: 'Could not save configurations/inspect.config.js: '+FileHandler.error.message};
        }
        let saved = this.load();
        if(false === saved || saved.mappings.length !== config.mappings.length){
            return {error: 'The saved configurations/inspect.config.js could not be read back, check the file.'};
        }
        return {settings: saved.settings, mappings: saved.mappings, warnings: warnings};
    }

    indentJson(value)
    {
        return JSON.stringify(value, null, 4).replace(/\n/g, '\n    ');
    }

}

module.exports.MappingsConfig = MappingsConfig;
