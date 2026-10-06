/**
 * File Comparison
 *
 * Decides whether a source file is new or modified compared to its copy: a different size, or a source modified
 * more than the threshold after the copy (and, with --with-hash, a different content). No dependencies.
 */

const path = require('path');

class FileComparison
{

    constructor(props)
    {
        this.hasher = props.hasher;
        this.withHash = props.withHash;
        this.maxHashSizeBytes = props.maxHashSizeBytes;
        this.modifiedTimeThresholdMs = props.modifiedTimeThresholdMs;
        this.onHashing = props.onHashing || false;
    }

    describeSettings()
    {
        let lines = [];
        if(this.withHash){
            lines.push('Hash comparison: ENABLED');
            lines.push('Hash timeout: '+this.hasher.timeoutMs.toString()+'ms');
            lines.push('Max hash size: '+(this.maxHashSizeBytes/1024/1024).toString()+'MB');
        }
        if(!this.withHash){
            lines.push('Hash comparison: DISABLED (use --with-hash to enable)');
        }
        lines.push('Modified time threshold: '+this.modifiedTimeThresholdMs.toString()+'ms');
        return lines;
    }

    async compare(srcPath, srcStat, dstPath, dstStat)
    {
        if(!dstStat){
            return {changeType: 'new', hashError: false};
        }
        if(srcStat.size !== dstStat.size){
            return {changeType: 'modified', hashError: false};
        }
        if(srcStat.mtimeMs-dstStat.mtimeMs <= this.modifiedTimeThresholdMs){
            return {changeType: '', hashError: false};
        }
        if(!this.withHash){
            return {changeType: 'modified', hashError: false};
        }
        if(srcStat.size > this.maxHashSizeBytes){
            return {changeType: 'modified', hashError: {reason: 'file-too-large', size: srcStat.size}};
        }
        let srcHash = '';
        let dstHash = '';
        try{
            if(this.onHashing){
                this.onHashing(path.basename(srcPath));
            }
            srcHash = await this.hasher.hash(srcPath);
            dstHash = await this.hasher.hash(dstPath);
        }catch(e){
            return {changeType: 'modified', hashError: {reason: e.message}};
        }
        return {changeType: srcHash !== dstHash ? 'modified' : '', hashError: false};
    }

}

module.exports.FileComparison = FileComparison;
