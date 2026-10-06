/**
 * Inspection Report
 *
 * Prints the inspection result in the console: the folders with changes and how many files are new, modified or to
 * remove.
 * No dependencies.
 */

const path = require('path');

class InspectionReport
{

    print(changedFiles, removals, hashErrors)
    {
        if(0 === changedFiles.length && 0 === removals.length){
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
                folderGroups.set(folderKey, { new: 0, modified: 0, removed: 0 });
            }
            let stats = folderGroups.get(folderKey);
            if('new' === file.changeType){
                stats.new += 1;
            }
            if('modified' === file.changeType){
                stats.modified += 1;
            }
        }
        for(let removal of removals){
            let folderKey = path.dirname(removal.srcPath);
            if(!folderGroups.has(folderKey)){
                folderGroups.set(folderKey, { new: 0, modified: 0, removed: 0 });
            }
            folderGroups.get(folderKey).removed += 1;
        }
        let sortedFolders = Array.from(folderGroups.keys()).sort();
        for(let folder of sortedFolders){
            let stats = folderGroups.get(folder);
            let totalChanges = stats.new + stats.modified + stats.removed;
            console.log(folder);
            console.log('  Total changes: '+totalChanges.toString());
            if(0 < stats.new){
                console.log('  New files: '+stats.new.toString());
            }
            if(0 < stats.modified){
                console.log('  Modified files: '+stats.modified.toString());
            }
            if(0 < stats.removed){
                console.log('  Files to remove: '+stats.removed.toString());
            }
            console.log('');
        }
        console.log('Total files affected: '+(changedFiles.length+removals.length).toString());
        if(0 < hashErrors.length){
            console.log('Hash errors: '+hashErrors.length.toString()+' (see log for details)');
        }
    }

}

module.exports.InspectionReport = InspectionReport;
