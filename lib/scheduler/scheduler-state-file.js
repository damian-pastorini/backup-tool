/**
 * Scheduler State File
 *
 * logs/scheduler-state.json: the scheduled jobs and their last results, kept across restarts.
 */

const fs = require('fs');

class SchedulerStateFile
{

    constructor(props)
    {
        this.statePath = props.statePath;
    }

    load()
    {
        try{
            return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        }catch(error){
            return {};
        }
    }

    write(state)
    {
        try{
            fs.writeFileSync(this.statePath+'.tmp', JSON.stringify(state, null, 4), 'utf8');
            fs.renameSync(this.statePath+'.tmp', this.statePath);
        }catch(error){
            // the state file only keeps the last results across restarts, the next minute writes it again
        }
    }

}

module.exports.SchedulerStateFile = SchedulerStateFile;
