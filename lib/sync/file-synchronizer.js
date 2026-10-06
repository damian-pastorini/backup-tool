/**
 * File Synchronizer
 *
 * Copies the new and changed files of a mapping to one destination: every file of a source folder, or one file of a
 * generated file list. Keeps the source files it saw, so the removal scan knows which copies have no source anymore.
 * No dependencies.
 */

const path = require('path');

class FileSynchronizer
{

    constructor(props)
    {
        this.results = props.results;
        this.progress = props.progress;
        this.comparison = props.comparison;
        this.copier = props.copier;
        this.fileStats = props.fileStats;
        this.filters = props.filters;
        this.walker = props.walker;
        this.dryRun = props.dryRun;
        this.isStopped = props.isStopped;
        this.originFiles = new Map();
    }

    async syncListedFile(srcPath, dstPath)
    {
        if(this.isStopped()){
            return;
        }
        if(this.filters.isGoogleDriveShortcut(srcPath)){
            return;
        }
        let srcStat = await this.fileStats.read(srcPath);
        if(!srcStat){
            this.results.errors.push({ action: 'stat', src: srcPath, message: 'source file not found' });
            return;
        }
        if(srcStat.isDirectory()){
            return;
        }
        this.progress.showFolder(path.dirname(srcPath));
        await this.syncOne(srcPath, srcStat, dstPath, path.basename(srcPath), srcPath);
    }

    async syncFolder(originRoot, dest, mapping)
    {
        this.originFiles.clear();
        await this.walker.walk(originRoot, async (fullPath) => {
            await this.syncFolderFile(fullPath, originRoot, dest, mapping);
        }, (folderPath, error) => {
            this.results.errors.push({ action: 'readdir', path: folderPath, message: error.message });
        });
    }

    async syncFolderFile(fullPath, originRoot, dest, mapping)
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
        this.originFiles.set(rel, true);
        this.progress.showFolder(path.dirname(fullPath));
        await this.syncOne(fullPath, srcStat, path.join(dest, rel), rel, rel);
    }

    async syncOne(srcPath, srcStat, dstPath, rel, reportedName)
    {
        let fileName = path.basename(rel);
        let dstStat = await this.fileStats.read(dstPath);
        if(dstStat && dstStat.isDirectory()){
            this.progress.showFile(fileName, 'SKIP (dest is directory)', 20);
            return;
        }
        let comparison = await this.comparison.compare(srcPath, srcStat, dstPath, dstStat);
        if(comparison.hashError){
            this.results.hashErrors.push(Object.assign({ file: reportedName }, comparison.hashError));
        }
        let item = { src: srcPath, dst: dstPath, rel: rel };
        if('' === comparison.changeType){
            this.results.alreadySyncedFiles.push(item);
            this.progress.showFile(fileName, 'OK', 50);
            return;
        }
        if(this.dryRun){
            this.results.syncedFiles.push(item);
            this.progress.showFile(fileName, 'SYNC (DRY-RUN)', 20);
            return;
        }
        try{
            await this.copier.copy(srcPath, dstPath);
            let v = await this.copier.verify(srcPath, dstPath);
            if(!v.ok){
                this.results.errors.push({ action: 'verify', src: srcPath, dst: dstPath, message: v.reason });
            }
            this.results.syncedFiles.push(item);
        }catch(e){
            this.results.errors.push({ action: 'copy', src: srcPath, dst: dstPath, message: e.message });
        }
        this.progress.showFile(fileName, 'SYNC', 50);
    }

}

module.exports.FileSynchronizer = FileSynchronizer;
