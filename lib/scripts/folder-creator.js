/**
 * Folder Creator
 *
 * Creates a folder and its missing parents. No dependencies.
 */

const fsp = require('fs').promises;

class FolderCreator
{

    async create(dir)
    {
        try{
            await fsp.mkdir(dir, { recursive: true });
        }catch(e){
            if('EEXIST' !== e.code){
                throw e;
            }
        }
    }

}

module.exports.FolderCreator = FolderCreator;
