/**
 * Folder Walker
 *
 * Goes through every file of a folder and its subfolders, until isStopped() returns true. Folders that can't be
 * read are reported to onReadError and skipped. No dependencies.
 */

const fsp = require('fs').promises;
const path = require('path');

class FolderWalker
{

    constructor(props)
    {
        this.isStopped = props.isStopped;
    }

    async walk(rootPath, onFile, onReadError)
    {
        let stack = [rootPath];
        while(0 < stack.length){
            if(this.isStopped()){
                break;
            }
            let current = stack.pop();
            let dirents;
            try{
                dirents = await fsp.readdir(current, { withFileTypes: true });
            }catch(e){
                if(onReadError){
                    onReadError(current, e);
                }
                continue;
            }
            for(let d of dirents){
                if(this.isStopped()){
                    break;
                }
                let full = path.join(current, d.name);
                if(d.isDirectory()){
                    stack.push(full);
                    continue;
                }
                if(!d.isFile()){
                    continue;
                }
                await onFile(full);
            }
        }
    }

    relativePath(base, p)
    {
        let rel = path.relative(base, p);
        if('' === rel){
            return '';
        }
        return rel.split(path.sep).join('/');
    }

}

module.exports.FolderWalker = FolderWalker;
