class StatusCards
{

    constructor(props)
    {
        this.dom = props.dom;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.logSummary = props.logSummary;
        this.confirmation = props.confirmation;
        this.openLog = props.openLog;
        this.openConfig = props.openConfig;
        this.startJob = props.startJob;
        this.staleSyncDays = 30;
    }

    fillCard(id, title, contents, state)
    {
        let card = this.dom.byId(id);
        card.className = 'card'+(state ? ' is-'+state : '');
        card.replaceChildren(this.dom.h('h2', {text: title}), ...contents);
    }

    renderCards()
    {
        this.renderSyncCard();
        this.renderInspectCard();
        this.renderPendingCard();
        this.renderMappingsCard();
        this.renderSchedulerCard();
    }

    renderSyncCard()
    {
        let log = this.panelStatus.data.latestSync;
        if(!log){
            this.fillCard('card-sync', 'Last backup', [
                this.dom.h('div', {class: 'big', text: 'Never'}),
                this.dom.h('div', {class: 'muted', text: 'No real sync found in the logs.'})
            ], 'warn');
            return;
        }
        let updated = log.counts['UPDATED FILES'] || 0;
        let removed = log.counts['REMOVED FILES'] || 0;
        let errors = (log.counts['ERRORS'] || 0)+(log.counts['HASH ERRORS'] || 0);
        let isStale = this.staleSyncDays < this.formatter.daysSince(log.createdAt);
        let state = 0 < errors || log.interrupted ? 'danger' : (isStale ? 'warn' : '');
        let resultParts = [this.formatter.plural(updated, 'file copied', 'files copied')];
        if(0 < removed){
            resultParts.push(this.formatter.plural(removed, 'removed', 'removed'));
        }
        resultParts.push(this.formatter.plural(errors, 'error', 'errors'));
        this.fillCard('card-sync', 'Last backup', [
            this.dom.h('div', {class: 'big', text: this.formatter.ago(log.createdAt)}),
            this.dom.h('div', {class: 'muted', text: log.createdAt}),
            this.dom.h('div', {class: 0 < errors ? 'danger-text' : '', text: resultParts.join(' - ')}),
            log.interrupted ? this.dom.h('div', {class: 'danger-text', text: 'Interrupted before finishing'}) : '',
            this.buildLogButton(log)
        ], state);
    }

    renderInspectCard()
    {
        let log = this.panelStatus.data.latestInspect;
        if(!log){
            this.fillCard('card-inspect', 'Last inspection', [
                this.dom.h('div', {class: 'big', text: 'Never'}),
                this.dom.h('div', {class: 'muted', text: 'Run an inspection to find what needs a backup.'})
            ], 'warn');
            return;
        }
        let folders = log.counts['FOLDERS WITH CHANGES'] || 0;
        let summary = 0 === log.pendingFiles
            ? 'Everything was in sync'
            : this.formatter.plural(log.pendingFiles, 'change', 'changes')+' in '
                +this.formatter.plural(folders, 'folder', 'folders');
        this.fillCard('card-inspect', 'Last inspection', [
            this.dom.h('div', {class: 'big', text: this.formatter.ago(log.createdAt)}),
            this.dom.h('div', {class: 'muted', text: log.createdAt}),
            this.dom.h('div', {class: 0 === log.pendingFiles ? 'ok-text' : '', text: summary}),
            log.interrupted ? this.dom.h('div', {class: 'danger-text', text: 'Interrupted before finishing'}) : '',
            this.buildLogButton(log)
        ], log.interrupted ? 'warn' : '');
    }

    buildLogButton(log)
    {
        return this.dom.h('div', {class: 'buttons'}, [
            this.dom.h('button', {type: 'button', class: 'small', text: 'View log', onclick: () => {
                this.openLog(log.name);
            }})
        ]);
    }

    renderPendingCard()
    {
        let config = this.panelStatus.data.latestFilesConfig;
        let inspect = this.panelStatus.data.latestInspect;
        if(!config || (inspect && 0 === inspect.pendingFiles)){
            this.fillCard('card-pending', 'Pending sync', [
                this.dom.h('div', {class: 'big', text: 'Nothing'}),
                this.dom.h('div', {class: 'muted', text: 'The last inspection found no changes.'})
            ]);
            return;
        }
        let syncedBy = this.panelStatus.data.latestFilesConfigSyncedBy;
        let contents = [
            this.dom.h('div', {class: 'big', text: this.formatter.plural(config.destinations, 'copy', 'copies')}),
            this.dom.h('div', {
                class: 'muted',
                text: this.formatter.plural(config.entries, 'source file', 'source files')
                    +' - from the '+config.createdAt+' inspection'
            })
        ];
        if(syncedBy){
            contents.push(this.dom.h('div', {
                class: 'ok-text',
                text: 'Synced '+this.formatter.ago(syncedBy.createdAt)
            }));
        }
        if(!syncedBy){
            contents.push(this.dom.h('div', {class: 'warn-text', text: 'Not synced yet'}));
        }
        if(inspect && this.logSummary.isScopedRun(inspect)){
            contents.push(this.dom.h('div', {
                class: 'muted',
                text: 'That inspection covered '+this.logSummary.describeScope(inspect)+' only.'
            }));
        }
        contents.push(this.dom.h('div', {class: 'buttons'}, [
            this.dom.h('button', {type: 'button', class: 'small', text: 'View', onclick: () => {
                this.openConfig(config.name);
            }}),
            this.dom.h('button', {type: 'button', class: 'small', text: 'Preview', onclick: () => {
                this.startJob({action: 'sync', config: config.name, dryRun: true});
            }}),
            this.dom.h('button', {type: 'button', class: 'small primary', text: 'Sync now', onclick: (event) => {
                this.confirmation.confirmClick(event.currentTarget, 'Confirm', () => {
                    this.startJob({action: 'sync', config: config.name, dryRun: false});
                });
            }})
        ]));
        this.fillCard('card-pending', 'Pending sync', contents, syncedBy ? '' : 'warn');
    }

    renderMappingsCard()
    {
        let mappings = this.panelStatus.data.mappings || [];
        let mappingsError = this.panelStatus.data.mappingsError;
        let missing = [];
        let disabledCount = 0;
        for(let mapping of mappings){
            // disabled mappings are not inspected or synced, so their folders don't matter here:
            if(!mapping.enabled){
                disabledCount += 1;
                continue;
            }
            if(!mapping.fromExists){
                missing.push('Source: '+mapping.from);
            }
            for(let destination of mapping.to){
                if(!destination.exists){
                    missing.push('Destination: '+destination.path);
                }
            }
        }
        let contents = [
            this.dom.h('div', {class: 'big', text: this.formatter.plural(mappings.length, 'mapping', 'mappings')})
        ];
        if(0 < disabledCount){
            contents.push(this.dom.h('div', {class: 'muted', text: this.formatter.number(disabledCount)+' disabled'}));
        }
        if(mappingsError){
            contents.push(this.dom.h('div', {class: 'danger-text', text: mappingsError}));
        }
        if(0 === missing.length && !mappingsError){
            contents.push(this.dom.h('div', {class: 'ok-text', text: 'All folders reachable'}));
        }
        for(let item of missing){
            contents.push(this.dom.h('div', {class: 'danger-text mono', text: 'Missing '+item}));
        }
        this.fillCard('card-mappings', 'Mappings', contents, 0 < missing.length || mappingsError ? 'danger' : '');
    }

    renderSchedulerCard()
    {
        let scheduler = this.panelStatus.data.scheduler || {isRunning: false, state: false};
        let schedule = this.panelStatus.data.schedule || {jobs: [], warnings: []};
        let contents = [];
        let state = '';
        if(scheduler.isRunning){
            let running = scheduler.state.running || [];
            contents.push(this.dom.h('div', {
                class: 'big',
                text: 0 < running.length ? 'Running '+running.length+' job'+(1 < running.length ? 's' : '') : 'Waiting'
            }));
            for(let run of running){
                contents.push(this.dom.h('div', {
                    text: run.jobName+': '+run.step+' of mapping'+(1 < run.mappingNumbers.length ? 's' : '')
                        +' #'+run.mappingNumbers.join(', #')
                }));
            }
        }
        if(!scheduler.isRunning){
            let reason = scheduler.state && scheduler.state.lockError
                ? scheduler.state.lockError
                : 'The schedules stopped, restart the Backup Tool to run them again.';
            contents.push(this.dom.h('div', {class: 'big', text: 'Not running here'}));
            contents.push(this.dom.h('div', {class: 'muted', text: reason}));
            state = 0 < schedule.jobs.length ? 'warn' : '';
        }
        let nextJob = schedule.jobs.filter((job) => {
            return '' !== job.nextRunAt;
        }).sort((a, b) => {
            return a.nextRunAt.localeCompare(b.nextRunAt);
        })[0];
        if(nextJob){
            contents.push(this.dom.h('div', {
                class: 'muted',
                text: 'Next: '+nextJob.name+', '+this.formatter.formatDateTime(nextJob.nextRunAt)
            }));
        }
        if(0 === schedule.jobs.length){
            contents.push(this.dom.h('div', {class: 'muted', text: 'No scheduled jobs.'}));
        }
        state = this.addLastRun(contents, scheduler, state);
        for(let warning of schedule.warnings){
            contents.push(this.dom.h('div', {class: 'warn-text', text: warning}));
            state = state || 'warn';
        }
        if(scheduler.state && scheduler.state.configError){
            contents.push(this.dom.h('div', {class: 'danger-text', text: scheduler.state.configError}));
            state = 'danger';
        }
        this.fillCard('card-scheduler', 'Scheduler', contents, state);
    }

    addLastRun(contents, scheduler, state)
    {
        let lastRuns = scheduler.state && scheduler.state.lastRuns ? Object.values(scheduler.state.lastRuns) : [];
        lastRuns.sort((a, b) => {
            return String(b.finishedAt).localeCompare(String(a.finishedAt));
        });
        if(!lastRuns[0]){
            return state;
        }
        let last = lastRuns[0];
        contents.push(this.dom.h('div', {
            class: 'error' === last.status ? 'danger-text' : '',
            text: 'Last: '+last.jobName+', '+last.result+' ('+this.formatter.formatDateTime(last.finishedAt)+')'
        }));
        if('error' === last.status && !state){
            return 'warn';
        }
        return state;
    }

}
