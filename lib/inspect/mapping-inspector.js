/**
 * Mapping Inspector
 *
 * Compares every file of a mapping's source folder with one of its destinations and records the new and modified
 * ones. For the mappings with "allowRemove: true" it also lists the copies whose source doesn't exist anymore.
 * Copies and removes nothing. No dependencies.
 */

const fs = require('fs');
const path = require('path');
const { OrphanedCopyFinder } = require('../scripts/orphaned-copy-finder');

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
        this.orphanFinder = new OrphanedCopyFinder({
            fileStats: props.fileStats,
            filters: props.filters,
            walker: props.walker
        });
        this.sourceFiles = new Map();
        this.sourceReadProblems = 0;
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
        this.sourceFiles = new Map();
        this.sourceReadProblems = 0;
        await this.walkAndProcess(originRoot, dest, mapping, mappingIndex, destIndex);
        if(true === mapping.allowRemove){
            await this.findRemovals(mapping, dest, mappingIndex, destIndex);
        }
    }

    async findRemovals(mapping, dest, mappingIndex, destIndex)
    {
        if(this.walker.isStopped()){
            return;
        }
        // a source file that could not be read would look deleted, and its copy would be removed:
        if(0 < this.sourceReadProblems){
            console.log(
                'Removals not checked for '+dest+': '+this.sourceReadProblems
                +' source folders or files could not be read.'
            );
            return;
        }
        await this.orphanFinder.find(dest, mapping, this.sourceFiles, (full, rel) => {
            this.changes.addRemoval(mappingIndex, destIndex, {
                srcPath: path.join(mapping.from, rel),
                dstPath: full,
                rel: rel,
                mapping: mapping
            });
        });
    }

    async walkAndProcess(originRoot, dest, mapping, mappingIndex, destIndex)
    {
        await this.walker.walk(originRoot, async (full) => {
            await this.processFile(full, originRoot, dest, mapping, mappingIndex, destIndex);
            this.filesProcessed += 1;
            if(0 === this.filesProcessed % 50){
                process.stdout.write(
                    '\rProcessing ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '
                    +this.filesProcessed.toString()+' files...'+' '.repeat(20)
                );
            }
        }, () => {
            this.sourceReadProblems += 1;
        });
        if(0 < this.filesProcessed){
            process.stdout.write(
                '\rDone ['+this.currentOriginFolder+' > '+this.currentDestFolder+']: '
                +this.filesProcessed.toString()+' files.'+' '.repeat(20)+'\n'
            );
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
            this.sourceReadProblems += 1;
            return;
        }
        if(srcStat.isDirectory()){
            return;
        }
        if(!this.filters.matches(rel, srcStat, mapping)){
            return;
        }
        this.sourceFiles.set(rel, true);
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
