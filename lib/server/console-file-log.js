/**
 * Console File Log
 *
 * Copies everything written to the console into logs/console-YYYYMMDD.log (one file per day). Used when the Backup
 * Tool runs without a console window (started from the tray, with --log-console), so its output isn't lost.
 */

const fs = require('fs');
const path = require('path');

class ConsoleFileLog
{

    constructor(props)
    {
        this.logsPath = props.logsPath;
    }

    start()
    {
        fs.mkdirSync(this.logsPath, {recursive: true});
        for(let stream of [process.stdout, process.stderr]){
            let originalWrite = stream.write.bind(stream);
            stream.write = (chunk, encoding, callback) => {
                this.append(chunk);
                return originalWrite(chunk, encoding, callback);
            };
        }
    }

    append(chunk)
    {
        let now = new Date();
        let pad2 = (value) => {
            return (10 > value ? '0' : '')+value;
        };
        let day = now.getFullYear().toString()+pad2(now.getMonth()+1)+pad2(now.getDate());
        try{
            fs.appendFileSync(path.join(this.logsPath, 'console-'+day+'.log'), String(chunk), 'utf8');
        }catch(error){
            // the output still goes to the (hidden) console
        }
    }

}

module.exports.ConsoleFileLog = ConsoleFileLog;
