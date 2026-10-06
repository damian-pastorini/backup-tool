/**
 * File Copier
 *
 * Copies a file keeping its modified time, and checks the copy: same size, and the same modified time within the
 * threshold or else the same content. No dependencies.
 */

const fsp = require('fs').promises;
const path = require('path');
const { FolderCreator } = require('../scripts/folder-creator');

class FileCopier
{

    constructor(props)
    {
        this.hasher = props.hasher;
        this.fileStats = props.fileStats;
        this.modifiedTimeThresholdMs = props.modifiedTimeThresholdMs;
        this.folderCreator = new FolderCreator();
    }

    async copy(src, dst)
    {
        let dstDir = path.dirname(dst);
        await this.folderCreator.create(dstDir);
        await fsp.copyFile(src, dst);
        let st = await fsp.stat(src);
        try{
            await fsp.utimes(dst, st.atime, st.mtime);
        }catch(e){}
    }

    async verify(src, dst)
    {
        let sst = await this.fileStats.read(src);
        let dstst = await this.fileStats.read(dst);
        if(!sst){
            return { ok: false, reason: 'src-missing' };
        }
        if(!dstst){
            return { ok: false, reason: 'dst-missing' };
        }
        if(sst.size !== dstst.size){
            return { ok: false, reason: 'size-mismatch' };
        }
        if(Math.abs(sst.mtimeMs-dstst.mtimeMs) <= this.modifiedTimeThresholdMs){
            return { ok: true, reason: 'ok' };
        }
        let sh;
        let dh;
        try{
            sh = await this.hasher.hash(src);
            dh = await this.hasher.hash(dst);
        }catch(e){
            return { ok: false, reason: 'hash-error: '+e.message };
        }
        if(sh !== dh){
            return { ok: false, reason: 'hash-mismatch' };
        }
        return { ok: true, reason: 'hash-ok' };
    }

}

module.exports.FileCopier = FileCopier;
