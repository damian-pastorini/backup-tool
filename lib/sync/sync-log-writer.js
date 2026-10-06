/**
 * Sync Log Writer
 *
 * Writes logs/sync-YYYYMMDD-HHMMSS.log: the run options in the header, then the hash errors, the files already in
 * sync, copied and removed, and the errors. No dependencies.
 */

const path = require('path');
const { DateStamp } = require('../common/date-stamp');
const { LogLines } = require('../scripts/log-lines');
const { UniqueFileWriter } = require('../scripts/unique-file-writer');

class SyncLogWriter
{

    constructor(props)
    {
        this.logsPath = props.logsPath;
        this.dateStamp = new DateStamp();
        this.fileWriter = new UniqueFileWriter();
    }

    async write(header, results)
    {
        let now = new Date();
        let log = new LogLines();
        log.push('=== SYNC LOG ===');
        log.push('Timestamp: '+now.toISOString());
        if('' !== header.triggeredBy){
            log.push('Triggered By: '+header.triggeredBy);
        }
        log.push('Config: '+path.basename(header.configPath));
        log.push('Dry Run: '+(header.dryRun ? 'YES' : 'NO'));
        log.push('Allow Remove: '+(header.allowRemove ? 'YES' : 'NO'));
        log.push('Hash Enabled: '+(header.withHash ? 'YES' : 'NO'));
        log.push('Modified Time Threshold: '+header.modifiedTimeThresholdMs.toString()+'ms');
        if('' !== header.scopeDescription){
            log.push('Mappings: '+header.scopeDescription);
        }
        if(header.interrupted){
            log.push('Status: INTERRUPTED');
        }
        log.push('');
        log.pushHashErrors(results.hashErrors);
        log.pushSection('ALREADY SYNCED FILES', results.alreadySyncedFiles, (item) => {
            return 'OK | '+item.rel+' | '+item.src+' -> '+item.dst;
        });
        log.pushSection('UPDATED FILES', results.syncedFiles, (item) => {
            return 'SYNC | '+item.rel+' | '+item.src+' -> '+item.dst;
        });
        log.pushSection('REMOVED FILES', results.removedFiles, (item) => {
            return 'RM | '+item.rel+' | '+item.path;
        });
        log.pushSection('ERRORS', results.errors, (err) => {
            return this.formatError(err);
        });
        log.push('=== END LOG ===');
        try{
            let baseName = 'sync-'+this.dateStamp.compact(now);
            let logFile = await this.fileWriter.write(this.logsPath, baseName, '.log', log.text());
            console.log('Log file: '+logFile);
            return logFile;
        }catch(e){
            console.log('Failed to write log file: '+e.message);
            return false;
        }
    }

    formatError(err)
    {
        let parts = [];
        parts.push('action='+(err.action || ''));
        if(err.src){
            parts.push('src='+err.src);
        }
        if(err.dst){
            parts.push('dst='+err.dst);
        }
        if(err.path){
            parts.push('path='+err.path);
        }
        parts.push('message='+(err.message || ''));
        return parts.join(' | ');
    }

}

module.exports.SyncLogWriter = SyncLogWriter;
