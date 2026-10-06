/**
 * Run Inspect Folders
 *
 * The run-inspect-folders.js script: reads the options and configurations/inspect.config.js, inspects every selected
 * mapping, then prints the report and writes the generated sync configs and the log. See run-inspect-folders.js for
 * the options. No dependencies.
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
const { FolderChanges } = require('./folder-changes');
const { MappingInspector } = require('./mapping-inspector');
const { GeneratedConfigWriter } = require('./generated-config-writer');
const { InspectionLogWriter } = require('./inspection-log-writer');
const { InspectionReport } = require('./inspection-report');

class RunInspectFolders
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.configurationsPath = path.join(this.rootPath, 'configurations');
        this.configPath = path.join(this.configurationsPath, 'inspect.config.js');
        this.scriptArguments = new ScriptArguments({args: props.args});
        this.modifiedTimeThreshold = new ModifiedTimeThreshold();
        this.stopSignalListener = new StopSignalListener();
        this.changes = new FolderChanges();
        this.hashErrors = [];
        this.fileStats = new FileStats();
        this.filters = new FileFilters();
        this.walker = new FolderWalker({isStopped: () => {
            return this.interrupted;
        }});
        this.hasher = new FileHasher({timeoutMs: 10000});
        this.configWriter = new GeneratedConfigWriter({configurationsPath: this.configurationsPath});
        this.logWriter = new InspectionLogWriter({logsPath: path.join(this.rootPath, 'logs')});
        this.report = new InspectionReport();
        this.maxHashSizeBytes = 100 * 1024 * 1024;
        this.options = {};
        this.selection = new MappingSelection({selectedNumbers: []});
        this.originalMappings = [];
        this.settings = {};
        this.modifiedTimeThresholdMs = this.modifiedTimeThreshold.defaultMs;
        this.interrupted = false;
        this.comparison = false;
        this.mappingInspector = false;
    }

    async run()
    {
        this.prepare();
        console.log('Inspecting folders for changes...');
        for(let line of this.comparison.describeSettings()){
            console.log(line);
        }
        console.log('Mappings: '+this.describeScope());
        for(let i = 0; i < this.originalMappings.length; i++){
            if(this.interrupted){
                break;
            }
            let mapping = this.originalMappings[i];
            if(!this.selection.isIncluded(i, mapping)){
                if(false === mapping.enabled && !this.selection.isExplicit()){
                    console.log('Skipping disabled mapping #'+(i+1)+': '+mapping.from);
                }
                continue;
            }
            let toList = mapping.to || [];
            for(let j = 0; j < toList.length; j++){
                if(this.interrupted){
                    break;
                }
                await this.mappingInspector.inspect(mapping, toList[j], i, j);
            }
        }
        if(this.interrupted){
            // stop() saves the log and the configs, and exits:
            return;
        }
        this.report.print(this.changes.files, this.changes.removals, this.hashErrors);
        await this.writeFolderConfig();
        await this.writeFileConfig();
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
        this.selection = new MappingSelection({selectedNumbers: options.selectedMappings});
        this.stopSignalListener.listen(async () => {
            await this.stop();
        });
        this.originalMappings = this.validateConfig();
        this.modifiedTimeThresholdMs = this.modifiedTimeThreshold.resolve(
            options.modifiedTimeThresholdMs,
            this.settings
        );
        this.comparison = new FileComparison({
            hasher: this.hasher,
            withHash: options.withHash,
            maxHashSizeBytes: this.maxHashSizeBytes,
            modifiedTimeThresholdMs: this.modifiedTimeThresholdMs,
            onHashing: (fileName) => {
                process.stdout.write('\rHashing ['+fileName+']...'+' '.repeat(30));
            }
        });
        this.mappingInspector = new MappingInspector({
            changes: this.changes,
            hashErrors: this.hashErrors,
            comparison: this.comparison,
            fileStats: this.fileStats,
            filters: this.filters,
            walker: this.walker
        });
    }

    validateConfig()
    {
        let configExists = fs.existsSync(this.configPath);
        if(!configExists){
            console.error('Config file not found: '+this.configPath);
            this.exit(1, 'Copy inspect.config.dist.js to configurations/inspect.config.js and set your own folders.');
        }
        let config = require(this.configPath);
        this.settings = config.settings || {};
        let mappings = config.mappings || [];
        if(0 === mappings.length){
            this.exit(0, 'No mappings found. Nothing to inspect.');
        }
        let missingError = this.selection.findMissing(mappings);
        if('' !== missingError){
            this.exit(1, missingError);
        }
        return mappings;
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

    describeScope()
    {
        return this.selection.describe(this.originalMappings);
    }

    generatedSettings()
    {
        return {modifiedTimeThresholdMs: this.modifiedTimeThresholdMs};
    }

    async stop()
    {
        if(this.interrupted){
            return;
        }
        this.interrupted = true;
        console.log('\n\nInterrupted by user. Saving progress...');
        await this.writeLog();
        await this.writeFolderConfig();
        await this.writeFileConfig();
        console.log('Progress saved. Exiting.');
        process.exit(0);
    }

    async writeFolderConfig()
    {
        return await this.configWriter.writeFolderConfig(
            this.changes.folders,
            this.originalMappings,
            this.generatedSettings()
        );
    }

    async writeFileConfig()
    {
        return await this.configWriter.writeFileConfig(
            this.changes.files,
            this.changes.removals,
            this.generatedSettings()
        );
    }

    async writeLog()
    {
        return await this.logWriter.write({
            triggeredBy: this.options.triggeredBy,
            withHash: this.options.withHash,
            modifiedTimeThresholdMs: this.modifiedTimeThresholdMs,
            scopeDescription: this.describeScope(),
            interrupted: this.interrupted
        }, this.hashErrors, this.changes.folders, this.originalMappings);
    }

}

module.exports.RunInspectFolders = RunInspectFolders;
