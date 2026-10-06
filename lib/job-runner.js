/**
 * Job Runner
 *
 * Runs one sync or inspect script at a time as a forked child process and keeps its console output.
 * Stopping sends the "stop" IPC message so the script can save its log before exiting.
 * Optional callbacks: onOutput(text) gets the raw script output, onJobChange(job) runs when a job starts and ends.
 */

const { fork } = require('child_process');
const { FileHandler } = require('@reldens/server-utils');

class JobRunner
{

    constructor(props)
    {
        this.rootPath = props.rootPath;
        this.onOutput = props.onOutput || false;
        this.onJobChange = props.onJobChange || false;
        this.maxOutputLines = 2000;
        this.stopTimeoutMs = 15000;
        // not anchored: a progress line without its line break can come before the match
        this.outputFilePattern = /(Log file|Folder config|File config): (.+)$/;
        this.job = false;
        this.child = false;
        this.nextId = 1;
    }

    isRunning()
    {
        return false !== this.job && this.job.running;
    }

    start(label, script, args)
    {
        if(this.isRunning()){
            return false;
        }
        let job = {
            id: this.nextId,
            label: label,
            script: script,
            args: args,
            running: true,
            stopping: false,
            startedAt: new Date().toISOString(),
            finishedAt: '',
            exitCode: null,
            lines: [],
            totalLines: 0,
            currentLine: '',
            outputFiles: {}
        };
        this.nextId += 1;
        this.job = job;
        let child = fork(FileHandler.joinPaths(this.rootPath, script), args, {cwd: this.rootPath, silent: true});
        this.child = child;
        child.stdout.on('data', (chunk) => {
            this.receiveOutput(job, chunk.toString());
        });
        child.stderr.on('data', (chunk) => {
            this.receiveOutput(job, chunk.toString());
        });
        child.on('error', (error) => {
            this.receiveOutput(job, '\nProcess error: '+error.message+'\n');
            if(!child.pid){
                this.finish(job, -1);
            }
        });
        child.on('close', (code) => {
            this.finish(job, code);
        });
        this.notifyJobChange(job);
        return job;
    }

    receiveOutput(job, text)
    {
        this.appendOutput(job, text);
        if(this.onOutput){
            this.onOutput(text);
        }
    }

    notifyJobChange(job)
    {
        if(this.onJobChange){
            this.onJobChange(job);
        }
    }

    stop()
    {
        if(!this.isRunning()){
            return false;
        }
        let job = this.job;
        let child = this.child;
        job.stopping = true;
        if(child.connected){
            child.send('stop');
        }
        setTimeout(() => {
            if(job.running){
                this.receiveOutput(job, '\nThe script did not stop in time, killing it (its log may not be saved).\n');
                child.kill();
            }
        }, this.stopTimeoutMs);
        return true;
    }

    appendOutput(job, text)
    {
        for(let part of text.split(/(\r\n|\n|\r)/)){
            if('\n' === part || '\r\n' === part){
                this.pushLine(job, job.currentLine.trimEnd());
                job.currentLine = '';
                continue;
            }
            if('\r' === part){
                job.currentLine = '';
                continue;
            }
            job.currentLine += part;
        }
    }

    pushLine(job, line)
    {
        job.lines.push(line);
        job.totalLines += 1;
        if(this.maxOutputLines < job.lines.length){
            job.lines.shift();
        }
        let match = this.outputFilePattern.exec(line);
        if(match){
            job.outputFiles[match[1]] = FileHandler.getFileName(match[2].trim()) || match[2].trim();
        }
    }

    finish(job, code)
    {
        if(!job.running){
            return;
        }
        if('' !== job.currentLine.trim()){
            this.pushLine(job, job.currentLine.trimEnd());
        }
        job.currentLine = '';
        job.running = false;
        job.exitCode = code;
        job.finishedAt = new Date().toISOString();
        this.notifyJobChange(job);
    }

    serialize(fromLine)
    {
        if(!this.job){
            return false;
        }
        let job = this.job;
        let firstLine = job.totalLines-job.lines.length;
        let from = Math.max(Number(fromLine) || 0, firstLine);
        return {
            id: job.id,
            label: job.label,
            command: 'node '+[job.script].concat(job.args).join(' '),
            running: job.running,
            stopping: job.stopping,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            exitCode: job.exitCode,
            outputFiles: job.outputFiles,
            skippedLines: from-(Number(fromLine) || 0),
            lines: job.lines.slice(from-firstLine),
            nextLine: job.totalLines,
            currentLine: job.currentLine.trimEnd()
        };
    }

}

module.exports.JobRunner = JobRunner;
