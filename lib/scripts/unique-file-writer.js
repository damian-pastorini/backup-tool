/**
 * Unique File Writer
 *
 * Writes a new file without ever overwriting another one: when the name is taken, it adds a "-2", "-3"... suffix.
 * No dependencies.
 */

const fsp = require('fs').promises;
const path = require('path');
const { FolderCreator } = require('./folder-creator');

class UniqueFileWriter
{

    constructor()
    {
        this.folderCreator = new FolderCreator();
    }

    async write(folder, baseName, extension, content)
    {
        await this.folderCreator.create(folder);
        // scheduled jobs run in parallel and can finish in the same second, never overwrite another run's file:
        for(let attempt = 1; attempt < 100; attempt++){
            let filePath = path.join(folder, baseName+(1 === attempt ? '' : '-'+attempt)+extension);
            try{
                await fsp.writeFile(filePath, content, {encoding: 'utf8', flag: 'wx'});
                return filePath;
            }catch(e){
                if('EEXIST' !== e.code){
                    throw e;
                }
            }
        }
        throw new Error('No free file name for '+baseName+extension);
    }

}

module.exports.UniqueFileWriter = UniqueFileWriter;
