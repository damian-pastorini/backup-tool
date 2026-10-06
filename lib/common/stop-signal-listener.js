/**
 * Stop Signal Listener
 *
 * Calls onStop on Ctrl+C, when the console window is closed, or on the "stop" IPC message when the process was
 * started with child_process.fork() (used by the web panel and the scheduler). No dependencies.
 */

class StopSignalListener
{

    listen(onStop)
    {
        process.on('SIGINT', async () => {
            await onStop();
        });
        // on Windows, closing the console window emits SIGHUP and the process is killed a few seconds later:
        process.on('SIGHUP', async () => {
            await onStop();
        });
        // the console or the parent process can be gone already, ignore the output errors so the log is still saved:
        process.stdout.on('error', () => {});
        process.stderr.on('error', () => {});
        if(!process.send){
            return;
        }
        process.on('message', async (message) => {
            if('stop' === message){
                await onStop();
            }
        });
    }

}

module.exports.StopSignalListener = StopSignalListener;
