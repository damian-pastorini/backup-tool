class JobMonitor
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.messages = props.messages;
        this.openLog = props.openLog;
        this.openConfig = props.openConfig;
        this.refresh = props.refresh;
        this.updateSyncForm = props.updateSyncForm;
        this.jobId = 0;
        this.nextLine = 0;
        this.outputLines = [];
        this.maxOutputLines = 2000;
        this.pollTimer = false;
        this.polling = false;
        this.wasRunning = false;
        this.pollIntervalMs = 1000;
    }

    setup()
    {
        this.dom.byId('stop-job').addEventListener('click', () => {
            this.stopJob();
        });
    }

    async startJob(params)
    {
        try{
            await this.api.request('/api/run', params);
        }catch(error){
            this.messages.showError(error.message);
            return;
        }
        this.messages.hideError();
        this.wasRunning = true;
        this.dom.byId('job').hidden = false;
        this.dom.byId('run-panel').scrollIntoView({behavior: 'smooth'});
        this.pollJob();
    }

    async stopJob()
    {
        try{
            await this.api.request('/api/stop', {});
        }catch(error){
            this.messages.showError(error.message);
        }
        this.pollJob();
    }

    handleStatusJob(job)
    {
        if(!job){
            this.renderJobPill(false);
            return;
        }
        if(job.id !== this.jobId || (job.running && !this.polling)){
            this.pollJob();
            return;
        }
        this.renderJobPill(job);
    }

    async pollJob()
    {
        clearTimeout(this.pollTimer);
        this.polling = true;
        let requestedFrom = this.nextLine;
        let data;
        try{
            data = await this.api.request('/api/job?from='+requestedFrom);
        }catch(error){
            this.pollTimer = setTimeout(() => {
                this.pollJob();
            }, 3000);
            return;
        }
        let job = data.job;
        if(!job){
            this.polling = false;
            return;
        }
        if(job.id !== this.jobId){
            this.jobId = job.id;
            this.nextLine = 0;
            this.outputLines = [];
            if(0 !== requestedFrom){
                return this.pollJob();
            }
        }
        this.panelStatus.setJob(job);
        this.appendJobOutput(job);
        this.renderJob(job);
        if(job.running){
            this.wasRunning = true;
            this.pollTimer = setTimeout(() => {
                this.pollJob();
            }, this.pollIntervalMs);
            return;
        }
        this.polling = false;
        if(this.wasRunning){
            this.wasRunning = false;
            await this.refresh();
        }
    }

    appendJobOutput(job)
    {
        let output = this.dom.byId('job-output');
        let isAtBottom = output.scrollTop+output.clientHeight >= output.scrollHeight-40;
        if(0 < job.skippedLines){
            this.outputLines.push('... '+this.formatter.number(job.skippedLines)+' older lines not shown ...');
        }
        for(let line of job.lines){
            this.outputLines.push(line);
        }
        if(this.maxOutputLines < this.outputLines.length){
            this.outputLines.splice(0, this.outputLines.length-this.maxOutputLines);
        }
        this.nextLine = job.nextLine;
        this.dom.byId('job-lines').textContent = 0 < this.outputLines.length ? this.outputLines.join('\n')+'\n' : '';
        this.dom.byId('job-current').textContent = job.currentLine || '';
        if(isAtBottom){
            output.scrollTop = output.scrollHeight;
        }
    }

    renderJob(job)
    {
        this.dom.byId('job').hidden = false;
        this.dom.byId('job-label').textContent = job.label;
        this.dom.byId('job-command').textContent = job.command;
        let state = '';
        if(job.running){
            state = (job.stopping ? 'Stopping... ' : 'Running since ')+new Date(job.startedAt).toLocaleTimeString()
                +'. Closing the Backup Tool console window cancels it.';
        }
        if(!job.running){
            state = (0 === job.exitCode ? 'Finished at ' : 'Ended with exit code '+job.exitCode+' at ')
                +new Date(job.finishedAt).toLocaleTimeString();
        }
        this.dom.byId('job-state').textContent = '- '+state;
        let stopButton = this.dom.byId('stop-job');
        stopButton.hidden = !job.running;
        stopButton.disabled = job.stopping;
        this.dom.byId('job-files').replaceChildren(...this.buildOutputFileButtons(job));
        this.renderJobPill(job);
    }

    buildOutputFileButtons(job)
    {
        let files = [];
        if(job.outputFiles['Log file']){
            let logName = job.outputFiles['Log file'];
            files.push(this.dom.h('button', {type: 'button', class: 'small', text: 'View log', onclick: () => {
                this.openLog(logName);
            }}));
        }
        if(job.outputFiles['File config']){
            let fileConfig = job.outputFiles['File config'];
            files.push(this.dom.h('button', {
                type: 'button',
                class: 'small',
                text: 'View changed files',
                onclick: () => {
                    this.openConfig(fileConfig);
                }
            }));
            files.push(this.dom.h('button', {
                type: 'button',
                class: 'small primary',
                text: 'Preview sync of these files',
                onclick: () => {
                    this.startJob({action: 'sync', config: fileConfig, dryRun: true});
                }
            }));
        }
        return files;
    }

    renderJobPill(job)
    {
        let pill = this.dom.byId('job-pill');
        let isRunning = job && job.running;
        pill.className = 'pill '+(isRunning ? 'running' : 'muted');
        pill.textContent = isRunning ? 'Running: '+job.label : 'Idle';
        this.dom.byId('run-inspect').disabled = !!isRunning;
        // per-mapping Inspect/Preview/Sync buttons: off while a job runs, and always off for disabled mappings
        for(let button of document.querySelectorAll('[data-run-button]')){
            button.disabled = !!isRunning || '1' === button.dataset.mappingDisabled;
        }
        this.updateSyncForm();
    }

}
