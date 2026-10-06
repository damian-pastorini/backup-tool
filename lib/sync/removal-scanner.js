/**
 * Removal Scanner
 *
 * Removes the destination files whose source file doesn't exist anymore: by scanning a destination (folder configs,
 * with --allow-remove or "allowRemove: true"), or from the "remove" list of a generated file list, which the
 * inspection writes for the mappings with "allowRemove: true". No dependencies.
 */

const fsp = require('fs').promises;
const path = require('path');
const { OrphanedCopyFinder } = require('../scripts/orphaned-copy-finder');

class RemovalScanner
{

    constructor(props)
    {
        this.results = props.results;
        this.progress = props.progress;
        this.fileStats = props.fileStats;
        this.dryRun = props.dryRun;
        this.isStopped = props.isStopped;
        this.orphanFinder = new OrphanedCopyFinder({
            fileStats: props.fileStats,
            filters: props.filters,
            walker: props.walker
        });
    }

    async scan(dest, mapping, originFiles)
    {
        await this.orphanFinder.find(dest, mapping, originFiles, async (full, relDf) => {
            await this.removeFile(full, relDf);
        }, (folderPath, error) => {
            this.results.errors.push({ action: 'readdir', path: folderPath, message: error.message });
        });
    }

    async removeListed(removals)
    {
        for(let removal of removals){
            if(this.isStopped()){
                break;
            }
            // the source can be back since the inspection listed it, then the copy is kept:
            if(await this.fileStats.read(removal.source)){
                continue;
            }
            let dstStat = await this.fileStats.read(removal.path);
            if(!dstStat || dstStat.isDirectory()){
                continue;
            }
            await this.removeFile(removal.path, path.basename(removal.path));
        }
    }

    async removeFile(full, relDf)
    {
        this.results.removedFiles.push({ path: full, rel: relDf });
        this.progress.showFolder(path.dirname(full));
        let fileName = path.basename(relDf);
        if(this.dryRun){
            this.progress.showFile(fileName, 'RM (DRY-RUN)', 20);
            return;
        }
        try{
            await fsp.unlink(full);
        }catch(e){
            this.results.errors.push({ action: 'remove', path: full, message: e.message });
        }
        this.progress.showFile(fileName, 'RM', 20);
    }

}

module.exports.RemovalScanner = RemovalScanner;
