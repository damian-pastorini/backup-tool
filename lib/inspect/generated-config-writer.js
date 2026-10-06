/**
 * Generated Config Writer
 *
 * Writes the sync configs of an inspection to the "configurations" folder:
 * - [TIMESTAMP]-sync.config.js: the folders with changes ({settings, mappings})
 * - [TIMESTAMP]-sync-config-files.js: the changed files ({settings, files: {source: [destinations]}})
 * No dependencies.
 */

const path = require('path');
const { DateStamp } = require('../common/date-stamp');
const { UniqueFileWriter } = require('../scripts/unique-file-writer');

class GeneratedConfigWriter
{

    constructor(props)
    {
        this.configurationsPath = props.configurationsPath;
        this.dateStamp = new DateStamp();
        this.fileWriter = new UniqueFileWriter();
    }

    async writeFolderConfig(folderChanges, mappings, settings)
    {
        if(0 === folderChanges.size){
            return false;
        }
        let stamp = this.dateStamp.dashed(new Date());
        let newMappings = [];
        for(let change of folderChanges.values()){
            newMappings.push(this.folderMapping(mappings[change.mappingIndex], change));
        }
        let configContent = 'module.exports = {\n    settings: '+this.indentJson(settings)
            +',\n    mappings: '+this.indentJson(newMappings)+'\n};\n';
        try{
            let configFile = await this.fileWriter.write(this.configurationsPath, stamp, '-sync.config.js', configContent);
            console.log('Folder config: '+configFile);
            return configFile;
        }catch(e){
            console.log('Failed to write folder config: '+e.message);
            return false;
        }
    }

    folderMapping(mapping, change)
    {
        let dest = mapping.to[change.destIndex];
        let folderPath = change.folder;
        if('/' === folderPath){
            folderPath = '';
        }
        let newMapping = {
            from: path.join(mapping.from, folderPath),
            to: [path.join(dest, folderPath)]
        };
        if(mapping.includeExtensions){
            newMapping.includeExtensions = mapping.includeExtensions;
        }
        if(mapping.excludeExtensions){
            newMapping.excludeExtensions = mapping.excludeExtensions;
        }
        if(mapping.maxSizeBytes){
            newMapping.maxSizeBytes = mapping.maxSizeBytes;
        }
        if(mapping.excludeHidden){
            newMapping.excludeHidden = mapping.excludeHidden;
        }
        if(mapping.excludeSystem){
            newMapping.excludeSystem = mapping.excludeSystem;
        }
        if(mapping.excludeNames){
            newMapping.excludeNames = mapping.excludeNames;
        }
        return newMapping;
    }

    async writeFileConfig(changedFiles, settings)
    {
        if(0 === changedFiles.length){
            return false;
        }
        let stamp = this.dateStamp.dashed(new Date());
        let fileMap = {};
        for(let file of changedFiles){
            if(!fileMap[file.srcPath]){
                fileMap[file.srcPath] = [];
            }
            fileMap[file.srcPath].push(file.dstPath);
        }
        let configContent = 'module.exports = {\n    settings: '+this.indentJson(settings)
            +',\n    files: '+this.indentJson(fileMap)+'\n};\n';
        try{
            let configFile = await this.fileWriter.write(this.configurationsPath, stamp, '-sync-config-files.js', configContent);
            console.log('File config: '+configFile);
            return configFile;
        }catch(e){
            console.log('Failed to write file config: '+e.message);
            return false;
        }
    }

    indentJson(value)
    {
        return JSON.stringify(value, null, 4).replace(/\n/g, '\n    ');
    }

}

module.exports.GeneratedConfigWriter = GeneratedConfigWriter;
