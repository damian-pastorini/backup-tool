/**
 * Scheduler Lock
 *
 * logs/scheduler.lock: stops a second Backup Tool process from running the same scheduled jobs twice.
 */

const fs = require('fs');

class SchedulerLock
{

    constructor(props)
    {
        this.lockPath = props.lockPath;
        this.staleStateMs = props.staleStateMs;
        this.error = '';
    }

    acquire(previousState)
    {
        let lockedPid = 0;
        try{
            lockedPid = Number(fs.readFileSync(this.lockPath, 'utf8').trim());
        }catch(error){
            lockedPid = 0;
        }
        let updatedAt = previousState.updatedAt ? new Date(previousState.updatedAt).getTime() : 0;
        // a lock left by a crash can point to a PID that Windows reused, a live scheduler updates its state every minute:
        let isRecent = Date.now()-updatedAt < this.staleStateMs;
        if(lockedPid && lockedPid !== process.pid && this.isProcessAlive(lockedPid) && isRecent){
            this.error = 'Another Backup Tool process (PID '+lockedPid+') is already running the schedules.';
            console.log(this.error);
            return false;
        }
        fs.writeFileSync(this.lockPath, String(process.pid), 'utf8');
        process.on('exit', () => {
            this.release();
        });
        return true;
    }

    release()
    {
        try{
            if(process.pid === Number(fs.readFileSync(this.lockPath, 'utf8').trim())){
                fs.unlinkSync(this.lockPath);
            }
        }catch(error){
            // already removed
        }
    }

    isProcessAlive(pid)
    {
        try{
            process.kill(pid, 0);
            return true;
        }catch(error){
            return 'EPERM' === error.code;
        }
    }

}

module.exports.SchedulerLock = SchedulerLock;
