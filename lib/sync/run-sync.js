/**
 * Run Sync
 *
 * The run-sync.js script: reads the options and the config, syncs every selected mapping to its destinations and
 * writes the log. See run-sync.js for the options and the config formats. No dependencies.
 */

const fs = require('fs');
const path = require('path');
const { StopSignalListener } = require('../common/stop-signal-listener');
const { ModifiedTimeThreshold } = require('../common/modified-time-threshold');
const { ScriptArguments } = require('../scripts/script-arguments');
const { MappingSelection } = require('../scripts/mapping-selection');
const { FileFilters } = require('../scripts/file-filters');
const { FileHasher } = require('../scripts/file-hasher');
const { FileStats } = require('../scripts/file-stats');
const { FileComparison } = require('../scripts/file-comparison');
const { FolderWalker } = require('../scripts/folder-walker');
const { SyncConfigLoader } = require('./sync-config-loader');
const { SyncResults } = require('./sync-results');
const { SyncProgress } = require('./sync-progress');
const { FileCopier } = require('./file-copier');
const { FileSynchronizer } = require('./file-synchronizer');
const { RemovalScanner } = require('./removal-scanner');
const { SyncLogWriter } = require('./sync-log-writer');

class RunSync
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.startTime = Date.now();
        this.scriptArguments = new ScriptArguments({args: props.args});
        this.configLoader = new SyncConfigLoader({rootPath: this.rootPath});
        this.modifiedTimeThreshold = new ModifiedTimeThreshold();
        this.stopSignalListener = new StopSignalListener();
        this.results = new SyncResults();
        this.progress = new SyncProgress();
        this.fileStats = new FileStats();
        this.filters = new FileFilters();
        this.walker = new FolderWalker({isStopped: () => {
            return this.interrupted;
        }});
        this.hasher = new FileHasher({timeoutMs: 30000});
        this.logWriter = new SyncLogWriter({logsPath: path.join(this.rootPath, 'logs')});
        this.maxHashSizeBytes = 500*1024*1024;
        this.options = {};
        this.modifiedTimeThresholdMs = this.modifiedTimeThreshold.defaultMs;
        this.scopeDescription = '';
        this.configPath = '';
        this.isFileMode = false;
        this.removals = [];
        this.interrupted = false;
        this.comparison = false;
        this.synchronizer = false;
        this.removalScanner = false;
    }

    async run()
    {
        let mappings = this.prepare();
        this.printSettings(mappings);
        for(let mapping of mappings){
            if(this.interrupted){
                break;
            }
            for(let dest of mapping.to || []){
                if(this.interrupted){
                    break;
                }
                await this.syncMappingToDest(mapping, dest);
            }
        }
        if(!this.interrupted && 0 < this.removals.length){
            await this.removalScanner.removeListed(this.removals);
        }
        if(this.interrupted){
            // stop() saves the log and exits:
            return;
        }
        if(this.isFileMode && this.progress.hasPrintedFolder()){
            process.stdout.write('\n');
        }
        let durationMs = Date.now()-this.startTime;
        console.log('Sync finished in '+durationMs.toString()+'ms');
        if(0 < this.results.hashErrors.length){
            console.log('Hash errors: '+this.results.hashErrors.length.toString()+' (see log for details)');
        }
        if(0 < this.results.errors.length){
            console.log('Errors: '+this.results.errors.length.toString()+' (see log for details)');
        }
        await this.writeLog();
        if(process.connected){
            process.disconnect();
        }
    }

    prepare()
    {
        let options = this.scriptArguments.parse();
        if(options.error){
            this.exit(1, options.error);
        }
        this.options = options;
        let config = this.configLoader.resolve(options.configFile);
        this.configPath = config.path;
        this.isFileMode = config.isFileMode;
        this.stopSignalListener.listen(async () => {
            await this.stop();
        });
        let selection = new MappingSelection({selectedNumbers: options.selectedMappings});
        let loaded = this.configLoader.load(this.configPath, selection);
        if(loaded.error){
            this.exit(1, loaded.error);
        }
        if(loaded.nothingToDo){
            this.exit(0, loaded.nothingToDo);
        }
        this.scopeDescription = loaded.scopeDescription;
        this.removals = loaded.removals;
        this.modifiedTimeThresholdMs = this.modifiedTimeThreshold.resolve(
            options.modifiedTimeThresholdMs,
            loaded.settings
        );
        this.createWorkers();
        return loaded.mappings;
    }

    exit(code, message)
    {
        if(0 === code){
            console.log(message);
        }
        if(0 !== code){
            console.error(message);
        }
        process.exit(code);
    }

    createWorkers()
    {
        this.comparison = new FileComparison({
            hasher: this.hasher,
            withHash: this.options.withHash,
            maxHashSizeBytes: this.maxHashSizeBytes,
            modifiedTimeThresholdMs: this.modifiedTimeThresholdMs,
            onHashing: (fileName) => {
                this.progress.showHashing(fileName);
            }
        });
        this.synchronizer = new FileSynchronizer({
            results: this.results,
            progress: this.progress,
            comparison: this.comparison,
            copier: new FileCopier({
                hasher: this.hasher,
                fileStats: this.fileStats,
                modifiedTimeThresholdMs: this.modifiedTimeThresholdMs
            }),
            fileStats: this.fileStats,
            filters: this.filters,
            walker: this.walker,
            dryRun: this.options.dryRun,
            isStopped: () => {
                return this.interrupted;
            }
        });
        this.removalScanner = new RemovalScanner({
            results: this.results,
            progress: this.progress,
            fileStats: this.fileStats,
            filters: this.filters,
            walker: this.walker,
            dryRun: this.options.dryRun,
            isStopped: () => {
                return this.interrupted;
            }
        });
    }

    printSettings(mappings)
    {
        let totalDestinations = 0;
        for(let mapping of mappings){
            let toList = mapping.to || [];
            totalDestinations += toList.length;
        }
        console.log('Using config: '+this.configPath);
        console.log('Mode: '+(this.isFileMode ? 'File-by-file' : 'Folder scanning'));
        if(this.isFileMode){
            console.log('Total mappings: '+totalDestinations.toString());
        }
        if(0 < this.removals.length){
            console.log('Files to remove: '+this.removals.length.toString());
        }
        for(let line of this.comparison.describeSettings()){
            console.log(line);
        }
        if('' !== this.scopeDescription){
            console.log('Mappings: '+this.scopeDescription);
        }
    }

    async syncMappingToDest(mapping, dest)
    {
        this.progress.startDestination(this.isFileMode);
        let originRoot = mapping.from;
        let originExists = fs.existsSync(originRoot);
        if(!originExists){
            console.log('Origin not found: '+originRoot);
            return;
        }
        if(this.isFileMode){
            await this.synchronizer.syncListedFile(originRoot, dest);
        }
        if(!this.isFileMode){
            await this.synchronizer.syncFolder(originRoot, dest, mapping);
        }
        if(this.interrupted){
            return;
        }
        if((this.options.allowRemove || true === mapping.allowRemove) && !this.isFileMode){
            let destExists = fs.existsSync(dest);
            if(destExists && this.isRemovalSafe(dest)){
                await this.removalScanner.scan(dest, mapping, this.synchronizer.originFiles);
            }
        }
        if(!this.isFileMode && 0 < this.progress.filesProcessed){
            process.stdout.write('\n');
        }
    }

    isRemovalSafe(dest)
    {
        // a source file that could not be read would look deleted, and its copy would be removed:
        if(0 === this.synchronizer.sourceReadProblems){
            return true;
        }
        console.log(
            '\nRemovals skipped for '+dest+': '+this.synchronizer.sourceReadProblems
            +' source folders or files could not be read.'
        );
        return false;
    }

    async stop()
    {
        if(this.interrupted){
            return;
        }
        this.interrupted = true;
        console.log('\n\nInterrupted by user. Saving progress...');
        await this.writeLog();
        console.log('Progress saved. Exiting.');
        process.exit(0);
    }

    async writeLog()
    {
        return await this.logWriter.write({
            triggeredBy: this.options.triggeredBy,
            configPath: this.configPath,
            dryRun: this.options.dryRun,
            allowRemove: this.options.allowRemove,
            withHash: this.options.withHash,
            modifiedTimeThresholdMs: this.modifiedTimeThresholdMs,
            scopeDescription: this.scopeDescription,
            interrupted: this.interrupted
        }, this.results);
    }

}

module.exports.RunSync = RunSync;
