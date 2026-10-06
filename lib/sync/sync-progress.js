/**
 * Sync Progress
 *
 * The console output of a sync run: the folder being synced and one line per file that overwrites itself.
 * No dependencies.
 */

class SyncProgress
{

    constructor()
    {
        this.lastPrintedFolder = '';
        this.filesProcessed = 0;
    }

    startDestination(isFileMode)
    {
        this.filesProcessed = 0;
        if(!isFileMode){
            this.lastPrintedFolder = '';
        }
    }

    hasPrintedFolder()
    {
        return '' !== this.lastPrintedFolder;
    }

    showFolder(folderPath)
    {
        if(this.lastPrintedFolder !== folderPath){
            if('' !== this.lastPrintedFolder){
                process.stdout.write('\n');
            }
            process.stdout.write('Sync mapped folder: '+folderPath+'\n');
            this.lastPrintedFolder = folderPath;
        }
    }

    showFile(fileName, status, padding)
    {
        this.filesProcessed += 1;
        process.stdout.write('\r'+fileName+' - '+status+' '.repeat(padding));
    }

    showHashing(fileName)
    {
        process.stdout.write('\rHashing ['+fileName+']: '+this.filesProcessed.toString()+' files...'+' '.repeat(30));
    }

}

module.exports.SyncProgress = SyncProgress;
