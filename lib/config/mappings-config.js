/**
 * Mappings Config
 *
 * Loads, validates and saves the settings and the folder mappings of configurations/inspect.config.js for the web
 * panel editor. The file is rewritten as plain data on every save, so comments or custom formatting are not kept.
 */

const { FileHandler } = require('@reldens/server-utils');
const { MappingNormalizer } = require('./mapping-normalizer');
const { ConfigSettings } = require('./config-settings');

class MappingsConfig
{

    constructor(props)
    {
        this.configurationsPath = props.configurationsPath;
        this.filePath = FileHandler.joinPaths(this.configurationsPath, 'inspect.config.js');
        this.mappingNormalizer = new MappingNormalizer();
        this.configSettings = new ConfigSettings();
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

    loadForMapping(index, expectedFrom)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let indexError = this.validateIndex(loaded.mappings, index, expectedFrom);
        if(indexError){
            return {error: indexError};
        }
        return loaded;
    }

    fetchSettings()
    {
        let config = this.load();
        return this.configSettings.describe(config ? config.settings : {});
    }

    updateSettings(input)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let settingsError = this.configSettings.apply(loaded.settings, input);
        if(settingsError){
            return {error: settingsError};
        }
        return this.save(loaded, []);
    }

    setScheduleEnabled(index, expectedFrom, enabled)
    {
        let loaded = this.loadForMapping(index, expectedFrom);
        if(loaded.error){
            return loaded;
        }
        let schedule = loaded.mappings[index].schedule || {};
        loaded.mappings[index].schedule = {enabled: true === enabled, cron: String(schedule.cron || '')};
        return this.save(loaded, []);
    }

    setEnabled(index, expectedFrom, enabled)
    {
        let loaded = this.loadForMapping(index, expectedFrom);
        if(loaded.error){
            return loaded;
        }
        loaded.mappings[index].enabled = true === enabled;
        return this.save(loaded, []);
    }

    findForRun(index, expectedFrom)
    {
        let loaded = this.loadForMapping(index, expectedFrom);
        if(loaded.error){
            return loaded;
        }
        return {mapping: loaded.mappings[index]};
    }

    add(input)
    {
        let loaded = this.loadForEdit();
        if(loaded.error){
            return loaded;
        }
        let result = this.mappingNormalizer.normalize(input);
        if(result.error){
            return result;
        }
        let duplicateError = this.mappingNormalizer.findDuplicate(loaded.mappings, result.mapping, -1);
        if(duplicateError){
            return {error: duplicateError};
        }
        loaded.mappings.push(result.mapping);
        return this.save(loaded, result.warnings);
    }

    update(index, expectedFrom, input)
    {
        let loaded = this.loadForMapping(index, expectedFrom);
        if(loaded.error){
            return loaded;
        }
        let result = this.mappingNormalizer.normalize(input);
        if(result.error){
            return result;
        }
        let duplicateError = this.mappingNormalizer.findDuplicate(loaded.mappings, result.mapping, index);
        if(duplicateError){
            return {error: duplicateError};
        }
        loaded.mappings[index] = result.mapping;
        return this.save(loaded, result.warnings);
    }

    remove(index, expectedFrom)
    {
        let loaded = this.loadForMapping(index, expectedFrom);
        if(loaded.error){
            return loaded;
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
