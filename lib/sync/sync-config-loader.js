/**
 * Sync Config Loader
 *
 * Finds and reads the config of run-sync.js: a folder config ({settings, mappings}), a generated file list
 * ({settings, files: {source: destinations}}) or an older file list (only the source to destinations object).
 * load() returns {error} or {nothingToDo} when the script must stop. No dependencies.
 */

const fs = require('fs');
const path = require('path');

class SyncConfigLoader
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
    }

    resolve(configFile)
    {
        if(configFile){
            return {path: this.resolvePath(configFile.name), isFileMode: configFile.isFileList};
        }
        let syncConfigFiles = path.join(this.rootPath, 'configurations', 'sync-config-files.js');
        if(fs.existsSync(syncConfigFiles)){
            return {path: syncConfigFiles, isFileMode: true};
        }
        return {path: path.join(this.rootPath, 'configurations', 'sync.config.js'), isFileMode: false};
    }

    resolvePath(configFile)
    {
        let fromCurrentFolder = path.resolve(this.rootPath, configFile);
        if(fs.existsSync(fromCurrentFolder)){
            return fromCurrentFolder;
        }
        let fromConfigurationsFolder = path.join(this.rootPath, 'configurations', configFile);
        if(fs.existsSync(fromConfigurationsFolder)){
            return fromConfigurationsFolder;
        }
        return fromCurrentFolder;
    }

    load(configPath, selection)
    {
        if(!fs.existsSync(configPath)){
            return {error: 'Config file not found: '+configPath};
        }
        let config = require(configPath);
        let settings = config.settings || {};
        if(config.mappings){
            return this.selectMappings(config.mappings || [], settings, selection);
        }
        if(selection.isExplicit()){
            return {error: '--mapping only works with a folder config that has "mappings", not with a file list.'};
        }
        // generated file lists are {settings, files: {source: destinations}}, older ones are only that object:
        let fileMap = config.files && 'object' === typeof config.files ? config.files : config;
        let mappings = [];
        for(let srcPath of Object.keys(fileMap)){
            if(fileMap === config && 'settings' === srcPath){
                continue;
            }
            let dstPaths = fileMap[srcPath];
            mappings.push({
                from: srcPath,
                to: Array.isArray(dstPaths) ? dstPaths : [dstPaths]
            });
        }
        if(0 === mappings.length){
            return {nothingToDo: 'No mappings found. Nothing to sync.'};
        }
        return {settings: settings, mappings: mappings, scopeDescription: ''};
    }

    selectMappings(allMappings, settings, selection)
    {
        if(0 === allMappings.length){
            return {nothingToDo: 'No mappings found. Nothing to sync.'};
        }
        let missingError = selection.findMissing(allMappings);
        if('' !== missingError){
            return {error: missingError};
        }
        let selected = [];
        for(let i = 0; i < allMappings.length; i++){
            if(selection.isIncluded(i, allMappings[i])){
                selected.push(allMappings[i]);
                continue;
            }
            if(!selection.isExplicit()){
                console.log('Skipping disabled mapping #'+(i+1)+': '+allMappings[i].from);
            }
        }
        if(0 === selected.length){
            return {nothingToDo: 'All mappings are disabled. Nothing to sync.'};
        }
        return {settings: settings, mappings: selected, scopeDescription: selection.describe(allMappings)};
    }

}

module.exports.SyncConfigLoader = SyncConfigLoader;
