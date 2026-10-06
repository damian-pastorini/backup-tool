/**
 * Mapping Inspector
 *
 * Compares every file of a mapping's source folder with one of its destinations and records the new and modified
 * ones. Copies nothing. No dependencies.
 */

const fs = require('fs');
const path = require('path');

class MappingInspector
{

    constructor(props)
    {
        this.changes = props.changes;
        this.hashErrors = props.hashErrors;
        this.comparison = props.comparison;
        this.fileStats = props.fileStats;
        this.filters = props.filters;
        this.walker = props.walker;
        this.currentOriginFolder = '';
        this.currentDestFolder = '';
        this.filesProcessed = 0;
    }

    async inspect(mapping, dest, mappingIndex, destIndex)
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

    async walkAndProcess(originRoot, dest, mapping, mappingIndex, destIndex)
    {
        await this.walker.walk(originRoot, async (full) => {
            await this.processFile(full, originRoot, dest, mapping, mappingIndex, destIndex);
            this.filesProcessed += 1;
            if(0 === this.filesProcessed % 50){
                process.stdout.write('\rProcessing ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '+this.filesProcessed.toString()+' files...'+' '.repeat(20));
            }
        });
        if(0 < this.filesProcessed){
            process.stdout.write('\rDone ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '+this.filesProcessed.toString()+' files.'+' '.repeat(20)+'\n');
        }
    }

    async processFile(fullPath, originRoot, dest, mapping, mappingIndex, destIndex)
    {
        let rel = this.walker.relativePath(originRoot, fullPath);
        if('' === rel){
            return;
        }
        if(this.filters.isGoogleDriveShortcut(fullPath)){
            return;
        }
        let srcStat = await this.fileStats.read(fullPath);
        if(!srcStat){
            return;
        }
        if(srcStat.isDirectory()){
            return;
        }
        if(!this.filters.matches(rel, srcStat, mapping)){
            return;
        }
        let dstPath = path.join(dest, rel);
        let dstStat = await this.fileStats.read(dstPath);
        let comparison = await this.comparison.compare(fullPath, srcStat, dstPath, dstStat);
        if(comparison.hashError){
            this.hashErrors.push(Object.assign({ file: rel }, comparison.hashError));
        }
        if('' === comparison.changeType){
            return;
        }
        this.changes.add(mappingIndex, destIndex, {
            srcPath: fullPath,
            dstPath: dstPath,
            rel: rel,
            changeType: comparison.changeType,
            mapping: mapping
        });
    }

}

module.exports.MappingInspector = MappingInspector;
