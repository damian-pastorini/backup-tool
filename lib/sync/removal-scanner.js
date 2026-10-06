/**
 * Removal Scanner
 *
 * With --allow-remove: removes the files of a destination whose source file doesn't exist anymore (only the ones
 * the mapping filters cover). No dependencies.
 */

const fsp = require('fs').promises;
const path = require('path');

class RemovalScanner
{

    constructor(props)
    {
        this.results = props.results;
        this.progress = props.progress;
        this.fileStats = props.fileStats;
        this.filters = props.filters;
        this.walker = props.walker;
        this.dryRun = props.dryRun;
    }

    async scan(dest, mapping, originFiles)
    {
        await this.walker.walk(dest, async (fullPath) => {
            await this.checkFile(fullPath, dest, mapping, originFiles);
        }, (folderPath, error) => {
            this.results.errors.push({ action: 'readdir', path: folderPath, message: error.message });
        });
    }

    async checkFile(full, dest, mapping, originFiles)
    {
        let relDf = this.walker.relativePath(dest, full);
        if('' === relDf){
            return;
        }
        if(this.filters.isGoogleDriveShortcut(full)){
            return;
        }
        let dstStat = await this.fileStats.read(full);
        if(!dstStat){
            return;
        }
        if(dstStat.isDirectory()){
            return;
        }
        if(!this.filters.matches(relDf, dstStat, mapping)){
            return;
        }
        if(originFiles.has(relDf)){
            return;
        }
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
