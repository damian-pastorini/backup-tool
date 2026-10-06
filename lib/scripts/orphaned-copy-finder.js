/**
 * Orphaned Copy Finder
 *
 * Finds the files of a destination whose source file doesn't exist anymore (only the ones the mapping filters
 * cover), for the removals of --allow-remove and of the mappings with "allowRemove: true". No dependencies.
 */

class OrphanedCopyFinder
{

    constructor(props)
    {
        this.fileStats = props.fileStats;
        this.filters = props.filters;
        this.walker = props.walker;
    }

    async find(dest, mapping, sourceFiles, onOrphan, onReadError)
    {
        await this.walker.walk(dest, async (full) => {
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
            if(sourceFiles.has(relDf)){
                return;
            }
            await onOrphan(full, relDf);
        }, onReadError);
    }

}

module.exports.OrphanedCopyFinder = OrphanedCopyFinder;
