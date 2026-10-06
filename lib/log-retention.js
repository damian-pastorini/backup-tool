/**
 * Log Retention
 *
 * Removes the run logs (sync, inspection and scheduler logs) older than settings.logs.keepDays (30 by default).
 * It's on by default; set settings.logs.removeOldLogs to false in configurations/inspect.config.js to keep every log.
 * No dependencies, so the scheduler only needs Node.js.
 */

const fs = require('fs');
const path = require('path');

class LogRetention
{

    constructor(props)
    {
        this.logsPath = props.logsPath;
        this.defaultKeepDays = 30;
        this.logPattern = /^(sync|inspect-folders|scheduler)-\d{8}(-\d{6})?(-\d+)?\.log$/;
    }

    resolve(settings)
    {
        let logs = settings && settings.logs ? settings.logs : {};
        let keepDays = Number(logs.keepDays);
        return {
            removeOldLogs: false !== logs.removeOldLogs,
            keepDays: Number.isInteger(keepDays) && 1 <= keepDays ? keepDays : this.defaultKeepDays
        };
    }

    clean(settings, now)
    {
        let options = this.resolve(settings);
        if(!options.removeOldLogs || !fs.existsSync(this.logsPath)){
            return {options: options, removed: []};
        }
        let limitMs = (now || new Date()).getTime()-options.keepDays*86400000;
        let removed = [];
        for(let name of fs.readdirSync(this.logsPath)){
            if(!this.logPattern.test(name)){
                continue;
            }
            let filePath = path.join(this.logsPath, name);
            try{
                if(fs.statSync(filePath).mtimeMs < limitMs){
                    fs.unlinkSync(filePath);
                    removed.push(name);
                }
            }catch(error){
                // a log that can't be read or removed now is retried on the next cleanup
            }
        }
        return {options: options, removed: removed};
    }

}

module.exports.LogRetention = LogRetention;
