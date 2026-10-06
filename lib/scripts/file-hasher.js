/**
 * File Hasher
 *
 * MD5 of a file's content, with a time limit for files on slow or unplugged drives. No dependencies.
 */

const fs = require('fs');
const crypto = require('crypto');

class FileHasher
{

    constructor(props)
    {
        this.timeoutMs = props.timeoutMs;
    }

    hash(p)
    {
        return new Promise((resolve, reject) => {
            let h = crypto.createHash('md5');
            let s = fs.createReadStream(p);
            let done = false;
            let timeoutId = setTimeout(() => {
                if(done){
                    return;
                }
                done = true;
                s.destroy();
                reject(new Error('hash-timeout'));
            }, this.timeoutMs);
            s.on('data', (chunk) => {
                if(done){
                    return;
                }
                h.update(chunk);
            });
            s.on('error', (e) => {
                if(done){
                    return;
                }
                done = true;
                clearTimeout(timeoutId);
                reject(e);
            });
            s.on('end', () => {
                if(done){
                    return;
                }
                done = true;
                clearTimeout(timeoutId);
                resolve(h.digest('hex'));
            });
        });
    }

}

module.exports.FileHasher = FileHasher;
