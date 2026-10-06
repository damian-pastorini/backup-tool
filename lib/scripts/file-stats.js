/**
 * File Stats
 *
 * Reads a file's stats, or false when it doesn't exist or can't be read. No dependencies.
 */

const fsp = require('fs').promises;

class FileStats
{

    async read(p)
    {
        try{
            return await fsp.stat(p);
        }catch(e){
            return false;
        }
    }

}

module.exports.FileStats = FileStats;
