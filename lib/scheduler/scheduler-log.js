/**
 * Scheduler Log
 *
 * What the scheduler did, in logs/scheduler-YYYYMMDD.log (one file per day) and in the console.
 */

const fs = require('fs');
const path = require('path');
const { DateStamp } = require('../common/date-stamp');

class SchedulerLog
{

    constructor(props)
    {
        this.logsPath = props.logsPath;
        this.isConsoleOutput = props.isConsoleOutput;
        this.dateStamp = new DateStamp();
    }

    log(message)
    {
        let now = new Date();
        let line = '['+this.formatTime(now)+'] '+message;
        if(this.isConsoleOutput){
            console.log(line);
        }
        try{
            fs.appendFileSync(path.join(this.logsPath, 'scheduler-'+this.dateStamp.day(now)+'.log'), line+'\n', 'utf8');
        }catch(error){
            // the console still shows it
        }
    }

    formatTime(date)
    {
        return this.dateStamp.readable(date);
    }

}

module.exports.SchedulerLog = SchedulerLog;
