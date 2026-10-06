/**
 * Inspection Log Writer
 *
 * Writes logs/inspect-folders-YYYYMMDD-HHMMSS.log: the run options in the header, then the hash errors and every
 * folder with changes. No dependencies.
 */

const path = require('path');
const { DateStamp } = require('../common/date-stamp');
const { LogLines } = require('../scripts/log-lines');
const { UniqueFileWriter } = require('../scripts/unique-file-writer');

class InspectionLogWriter
{

    constructor(props)
    {
        this.logsPath = props.logsPath;
        this.dateStamp = new DateStamp();
        this.fileWriter = new UniqueFileWriter();
    }

    async write(header, hashErrors, folderChanges, mappings)
    {
        let now = new Date();
        let log = new LogLines();
        log.push('=== FOLDER INSPECTION LOG ===');
        log.push('Timestamp: '+now.toISOString());
        if('' !== header.triggeredBy){
            log.push('Triggered By: '+header.triggeredBy);
        }
        log.push('Hash Enabled: '+(header.withHash ? 'YES' : 'NO'));
        log.push('Modified Time Threshold: '+header.modifiedTimeThresholdMs.toString()+'ms');
        log.push('Mappings: '+header.scopeDescription);
        if(header.interrupted){
            log.push('Status: INTERRUPTED');
        }
        log.push('');
        log.pushHashErrors(hashErrors);
        if(0 === folderChanges.size){
            log.push('No changes detected.');
        }
        if(0 < folderChanges.size){
            log.push('--- FOLDERS WITH CHANGES ('+folderChanges.size.toString()+') ---');
            log.push('');
            let sortedKeys = Array.from(folderChanges.keys()).sort();
            for(let key of sortedKeys){
                this.pushFolderChange(log, folderChanges.get(key), mappings);
            }
        }
        log.push('=== END LOG ===');
        try{
            let baseName = 'inspect-folders-'+this.dateStamp.compact(now);
            let logFile = await this.fileWriter.write(this.logsPath, baseName, '.log', log.text());
            console.log('Log file: '+logFile);
            return logFile;
        }catch(e){
            console.log('Failed to write log file: '+e.message);
            return false;
        }
    }

    pushFolderChange(log, change, mappings)
    {
        let mapping = mappings[change.mappingIndex];
        let dest = mapping.to[change.destIndex];
        log.push('Folder: '+change.folder);
        log.push('From: '+path.join(mapping.from, change.folder));
        log.push('To: '+path.join(dest, change.folder));
        if(0 < change.new.length){
            log.push('New files ('+change.new.length.toString()+'): '+change.new.join(', '));
        }
        if(0 < change.modified.length){
            log.push('Modified files ('+change.modified.length.toString()+'): '+change.modified.join(', '));
        }
        if(0 < change.missing.length){
            log.push('Missing in source ('+change.missing.length.toString()+'): '+change.missing.join(', '));
        }
        log.push('');
    }

}

module.exports.InspectionLogWriter = InspectionLogWriter;
