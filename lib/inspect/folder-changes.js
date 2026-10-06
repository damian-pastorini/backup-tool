/**
 * Folder Changes
 *
 * The changes an inspection found: every new or modified file, and the copies to remove (only for the mappings with
 * "allowRemove: true"), grouped by mapping, destination and folder.
 * No dependencies.
 */

const path = require('path');

class FolderChanges
{

    constructor()
    {
        this.folders = new Map();
        this.files = [];
        this.removals = [];
    }

    add(mappingIndex, destIndex, changedFile)
    {
        let folder = this.getFolderPath(changedFile.rel);
        let fileName = path.basename(changedFile.rel);
        this.addFolderChange(mappingIndex, destIndex, folder, changedFile.changeType, fileName);
        this.files.push(changedFile);
    }

    addRemoval(mappingIndex, destIndex, removal)
    {
        let folder = this.getFolderPath(removal.rel);
        this.addFolderChange(mappingIndex, destIndex, folder, 'missing', path.basename(removal.rel));
        this.removals.push(removal);
    }

    getFolderPath(relPath)
    {
        let dir = path.dirname(relPath);
        if('.' === dir){
            return '/';
        }
        return dir.split(path.sep).join('/');
    }

    addFolderChange(mappingIndex, destIndex, folder, changeType, fileName)
    {
        let key = mappingIndex+'-'+destIndex+'-'+folder;
        if(!this.folders.has(key)){
            this.folders.set(key, {
                mappingIndex: mappingIndex,
                destIndex: destIndex,
                folder: folder,
                new: [],
                modified: [],
                missing: []
            });
        }
        let changes = this.folders.get(key);
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

}

module.exports.FolderChanges = FolderChanges;
