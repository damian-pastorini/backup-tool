/**
 * Folder Change Inspection Script
 *
 * Detects which folders have changes between source and destination.
 * Reports folder-level differences without syncing.
 *
 * USAGE:
 * 1. Copy inspect.config.dist.js to configurations/inspect.config.js and set your folders
 * 2. Run: node run-inspect-folders.js
 * 3. Optional: node run-inspect-folders.js --with-hash (enable hash comparison)
 * 4. Optional: node run-inspect-folders.js --modified-time-threshold=2s (how much newer the source must be to count
 *    as changed, in milliseconds or with an "s"/"ms" suffix; overrides settings.modifiedTimeThresholdMs from the
 *    config; default 2s, for FAT32/exFAT disks that keep 2 second times)
 * 5. Optional: node run-inspect-folders.js --mapping=2 (or --mapping=1,3) inspects only those mappings, numbered from 1
 *    in the config order. Without it, every mapping except the ones with "enabled: false" is inspected.
 * 6. Optional: --triggered-by="schedule: general schedule" (written in the log header, used by the scheduler)
 *
 * Generated configs and logs are never overwritten: when two runs finish in the same second, the second one gets
 * a "-2" suffix (for example 2026-01-01-03-00-00-2-sync-config-files.js).
 *
 * CONFIGURATION (configurations/inspect.config.js):
 * module.exports = {
 *     settings: {modifiedTimeThresholdMs: 2000},
 *     mappings: [{from: '...', to: ['...'], enabled: true, ...filters}]
 * };
 *
 * OUTPUT:
 * - configurations/[TIMESTAMP]-sync.config.js: Config with folders needing sync ({settings, mappings})
 * - configurations/[TIMESTAMP]-sync-config-files.js: Config with individual files to sync
 *   ({settings, files: {source: [destinations]}})
 * - logs/inspect-folders-[timestamp].log: Detailed log of all detected changes
 * The generated configs keep the modified time threshold used here, so the sync compares files the same way.
 *
 * STOPPING:
 * - Ctrl+C, closing the console window, or the "stop" IPC message when started with child_process.fork()
 *   (used by the web tool).
 * - All of them save the log and the configs collected so far before exiting.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class RunInspectFolders
{

    constructor()
    {
        this.configurationsPath = path.join(process.cwd(), 'configurations');
        this.configPath = path.join(this.configurationsPath, 'inspect.config.js');
        this.folderChanges = new Map();
        this.changedFiles = [];
        this.originalMappings = [];
        this.currentOriginFolder = '';
        this.currentDestFolder = '';
        this.interrupted = false;
        this.hashErrors = [];
        this.hashTimeoutMs = 10000;
        this.maxHashSizeBytes = 100 * 1024 * 1024;
        this.args = process.argv.slice(2);
        this.withHash = -1 !== this.args.indexOf('--with-hash');
        // FAT32 and exFAT copies made by other tools often keep the modified time with 2 second precision:
        this.defaultModifiedTimeThresholdMs = 2000;
        this.cliModifiedTimeThresholdMs = this.parseModifiedTimeThreshold();
        this.modifiedTimeThresholdMs = this.defaultModifiedTimeThresholdMs;
        this.selectedMappings = this.parseMappingSelection();
        this.triggeredBy = this.parseTextArg('--triggered-by=');
        this.settings = {};
        this.filesProcessed = 0;
        this.setupStopHandlers();
    }

    parseModifiedTimeThreshold()
    {
        let prefix = '--modified-time-threshold=';
        for(let arg of this.args){
            if(!arg.startsWith(prefix)){
                continue;
            }
            let match = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(arg.substring(prefix.length).trim());
            if(!match){
                console.error('Invalid '+arg+', use milliseconds (2000) or seconds (2s).');
                process.exit(1);
            }
            return Math.round(Number(match[1])*('s' === match[2] ? 1000 : 1));
        }
        return null;
    }

    resolveModifiedTimeThreshold()
    {
        if(null !== this.cliModifiedTimeThresholdMs){
            return this.cliModifiedTimeThresholdMs;
        }
        let configured = Number(this.settings.modifiedTimeThresholdMs);
        if(undefined !== this.settings.modifiedTimeThresholdMs && Number.isFinite(configured) && 0 <= configured){
            return Math.round(configured);
        }
        return this.defaultModifiedTimeThresholdMs;
    }

    parseTextArg(prefix)
    {
        for(let arg of this.args){
            if(arg.startsWith(prefix)){
                return arg.substring(prefix.length).trim();
            }
        }
        return '';
    }

    parseMappingSelection()
    {
        let prefix = '--mapping=';
        for(let arg of this.args){
            if(!arg.startsWith(prefix)){
                continue;
            }
            let numbers = arg.substring(prefix.length).split(',').map((value) => {
                return Number(value.trim());
            });
            for(let number of numbers){
                if(!Number.isInteger(number) || 1 > number){
                    console.error('Invalid '+arg+', use mapping numbers starting at 1, like --mapping=2 or --mapping=1,3.');
                    process.exit(1);
                }
            }
            return numbers;
        }
        return [];
    }

    isMappingIncluded(index, mapping)
    {
        // an explicit --mapping selection runs those mappings even when they are disabled:
        if(0 < this.selectedMappings.length){
            return -1 !== this.selectedMappings.indexOf(index+1);
        }
        return false !== mapping.enabled;
    }

    describeScope()
    {
        if(0 < this.selectedMappings.length){
            return 'selected #'+this.selectedMappings.join(', #');
        }
        let enabledCount = this.originalMappings.filter((mapping) => {
            return false !== mapping.enabled;
        }).length;
        return 'all enabled ('+enabledCount+' of '+this.originalMappings.length+')';
    }

    generatedSettings()
    {
        return {modifiedTimeThresholdMs: this.modifiedTimeThresholdMs};
    }

    indentJson(value)
    {
        return JSON.stringify(value, null, 4).replace(/\n/g, '\n    ');
    }

    setupStopHandlers()
    {
        process.on('SIGINT', async () => {
            await this.stop();
        });
        // on Windows, closing the console window emits SIGHUP and the process is killed a few seconds later:
        process.on('SIGHUP', async () => {
            await this.stop();
        });
        // the console or the parent process can be gone already, ignore the output errors so the log is still saved:
        process.stdout.on('error', () => {});
        process.stderr.on('error', () => {});
        if(!process.send){
            return;
        }
        process.on('message', async (message) => {
            if('stop' === message){
                await this.stop();
            }
        });
    }

    async stop()
    {
        if(this.interrupted){
            return;
        }
        this.interrupted = true;
        console.log('\n\nInterrupted by user. Saving progress...');
        await this.generateLogFile();
        await this.generateFolderConfig();
        await this.generateFileConfig();
        console.log('Progress saved. Exiting.');
        process.exit(0);
    }

    validateConfig()
    {
        let configExists = fs.existsSync(this.configPath);
        if(!configExists){
            console.error('Config file not found: '+this.configPath);
            console.error('Copy inspect.config.dist.js to configurations/inspect.config.js and set your own folders.');
            process.exit(1);
        }
        let config = require(this.configPath);
        this.settings = config.settings || {};
        let mappings = config.mappings || [];
        if(0 === mappings.length){
            console.log('No mappings found. Nothing to inspect.');
            process.exit(0);
        }
        for(let number of this.selectedMappings){
            if(mappings.length < number){
                console.error('There is no mapping #'+number+', the config has '+mappings.length+' mappings.');
                process.exit(1);
            }
        }
        return mappings;
    }

    makeRelPath(base, p)
    {
        let rel = path.relative(base, p);
        if('' === rel){
            return '';
        }
        return rel.split(path.sep).join('/');
    }

    getFolderPath(relPath)
    {
        let dir = path.dirname(relPath);
        if('.' === dir){
            return '/';
        }
        return dir.split(path.sep).join('/');
    }

    async statSafe(p)
    {
        try{
            return await fsp.stat(p);
        }catch(e){
            return false;
        }
    }

    hashFile(p)
    {
        return new Promise((resolve, reject) => {
            let h = crypto.createHash('md5');
            let s = fs.createReadStream(p);
            let done = false;
            let timeoutId = setTimeout(() => {
                if(done){
                    return;
                }
                done = true;
                s.destroy();
                reject(new Error('hash-timeout'));
            }, this.hashTimeoutMs);
            s.on('data', (chunk) => {
                if(done){
                    return;
                }
                h.update(chunk);
            });
            s.on('error', (e) => {
                if(done){
                    return;
                }
                done = true;
                clearTimeout(timeoutId);
                reject(e);
            });
            s.on('end', () => {
                if(done){
                    return;
                }
                done = true;
                clearTimeout(timeoutId);
                resolve(h.digest('hex'));
            });
        });
    }

    isGoogleDriveShortcut(filePath)
    {
        let ext = path.extname(filePath).toLowerCase();
        return '.gsheet' === ext || '.gmap' === ext || '.gdoc' === ext || '.gslides' === ext || '.gform' === ext;
    }

    pathSegments(rel)
    {
        if('' === rel){
            return [];
        }
        return rel.split('/').filter((x) => { return '' !== x; });
    }

    isHiddenName(name)
    {
        if(0 === name.length){
            return false;
        }
        if('.' === name[0]){
            return true;
        }
        return false;
    }

    isSystemName(name)
    {
        let lower = name.toLowerCase();
        if('system volume information' === lower){
            return true;
        }
        if('$recycle.bin' === lower){
            return true;
        }
        if('desktop.ini' === lower){
            return true;
        }
        if('thumbs.db' === lower){
            return true;
        }
        return false;
    }

    extOf(rel)
    {
        let b = path.basename(rel);
        let idx = b.lastIndexOf('.');
        if(-1 === idx){
            return '';
        }
        return b.substring(idx).toLowerCase();
    }

    matchesFilters(rel, st, opts)
    {
        if(!opts){
            return true;
        }
        let segs = this.pathSegments(rel);
        if(opts.excludeHidden){
            for(let s of segs){
                if(this.isHiddenName(s)){
                    return false;
                }
            }
        }
        if(opts.excludeSystem){
            for(let s of segs){
                if(this.isSystemName(s)){
                    return false;
                }
            }
        }
        let exNames = opts.excludeNames || [];
        if(0 < exNames.length){
            for(let s of segs){
                if(-1 !== exNames.indexOf(s)){
                    return false;
                }
            }
        }
        let includeExt = opts.includeExtensions || [];
        if(0 < includeExt.length){
            let e = this.extOf(rel);
            if(-1 === includeExt.indexOf(e)){
                return false;
            }
        }
        let excludeExt = opts.excludeExtensions || [];
        if(0 < excludeExt.length){
            let e2 = this.extOf(rel);
            if(-1 !== excludeExt.indexOf(e2)){
                return false;
            }
        }
        if(opts.maxSizeBytes && 0 < opts.maxSizeBytes){
            if(st && st.size && opts.maxSizeBytes < st.size){
                return false;
            }
        }
        return true;
    }

    addFolderChange(mappingIndex, destIndex, folder, changeType, fileName)
    {
        let key = mappingIndex+'-'+destIndex+'-'+folder;
        if(!this.folderChanges.has(key)){
            this.folderChanges.set(key, {
                mappingIndex: mappingIndex,
                destIndex: destIndex,
                folder: folder,
                new: [],
                modified: [],
                missing: []
            });
        }
        let changes = this.folderChanges.get(key);
        if('new' === changeType){
            changes.new.push(fileName);
        }
        if('modified' === changeType){
            changes.modified.push(fileName);
        }
        if('missing' === changeType){
            changes.missing.push(fileName);
        }
    }

    async processFile(fullPath, originRoot, dest, mapping, mappingIndex, destIndex)
    {
        let rel = this.makeRelPath(originRoot, fullPath);
        if('' === rel){
            return;
        }
        if(this.isGoogleDriveShortcut(fullPath)){
            return;
        }
        let srcStat = await this.statSafe(fullPath);
        if(!srcStat){
            return;
        }
        if(srcStat.isDirectory()){
            return;
        }
        if(!this.matchesFilters(rel, srcStat, mapping)){
            return;
        }
        let folder = this.getFolderPath(rel);
        let fileName = path.basename(rel);
        let dstPath = path.join(dest, rel);
        let dstStat = await this.statSafe(dstPath);
        let hasChange = false;
        let changeType = '';
        if(!dstStat){
            hasChange = true;
            changeType = 'new';
        }
        if(!hasChange && dstStat){
            if(srcStat.size !== dstStat.size){
                hasChange = true;
                changeType = 'modified';
            }
            if(!hasChange && srcStat.mtimeMs - dstStat.mtimeMs > this.modifiedTimeThresholdMs){
                if(!this.withHash){
                    hasChange = true;
                    changeType = 'modified';
                }
                if(this.withHash){
                    if(srcStat.size > this.maxHashSizeBytes){
                        hasChange = true;
                        changeType = 'modified';
                        this.hashErrors.push({ file: rel, reason: 'file-too-large', size: srcStat.size });
                    }
                    if(!hasChange){
                        let srcHash = '';
                        let dstHash = '';
                        try{
                            process.stdout.write('\rHashing ['+fileName+']...'+' '.repeat(30));
                            srcHash = await this.hashFile(fullPath);
                            dstHash = await this.hashFile(dstPath);
                        }catch(e){
                            hasChange = true;
                            changeType = 'modified';
                            this.hashErrors.push({ file: rel, reason: e.message });
                        }
                        if('' !== srcHash && '' !== dstHash && srcHash !== dstHash){
                            hasChange = true;
                            changeType = 'modified';
                        }
                    }
                }
            }
        }
        if(hasChange){
            this.addFolderChange(mappingIndex, destIndex, folder, changeType, fileName);
            this.changedFiles.push({
                srcPath: fullPath,
                dstPath: dstPath,
                rel: rel,
                changeType: changeType,
                mapping: mapping
            });
        }
    }

    async walkAndProcess(originRoot, dest, mapping, mappingIndex, destIndex)
    {
        let stack = [originRoot];
        while(0 < stack.length){
            if(this.interrupted){
                break;
            }
            let current = stack.pop();
            let dirents;
            try{
                dirents = await fsp.readdir(current, { withFileTypes: true });
            }catch(e){
                continue;
            }
            for(let d of dirents){
                if(this.interrupted){
                    break;
                }
                let full = path.join(current, d.name);
                if(d.isDirectory()){
                    stack.push(full);
                    continue;
                }
                if(!d.isFile()){
                    continue;
                }
                await this.processFile(full, originRoot, dest, mapping, mappingIndex, destIndex);
                this.filesProcessed += 1;
                if(0 === this.filesProcessed % 50){
                    process.stdout.write('\rProcessing ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '+this.filesProcessed.toString()+' files...'+' '.repeat(20));
                }
            }
        }
        if(0 < this.filesProcessed){
            process.stdout.write('\rDone ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '+this.filesProcessed.toString()+' files.'+' '.repeat(20)+'\n');
        }
    }

    async inspectMappingToDest(mapping, dest, mappingIndex, destIndex)
    {
        let originRoot = mapping.from;
        this.currentOriginFolder = originRoot;
        this.currentDestFolder = dest;
        this.filesProcessed = 0;
        let originExists = fs.existsSync(originRoot);
        if(!originExists){
            console.log('Origin not found: '+originRoot);
            return;
        }
        let destExists = fs.existsSync(dest);
        if(!destExists){
            console.log('Destination not found: '+dest);
            return;
        }
        await this.walkAndProcess(originRoot, dest, mapping, mappingIndex, destIndex);
    }

    async writeNewFile(folder, baseName, extension, content)
    {
        // scheduled jobs run in parallel and can finish in the same second, never overwrite another run's file:
        for(let attempt = 1; attempt < 100; attempt++){
            let filePath = path.join(folder, baseName+(1 === attempt ? '' : '-'+attempt)+extension);
            try{
                await fsp.writeFile(filePath, content, {encoding: 'utf8', flag: 'wx'});
                return filePath;
            }catch(e){
                if('EEXIST' !== e.code){
                    throw e;
                }
            }
        }
        throw new Error('No free file name for '+baseName+extension);
    }

    async ensureDir(dir)
    {
        try{
            await fsp.mkdir(dir, { recursive: true });
        }catch(e){
            if('EEXIST' !== e.code){
                throw e;
            }
        }
    }

    async generateFolderConfig()
    {
        if(0 === this.folderChanges.size){
            return false;
        }
        let now = new Date();
        let pad2 = (n) => { return (n < 10 ? '0' : '') + n; };
        let stamp = now.getFullYear().toString()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate())+'-'+pad2(now.getHours())+'-'+pad2(now.getMinutes())+'-'+pad2(now.getSeconds());
        let newMappings = [];
        for(let [key, change] of this.folderChanges){
            let mapping = this.originalMappings[change.mappingIndex];
            let dest = mapping.to[change.destIndex];
            let folderPath = change.folder;
            if('/' === folderPath){
                folderPath = '';
            }
            let fromPath = path.join(mapping.from, folderPath);
            let toPath = path.join(dest, folderPath);
            let newMapping = {
                from: fromPath,
                to: [toPath]
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
            newMappings.push(newMapping);
        }
        let configContent = 'module.exports = {\n    settings: '+this.indentJson(this.generatedSettings())
            +',\n    mappings: '+this.indentJson(newMappings)+'\n};\n';
        try{
            await this.ensureDir(this.configurationsPath);
            let configFile = await this.writeNewFile(this.configurationsPath, stamp, '-sync.config.js', configContent);
            console.log('Folder config: '+configFile);
            return configFile;
        }catch(e){
            console.log('Failed to write folder config: '+e.message);
            return false;
        }
    }

    async generateFileConfig()
    {
        if(0 === this.changedFiles.length){
            return false;
        }
        let now = new Date();
        let pad2 = (n) => { return (n < 10 ? '0' : '') + n; };
        let stamp = now.getFullYear().toString()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate())+'-'+pad2(now.getHours())+'-'+pad2(now.getMinutes())+'-'+pad2(now.getSeconds());
        let fileMap = {};
        for(let file of this.changedFiles){
            if(!fileMap[file.srcPath]){
                fileMap[file.srcPath] = [];
            }
            fileMap[file.srcPath].push(file.dstPath);
        }
        let configContent = 'module.exports = {\n    settings: '+this.indentJson(this.generatedSettings())
            +',\n    files: '+this.indentJson(fileMap)+'\n};\n';
        try{
            await this.ensureDir(this.configurationsPath);
            let configFile = await this.writeNewFile(this.configurationsPath, stamp, '-sync-config-files.js', configContent);
            console.log('File config: '+configFile);
            return configFile;
        }catch(e){
            console.log('Failed to write file config: '+e.message);
            return false;
        }
    }

    async generateLogFile()
    {
        let logsDir = path.join(process.cwd(), 'logs');
        try{
            await this.ensureDir(logsDir);
        }catch(e){}
        let now = new Date();
        let pad2 = (n) => { return (n < 10 ? '0' : '') + n; };
        let stamp = now.getFullYear().toString()+pad2(now.getMonth()+1)+pad2(now.getDate())+'-'+pad2(now.getHours())+pad2(now.getMinutes())+pad2(now.getSeconds());
        let lines = [];
        lines.push('=== FOLDER INSPECTION LOG ===');
        lines.push('Timestamp: '+now.toISOString());
        if('' !== this.triggeredBy){
            lines.push('Triggered By: '+this.triggeredBy);
        }
        lines.push('Hash Enabled: '+(this.withHash ? 'YES' : 'NO'));
        lines.push('Modified Time Threshold: '+this.modifiedTimeThresholdMs.toString()+'ms');
        lines.push('Mappings: '+this.describeScope());
        if(this.interrupted){
            lines.push('Status: INTERRUPTED');
        }
        lines.push('');
        if(0 < this.hashErrors.length){
            lines.push('--- HASH ERRORS ('+this.hashErrors.length.toString()+') ---');
            for(let err of this.hashErrors){
                let msg = 'file='+err.file+' | reason='+err.reason;
                if(err.size){
                    msg = msg+' | size='+err.size.toString();
                }
                lines.push(msg);
            }
            lines.push('');
        }
        if(0 === this.folderChanges.size){
            lines.push('No changes detected.');
        }
        if(0 < this.folderChanges.size){
            lines.push('--- FOLDERS WITH CHANGES ('+this.folderChanges.size.toString()+') ---');
            lines.push('');
            let sortedKeys = Array.from(this.folderChanges.keys()).sort();
            for(let key of sortedKeys){
                let change = this.folderChanges.get(key);
                let mapping = this.originalMappings[change.mappingIndex];
                let dest = mapping.to[change.destIndex];
                lines.push('Folder: '+change.folder);
                lines.push('From: '+path.join(mapping.from, change.folder));
                lines.push('To: '+path.join(dest, change.folder));
                if(0 < change.new.length){
                    lines.push('New files ('+change.new.length.toString()+'): '+change.new.join(', '));
                }
                if(0 < change.modified.length){
                    lines.push('Modified files ('+change.modified.length.toString()+'): '+change.modified.join(', '));
                }
                if(0 < change.missing.length){
                    lines.push('Missing in source ('+change.missing.length.toString()+'): '+change.missing.join(', '));
                }
                lines.push('');
            }
        }
        lines.push('=== END LOG ===');
        try{
            let logFile = await this.writeNewFile(logsDir, 'inspect-folders-'+stamp, '.log', lines.join('\n'));
            console.log('Log file: '+logFile);
            return logFile;
        }catch(e){
            console.log('Failed to write log file: '+e.message);
            return false;
        }
    }

    printReport()
    {
        if(0 === this.changedFiles.length){
            console.log('No changes detected.');
            return;
        }
        console.log('');
        console.log('=== FILES WITH CHANGES ===');
        console.log('');
        let folderGroups = new Map();
        for(let file of this.changedFiles){
            let folderKey = path.dirname(file.srcPath);
            if(!folderGroups.has(folderKey)){
                folderGroups.set(folderKey, { new: 0, modified: 0 });
            }
            let stats = folderGroups.get(folderKey);
            if('new' === file.changeType){
                stats.new += 1;
            }
            if('modified' === file.changeType){
                stats.modified += 1;
            }
        }
        let sortedFolders = Array.from(folderGroups.keys()).sort();
        for(let folder of sortedFolders){
            let stats = folderGroups.get(folder);
            let totalChanges = stats.new + stats.modified;
            console.log(folder);
            console.log('  Total changes: '+totalChanges.toString());
            if(0 < stats.new){
                console.log('  New files: '+stats.new.toString());
            }
            if(0 < stats.modified){
                console.log('  Modified files: '+stats.modified.toString());
            }
            console.log('');
        }
        console.log('Total files affected: '+this.changedFiles.length.toString());
        if(0 < this.hashErrors.length){
            console.log('Hash errors: '+this.hashErrors.length.toString()+' (see log for details)');
        }
    }

    async run()
    {
        this.originalMappings = this.validateConfig();
        this.modifiedTimeThresholdMs = this.resolveModifiedTimeThreshold();
        console.log('Inspecting folders for changes...');
        if(this.withHash){
            console.log('Hash comparison: ENABLED');
            console.log('Hash timeout: '+this.hashTimeoutMs.toString()+'ms');
            console.log('Max hash size: '+(this.maxHashSizeBytes / 1024 / 1024).toString()+'MB');
        }
        if(!this.withHash){
            console.log('Hash comparison: DISABLED (use --with-hash to enable)');
        }
        console.log('Modified time threshold: '+this.modifiedTimeThresholdMs.toString()+'ms');
        console.log('Mappings: '+this.describeScope());
        for(let i = 0; i < this.originalMappings.length; i++){
            if(this.interrupted){
                break;
            }
            let mapping = this.originalMappings[i];
            if(!this.isMappingIncluded(i, mapping)){
                if(false === mapping.enabled && 0 === this.selectedMappings.length){
                    console.log('Skipping disabled mapping #'+(i+1)+': '+mapping.from);
                }
                continue;
            }
            let toList = mapping.to || [];
            if(0 === toList.length){
                continue;
            }
            for(let j = 0; j < toList.length; j++){
                if(this.interrupted){
                    break;
                }
                let dest = toList[j];
                await this.inspectMappingToDest(mapping, dest, i, j);
            }
        }
        if(this.interrupted){
            // stop() saves the log and the configs, and exits:
            return;
        }
        this.printReport();
        await this.generateFolderConfig();
        await this.generateFileConfig();
        await this.generateLogFile();
        if(process.connected){
            process.disconnect();
        }
    }

}

let inspector = new RunInspectFolders();
inspector.run().catch((e) => {
    console.error('Fatal: '+e.message);
    process.exit(1);
});

module.exports.RunInspectFolders = RunInspectFolders;
