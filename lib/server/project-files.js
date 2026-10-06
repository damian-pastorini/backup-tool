/**
 * Project Files
 *
 * Reads the configs and the generated sync configs (all in the "configurations" folder) and the logs.
 */

const { FileHandler } = require('@reldens/server-utils');

class ProjectFiles
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.logsPath = FileHandler.joinPaths(this.rootPath, 'logs');
        this.configurationsPath = FileHandler.joinPaths(this.rootPath, 'configurations');
        this.mainConfigs = ['inspect.config.js', 'sync.config.js'];
        // an optional "-2", "-3"... after the time when several runs finished in the same second:
        this.generatedConfigPattern = new RegExp(
            '^(\\d{4})-(\\d{2})-(\\d{2})-(\\d{2})-(\\d{2})-(\\d{2})(?:-(\\d+))?-(sync\\.config|sync-config-files)\\.js$'
        );
        this.logPattern = /^(sync|inspect-folders)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.log$/;
        this.sectionPattern = /^--- (.+) \((\d+)\) ---$/;
        this.maxSectionLines = 5000;
        this.logSummaryCache = new Map();
        this.configSummaryCache = new Map();
    }

    isConfigName(name)
    {
        if(-1 !== this.mainConfigs.indexOf(name)){
            return true;
        }
        return this.generatedConfigPattern.test(name || '');
    }

    isLogName(name)
    {
        return this.logPattern.test(name || '');
    }

    isFilesConfig(name)
    {
        return name.endsWith('-sync-config-files.js');
    }

    configPath(name)
    {
        return FileHandler.joinPaths(this.configurationsPath, name);
    }

    logPath(name)
    {
        return FileHandler.joinPaths(this.logsPath, name);
    }

    loadConfigModule(name)
    {
        let filePath = this.configPath(name);
        try{
            delete require.cache[require.resolve(filePath)];
            return require(filePath);
        }catch(error){
            return false;
        }
    }

    fetchMappings()
    {
        let config = this.loadConfigModule('inspect.config.js');
        if(!config || !Array.isArray(config.mappings)){
            return {
                mappings: [],
                error: 'Could not load configurations/inspect.config.js. Add a mapping below, or copy'
                    +' inspect.config.dist.js to configurations/inspect.config.js and set your own folders.'
            };
        }
        let mappings = [];
        for(let mapping of config.mappings){
            let to = [];
            for(let destination of (mapping.to || [])){
                to.push({path: destination, exists: FileHandler.exists(destination)});
            }
            mappings.push({
                number: mappings.length+1,
                from: mapping.from,
                fromExists: FileHandler.exists(mapping.from),
                to: to,
                enabled: false !== mapping.enabled,
                allowRemove: true === mapping.allowRemove,
                schedule: {
                    enabled: !!(mapping.schedule && true === mapping.schedule.enabled),
                    cron: mapping.schedule ? String(mapping.schedule.cron || '') : ''
                },
                includeExtensions: mapping.includeExtensions || [],
                excludeExtensions: mapping.excludeExtensions || [],
                maxSizeBytes: mapping.maxSizeBytes || 0,
                excludeHidden: true === mapping.excludeHidden,
                excludeSystem: true === mapping.excludeSystem,
                excludeNames: mapping.excludeNames || []
            });
        }
        return {mappings: mappings, error: ''};
    }

    fetchConfigsList()
    {
        let names = this.mainConfigs.slice();
        if(FileHandler.isFolder(this.configurationsPath)){
            for(let name of FileHandler.getFilesInFolder(this.configurationsPath, ['.js'])){
                if(this.generatedConfigPattern.test(name)){
                    names.push(name);
                }
            }
        }
        let configs = [];
        for(let name of names){
            let summary = this.fetchConfigSummary(name);
            if(summary){
                configs.push(summary);
            }
        }
        configs.sort((a, b) => {
            return b.sortKey.localeCompare(a.sortKey);
        });
        return configs;
    }

    fetchConfigSummary(name)
    {
        let stats = FileHandler.getFileStats(this.configPath(name));
        if(!stats){
            return false;
        }
        let cached = this.configSummaryCache.get(name);
        if(cached && cached.mtimeMs === stats.mtimeMs){
            return cached.summary;
        }
        let summary = {
            name: name,
            type: this.isFilesConfig(name) ? 'files' : 'folders',
            generated: this.generatedConfigPattern.test(name),
            createdAt: this.configDate(name, stats),
            sortKey: '',
            size: stats.size,
            entries: 0,
            destinations: 0,
            removals: 0,
            modifiedTimeThresholdMs: null,
            error: ''
        };
        let nameMatch = this.generatedConfigPattern.exec(name);
        let sameSecondCounter = nameMatch && nameMatch[7] ? Number(nameMatch[7]) : 1;
        summary.sortKey = (summary.generated ? '1' : '0')+summary.createdAt+String(sameSecondCounter).padStart(3, '0');
        let config = this.loadConfigModule(name);
        if(!config){
            summary.error = 'Could not load config file.';
        }
        if(config && config.settings && undefined !== config.settings.modifiedTimeThresholdMs){
            summary.modifiedTimeThresholdMs = Number(config.settings.modifiedTimeThresholdMs);
        }
        if(config && 'folders' === summary.type){
            let mappings = config.mappings || [];
            summary.entries = mappings.length;
            for(let mapping of mappings){
                summary.destinations += (mapping.to || []).length;
            }
        }
        if(config && 'files' === summary.type){
            let fileMap = this.filesOf(config);
            let sources = Object.keys(fileMap);
            summary.entries = sources.length;
            for(let source of sources){
                summary.destinations += this.toArray(fileMap[source]).length;
            }
            summary.removals = Object.keys(this.removalsOf(config)).length;
        }
        this.configSummaryCache.set(name, {mtimeMs: stats.mtimeMs, summary: summary});
        return summary;
    }

    fetchConfigDetails(name)
    {
        let summary = this.fetchConfigSummary(name);
        if(!summary){
            return false;
        }
        let config = this.loadConfigModule(name);
        if(!config){
            return Object.assign({}, summary, {mappings: [], folders: [], removals: []});
        }
        if('folders' === summary.type){
            return Object.assign({}, summary, {mappings: config.mappings || [], folders: [], removals: []});
        }
        let folders = new Map();
        let fileMap = this.filesOf(config);
        for(let source of Object.keys(fileMap)){
            for(let destination of this.toArray(fileMap[source])){
                let folder = FileHandler.getFolderName(destination) || destination;
                if(!folders.has(folder)){
                    folders.set(folder, {
                        destination: folder,
                        source: FileHandler.getFolderName(source) || '',
                        files: []
                    });
                }
                folders.get(folder).files.push(FileHandler.getFileName(destination) || destination);
            }
        }
        let foldersList = Array.from(folders.values());
        foldersList.sort((a, b) => {
            return a.destination.localeCompare(b.destination);
        });
        let removals = Object.keys(this.removalsOf(config)).sort();
        return Object.assign({}, summary, {mappings: [], folders: foldersList, removals: removals});
    }

    filesOf(config)
    {
        // generated file lists are {settings, files: {source: destinations}}, older ones are only that object:
        if(config.files && 'object' === typeof config.files){
            return config.files;
        }
        let fileMap = Object.assign({}, config);
        delete fileMap.settings;
        return fileMap;
    }

    removalsOf(config)
    {
        // generated by the inspection for the mappings with "allowRemove: true": {destination: source}
        if(!config.files || !config.remove || 'object' !== typeof config.remove){
            return {};
        }
        return config.remove;
    }

    toArray(value)
    {
        return Array.isArray(value) ? value : [value];
    }

    configDate(name, stats)
    {
        let match = this.generatedConfigPattern.exec(name);
        if(!match){
            return this.formatDate(stats.mtime);
        }
        return match[1]+'-'+match[2]+'-'+match[3]+' '+match[4]+':'+match[5]+':'+match[6];
    }

    formatDate(date)
    {
        let pad2 = (n) => { return (n < 10 ? '0' : '')+n; };
        return date.getFullYear().toString()+'-'+pad2(date.getMonth()+1)+'-'+pad2(date.getDate())
            +' '+pad2(date.getHours())+':'+pad2(date.getMinutes())+':'+pad2(date.getSeconds());
    }

    fetchLogsList()
    {
        if(!FileHandler.isFolder(this.logsPath)){
            return [];
        }
        let logs = [];
        for(let name of FileHandler.getFilesInFolder(this.logsPath, ['.log'])){
            if(!this.isLogName(name)){
                continue;
            }
            let summary = this.fetchLogSummary(name);
            if(summary){
                logs.push(summary);
            }
        }
        logs.sort((a, b) => {
            return b.createdAt.localeCompare(a.createdAt);
        });
        return logs;
    }

    fetchLogSummary(name)
    {
        let stats = FileHandler.getFileStats(this.logPath(name));
        if(!stats){
            return false;
        }
        let cached = this.logSummaryCache.get(name);
        if(cached && cached.mtimeMs === stats.mtimeMs){
            return cached.summary;
        }
        let parsed = this.parseLog(name, 0);
        if(!parsed){
            return false;
        }
        delete parsed.sections;
        this.logSummaryCache.set(name, {mtimeMs: stats.mtimeMs, summary: parsed});
        return parsed;
    }

    fetchLogDetails(name)
    {
        return this.parseLog(name, this.maxSectionLines);
    }

    parseLog(name, maxSectionLines)
    {
        let match = this.logPattern.exec(name);
        let contents = FileHandler.readFile(this.logPath(name));
        if(!match || false === contents){
            return false;
        }
        let log = {
            name: name,
            type: 'sync' === match[1] ? 'sync' : 'inspect',
            createdAt: match[2]+'-'+match[3]+'-'+match[4]+' '+match[5]+':'+match[6]+':'+match[7],
            config: '',
            dryRun: false,
            allowRemove: false,
            withHash: false,
            interrupted: false,
            modifiedTimeThresholdMs: null,
            scope: '',
            triggeredBy: '',
            counts: {},
            pendingFiles: 0,
            sections: []
        };
        let currentSection = false;
        for(let line of contents.split(/\r?\n/)){
            if('' === line || line.startsWith('===')){
                continue;
            }
            let sectionMatch = this.sectionPattern.exec(line);
            if(sectionMatch){
                currentSection = {title: sectionMatch[1], count: Number(sectionMatch[2]), lines: [], truncated: 0};
                log.counts[sectionMatch[1]] = Number(sectionMatch[2]);
                log.sections.push(currentSection);
                continue;
            }
            if(!currentSection){
                this.parseLogHeaderLine(log, line);
                continue;
            }
            if('inspect' === log.type){
                let filesMatch = /^(New files|Modified files|Missing in source) \((\d+)\):/.exec(line);
                if(filesMatch){
                    log.pendingFiles += Number(filesMatch[2]);
                }
            }
            if(currentSection.lines.length < maxSectionLines){
                currentSection.lines.push(line);
                continue;
            }
            currentSection.truncated += 1;
        }
        return log;
    }

    parseLogHeaderLine(log, line)
    {
        let separatorIndex = line.indexOf(': ');
        if(-1 === separatorIndex){
            return;
        }
        let key = line.substring(0, separatorIndex);
        let value = line.substring(separatorIndex+2);
        if('Config' === key){
            log.config = value;
        }
        if('Dry Run' === key){
            log.dryRun = 'YES' === value;
        }
        if('Allow Remove' === key){
            log.allowRemove = 'YES' === value;
        }
        if('Hash Enabled' === key){
            log.withHash = 'YES' === value;
        }
        if('Status' === key){
            log.interrupted = 'INTERRUPTED' === value;
        }
        if('Modified Time Threshold' === key){
            log.modifiedTimeThresholdMs = parseInt(value, 10);
        }
        if('Mappings' === key){
            log.scope = value;
        }
        if('Triggered By' === key){
            log.triggeredBy = value;
        }
    }

}

module.exports.ProjectFiles = ProjectFiles;
