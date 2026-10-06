/**
 * Script Processes
 *
 * Runs the inspect and sync scripts of the scheduled jobs as child processes (several at the same time), writes their
 * output to the scheduler log, and reads the files they generated, the changes and the errors from it.
 */

const path = require('path');
const { fork } = require('child_process');

class ScriptProcesses
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.logger = props.logger;
        this.children = new Set();
        // not anchored: a progress line without its line break can come before the match
        this.outputFilePattern = /(Log file|File config): (.+)$/;
        this.changesPattern = /^Total files affected: (\d+)/;
        this.errorsPattern = /^Errors: (\d+)/;
    }

    run(script, args, runLabel)
    {
        return new Promise((resolve) => {
            let result = {code: null, files: {}, changes: 0, errors: 0};
            let pending = '';
            // forked with an IPC channel, so stopAll() can ask the script to stop and save its log:
            let child = fork(path.join(this.rootPath, script), args, {cwd: this.rootPath, silent: true, windowsHide: true});
            this.children.add(child);
            let onData = (chunk) => {
                pending += chunk.toString();
                let lines = pending.split(/\r?\n/);
                pending = lines.pop();
                for(let line of lines){
                    this.handleLine(line, result, runLabel);
                }
            };
            child.stdout.on('data', onData);
            child.stderr.on('data', onData);
            child.on('error', (error) => {
                this.logger.log('['+runLabel+'] Could not start '+script+': '+error.message);
                result.code = -1;
                resolve(result);
            });
            child.on('close', (code) => {
                this.children.delete(child);
                if('' !== pending){
                    this.handleLine(pending, result, runLabel);
                }
                if(null === result.code){
                    result.code = code;
                }
                resolve(result);
            });
        });
    }

    handleLine(rawLine, result, runLabel)
    {
        // progress lines overwrite themselves with "\r", keep what would be visible in a console:
        let line = rawLine.substring(rawLine.lastIndexOf('\r')+1).trim();
        if('' === line){
            return;
        }
        let fileMatch = this.outputFilePattern.exec(line);
        if(fileMatch){
            result.files[fileMatch[1]] = path.basename(fileMatch[2].trim());
        }
        let changesMatch = this.changesPattern.exec(line);
        if(changesMatch){
            result.changes = Number(changesMatch[1]);
        }
        let errorsMatch = this.errorsPattern.exec(line);
        if(errorsMatch){
            result.errors = Number(errorsMatch[1]);
        }
        this.logger.log('['+runLabel+'] '+line);
    }

    stopAll()
    {
        // the scripts save their log, marked INTERRUPTED, then exit:
        for(let child of this.children){
            if(child.connected){
                child.send('stop');
            }
        }
    }

    hasRunning()
    {
        return 0 < this.children.size;
    }

}

module.exports.ScriptProcesses = ScriptProcesses;
