/**
 * Inspection Report
 *
 * Prints the inspection result in the console: the folders with changes and how many files are new or modified.
 * No dependencies.
 */

const path = require('path');

class InspectionReport
{

    print(changedFiles, hashErrors)
    {
        if(0 === changedFiles.length){
            console.log('No changes detected.');
            return;
        }
        console.log('');
        console.log('=== FILES WITH CHANGES ===');
        console.log('');
        let folderGroups = new Map();
        for(let file of changedFiles){
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
        console.log('Total files affected: '+changedFiles.length.toString());
        if(0 < hashErrors.length){
            console.log('Hash errors: '+hashErrors.length.toString()+' (see log for details)');
        }
    }

}

module.exports.InspectionReport = InspectionReport;
