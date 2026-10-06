/**
 * Folder Browser
 *
 * Lists drives and sub-folders for the folder picker of the web panel. Browsers never give a page the full path of a
 * folder picked with their own dialog, so the panel asks this local server instead.
 * It uses fs directly: listing has to survive protected folders (access denied) and any valid Windows folder name.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

class FolderBrowser
{

    constructor()
    {
        this.driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        this.systemNames = ['system volume information', '$recycle.bin', '$windows.~bt', '$windows.~ws', 'recovery'];
        this.invalidNamePattern = /[<>:"/\\|?*]/;
    }

    async listRoots()
    {
        let roots = [];
        if('win32' !== process.platform){
            roots.push({name: '/', path: '/'});
        }
        if('win32' === process.platform){
            let checks = this.driveLetters.map(async (letter) => {
                let root = letter+':\\';
                try{
                    await fs.promises.access(root);
                    return {name: root, path: root};
                }catch(error){
                    return false;
                }
            });
            for(let drive of await Promise.all(checks)){
                if(drive){
                    roots.push(drive);
                }
            }
        }
        let home = os.homedir();
        roots.push({name: 'Home ('+home+')', path: home});
        return {path: '', parent: '', folders: roots, isRoots: true};
    }

    async list(folderPath)
    {
        if(!folderPath){
            return this.listRoots();
        }
        let target = path.resolve(String(folderPath));
        let entries;
        try{
            entries = await fs.promises.readdir(target, {withFileTypes: true});
        }catch(error){
            return {error: this.describeError(error, target)};
        }
        let folders = [];
        for(let entry of entries){
            // junctions and links are skipped, Windows uses them for legacy folder names that can't be opened
            if(!entry.isDirectory()){
                continue;
            }
            folders.push({
                name: entry.name,
                path: path.join(target, entry.name),
                hidden: '.' === entry.name.charAt(0) || '$' === entry.name.charAt(0),
                system: -1 !== this.systemNames.indexOf(entry.name.toLowerCase())
            });
        }
        folders.sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true});
        });
        let parent = path.dirname(target);
        return {
            path: target,
            parent: parent === target ? '' : parent,
            folders: folders,
            isRoots: false
        };
    }

    async createFolder(parentPath, name)
    {
        let folderName = String(name || '').trim();
        if('' === folderName || '.' === folderName || '..' === folderName || this.invalidNamePattern.test(folderName)){
            return {error: 'Invalid folder name, these characters are not allowed: < > : " / \\ | ? *'};
        }
        let parent = path.resolve(String(parentPath || ''));
        let target = path.join(parent, folderName);
        try{
            await fs.promises.mkdir(target);
        }catch(error){
            return {error: this.describeError(error, target)};
        }
        return {path: target};
    }

    describeError(error, target)
    {
        if('ENOENT' === error.code){
            return 'Folder not found: '+target;
        }
        if('EACCES' === error.code || 'EPERM' === error.code){
            return 'Access denied: '+target;
        }
        if('EEXIST' === error.code){
            return 'A folder with that name already exists: '+target;
        }
        if('ENOTDIR' === error.code){
            return 'Not a folder: '+target;
        }
        return error.message;
    }

}

module.exports.FolderBrowser = FolderBrowser;
