/**
 * Backup Tool - web panel client
 */

class BackupToolClient
{

    constructor()
    {
        this.status = false;
        this.latestFilesConfigName = '';
        this.jobId = 0;
        this.nextLine = 0;
        this.outputLines = [];
        this.maxOutputLines = 2000;
        this.pollTimer = false;
        this.polling = false;
        this.wasRunning = false;
        this.pollIntervalMs = 1000;
        this.confirmTimeoutMs = 5000;
        this.staleSyncDays = 30;
        this.pickerCallback = false;
        this.pickerData = false;
        this.newMappingDefaults = {
            from: '',
            to: [{path: ''}],
            enabled: true,
            schedule: {enabled: false, cron: ''},
            includeExtensions: [],
            excludeExtensions: ['.tmp', '.log'],
            maxSizeBytes: 0,
            excludeHidden: true,
            excludeSystem: true,
            excludeNames: []
        };
    }

    init()
    {
        this.byId('refresh').addEventListener('click', () => {
            this.refresh();
        });
        this.byId('run-inspect').addEventListener('click', () => {
            this.startJob({action: 'inspect', withHash: this.byId('inspect-hash').checked});
        });
        this.byId('run-sync').addEventListener('click', (event) => {
            this.runSelectedSync(event.currentTarget);
        });
        this.byId('view-sync-config').addEventListener('click', () => {
            let configName = this.byId('sync-config').value;
            if(configName){
                this.openConfig(configName);
            }
        });
        this.byId('sync-config').addEventListener('change', () => {
            this.updateSyncForm();
        });
        this.byId('sync-dry').addEventListener('change', () => {
            this.updateSyncForm();
        });
        this.byId('stop-job').addEventListener('click', () => {
            this.stopJob();
        });
        this.byId('dialog-close').addEventListener('click', () => {
            this.byId('dialog').close();
        });
        this.byId('dialog').addEventListener('click', (event) => {
            // a click outside a form must not throw the changes away:
            if(event.target === this.byId('dialog') && 'form' !== this.byId('dialog').dataset.mode){
                this.byId('dialog').close();
            }
        });
        this.byId('add-mapping').addEventListener('click', () => {
            this.openMappingEditor(-1);
        });
        this.byId('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        this.byId('setting-schedule-edit').addEventListener('click', () => {
            let input = this.byId('setting-schedule-cron');
            this.openCronBuilder(input.value, (expression) => {
                input.value = expression;
                this.previewCron(input.value, this.byId('setting-schedule-preview'));
            });
        });
        this.byId('setting-schedule-cron').addEventListener('input', () => {
            this.previewCron(this.byId('setting-schedule-cron').value, this.byId('setting-schedule-preview'));
        });
        this.setupPicker();
        this.setupCronBuilder();
        document.addEventListener('visibilitychange', () => {
            if('visible' === document.visibilityState){
                this.refresh();
            }
        });
        this.refresh();
    }

    byId(id)
    {
        return document.getElementById(id);
    }

    h(tag, attributes, children)
    {
        let element = document.createElement(tag);
        for(let key of Object.keys(attributes || {})){
            let value = attributes[key];
            if(false === value || null === value || undefined === value){
                continue;
            }
            if(key.startsWith('on') && 'function' === typeof value){
                element.addEventListener(key.substring(2), value);
                continue;
            }
            if('text' === key){
                element.textContent = value;
                continue;
            }
            element.setAttribute(key, true === value ? '' : value);
        }
        for(let child of [].concat(undefined === children ? [] : children)){
            if(null === child || undefined === child || false === child || '' === child){
                continue;
            }
            element.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        return element;
    }

    async api(path, body, method)
    {
        let options = {method: method || (body ? 'POST' : 'GET'), headers: {'Accept': 'application/json'}};
        if(body){
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        let response = await fetch(path, options);
        let data = {};
        try{
            data = await response.json();
        }catch(error){
            data = {};
        }
        if(!response.ok){
            throw new Error(data.error || 'Request failed ('+response.status+')');
        }
        return data;
    }

    showError(message)
    {
        let banner = this.byId('error');
        banner.textContent = message;
        banner.hidden = false;
    }

    hideError()
    {
        this.byId('error').hidden = true;
    }

    async refresh()
    {
        try{
            this.status = await this.api('/api/status');
        }catch(error){
            this.showError('Could not load the status, is the server running? '+error.message);
            return;
        }
        this.hideError();
        this.renderCards();
        this.renderSyncConfigSelect();
        this.renderSettings();
        this.renderMappings();
        this.renderLogs();
        this.renderConfigs();
        this.byId('footer').textContent = 'Project folder: '+this.status.rootPath+' - updated '+new Date().toLocaleTimeString();
        this.handleStatusJob(this.status.job);
    }

    parseLocalDate(value)
    {
        let match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
        if(!match){
            return false;
        }
        return new Date(
            Number(match[1]),
            Number(match[2])-1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6])
        );
    }

    daysSince(value)
    {
        let date = this.parseLocalDate(value);
        if(!date){
            return 0;
        }
        return (Date.now()-date.getTime())/86400000;
    }

    ago(value)
    {
        let date = this.parseLocalDate(value);
        if(!date){
            return '';
        }
        let seconds = Math.round((Date.now()-date.getTime())/1000);
        if(seconds < 60){
            return 'just now';
        }
        let minutes = Math.round(seconds/60);
        if(minutes < 60){
            return minutes+' min ago';
        }
        let hours = Math.round(minutes/60);
        if(hours < 24){
            return hours+(1 === hours ? ' hour ago' : ' hours ago');
        }
        let days = Math.round(hours/24);
        if(days < 60){
            return days+(1 === days ? ' day ago' : ' days ago');
        }
        let months = Math.round(days/30.4);
        if(months < 24){
            return months+' months ago';
        }
        return Math.round(days/365)+' years ago';
    }

    number(value)
    {
        return Number(value || 0).toLocaleString();
    }

    plural(count, singular, pluralWord)
    {
        return this.number(count)+' '+(1 === count ? singular : pluralWord);
    }

    pill(text, type)
    {
        return this.h('span', {class: 'pill '+(type || 'muted'), text: text});
    }

    fillCard(id, title, contents, state)
    {
        let card = this.byId(id);
        card.className = 'card'+(state ? ' is-'+state : '');
        card.replaceChildren(this.h('h2', {text: title}), ...contents);
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
        let log = this.status.latestSync;
        if(!log){
            this.fillCard('card-sync', 'Last backup', [
                this.h('div', {class: 'big', text: 'Never'}),
                this.h('div', {class: 'muted', text: 'No real sync found in the logs.'})
            ], 'warn');
            return;
        }
        let updated = log.counts['UPDATED FILES'] || 0;
        let removed = log.counts['REMOVED FILES'] || 0;
        let errors = (log.counts['ERRORS'] || 0)+(log.counts['HASH ERRORS'] || 0);
        let isStale = this.staleSyncDays < this.daysSince(log.createdAt);
        let state = 0 < errors || log.interrupted ? 'danger' : (isStale ? 'warn' : '');
        let resultParts = [this.plural(updated, 'file copied', 'files copied')];
        if(0 < removed){
            resultParts.push(this.plural(removed, 'removed', 'removed'));
        }
        resultParts.push(this.plural(errors, 'error', 'errors'));
        this.fillCard('card-sync', 'Last backup', [
            this.h('div', {class: 'big', text: this.ago(log.createdAt)}),
            this.h('div', {class: 'muted', text: log.createdAt}),
            this.h('div', {class: 0 < errors ? 'danger-text' : '', text: resultParts.join(' - ')}),
            log.interrupted ? this.h('div', {class: 'danger-text', text: 'Interrupted before finishing'}) : '',
            this.h('div', {class: 'buttons'}, [
                this.h('button', {type: 'button', class: 'small', text: 'View log', onclick: () => {
                    this.openLog(log.name);
                }})
            ])
        ], state);
    }

    renderInspectCard()
    {
        let log = this.status.latestInspect;
        if(!log){
            this.fillCard('card-inspect', 'Last inspection', [
                this.h('div', {class: 'big', text: 'Never'}),
                this.h('div', {class: 'muted', text: 'Run an inspection to find what needs a backup.'})
            ], 'warn');
            return;
        }
        let folders = log.counts['FOLDERS WITH CHANGES'] || 0;
        let summary = 0 === log.pendingFiles
            ? 'Everything was in sync'
            : this.plural(log.pendingFiles, 'change', 'changes')+' in '+this.plural(folders, 'folder', 'folders');
        this.fillCard('card-inspect', 'Last inspection', [
            this.h('div', {class: 'big', text: this.ago(log.createdAt)}),
            this.h('div', {class: 'muted', text: log.createdAt}),
            this.h('div', {class: 0 === log.pendingFiles ? 'ok-text' : '', text: summary}),
            log.interrupted ? this.h('div', {class: 'danger-text', text: 'Interrupted before finishing'}) : '',
            this.h('div', {class: 'buttons'}, [
                this.h('button', {type: 'button', class: 'small', text: 'View log', onclick: () => {
                    this.openLog(log.name);
                }})
            ])
        ], log.interrupted ? 'warn' : '');
    }

    renderPendingCard()
    {
        let config = this.status.latestFilesConfig;
        let inspect = this.status.latestInspect;
        if(!config || (inspect && 0 === inspect.pendingFiles)){
            this.fillCard('card-pending', 'Pending sync', [
                this.h('div', {class: 'big', text: 'Nothing'}),
                this.h('div', {class: 'muted', text: 'The last inspection found no changes.'})
            ]);
            return;
        }
        let syncedBy = this.status.latestFilesConfigSyncedBy;
        let contents = [
            this.h('div', {class: 'big', text: this.plural(config.destinations, 'copy', 'copies')}),
            this.h('div', {class: 'muted', text: this.plural(config.entries, 'source file', 'source files')+' - from the '+config.createdAt+' inspection'})
        ];
        if(syncedBy){
            contents.push(this.h('div', {class: 'ok-text', text: 'Synced '+this.ago(syncedBy.createdAt)}));
        }
        if(!syncedBy){
            contents.push(this.h('div', {class: 'warn-text', text: 'Not synced yet'}));
        }
        if(inspect && this.isScopedRun(inspect)){
            contents.push(this.h('div', {class: 'muted', text: 'That inspection covered '+this.describeScope(inspect)+' only.'}));
        }
        contents.push(this.h('div', {class: 'buttons'}, [
            this.h('button', {type: 'button', class: 'small', text: 'View', onclick: () => {
                this.openConfig(config.name);
            }}),
            this.h('button', {type: 'button', class: 'small', text: 'Preview', onclick: () => {
                this.startJob({action: 'sync', config: config.name, dryRun: true});
            }}),
            this.h('button', {type: 'button', class: 'small primary', text: 'Sync now', onclick: (event) => {
                this.confirmClick(event.currentTarget, 'Confirm', () => {
                    this.startJob({action: 'sync', config: config.name, dryRun: false});
                });
            }})
        ]));
        this.fillCard('card-pending', 'Pending sync', contents, syncedBy ? '' : 'warn');
    }

    renderMappingsCard()
    {
        let mappings = this.status.mappings || [];
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
        let contents = [this.h('div', {class: 'big', text: this.plural(mappings.length, 'mapping', 'mappings')})];
        if(0 < disabledCount){
            contents.push(this.h('div', {class: 'muted', text: this.number(disabledCount)+' disabled'}));
        }
        if(this.status.mappingsError){
            contents.push(this.h('div', {class: 'danger-text', text: this.status.mappingsError}));
        }
        if(0 === missing.length && !this.status.mappingsError){
            contents.push(this.h('div', {class: 'ok-text', text: 'All folders reachable'}));
        }
        for(let item of missing){
            contents.push(this.h('div', {class: 'danger-text mono', text: 'Missing '+item}));
        }
        this.fillCard('card-mappings', 'Mappings', contents, 0 < missing.length || this.status.mappingsError ? 'danger' : '');
    }

    configLabel(config)
    {
        if('inspect.config.js' === config.name){
            return 'inspect.config.js - full scan of all mappings';
        }
        if('sync.config.js' === config.name){
            return 'sync.config.js - default config ('+this.plural(config.entries, 'folder', 'folders')+')';
        }
        if('files' === config.type){
            return config.createdAt+' - '+this.plural(config.destinations, 'file copy', 'file copies');
        }
        return config.createdAt+' - '+this.plural(config.entries, 'folder', 'folders');
    }

    renderSyncConfigSelect()
    {
        let select = this.byId('sync-config');
        let previous = select.value;
        let groups = [
            {label: 'Changed files (from inspections)', items: []},
            {label: 'Changed folders (from inspections)', items: []},
            {label: 'Main configs', items: []}
        ];
        for(let config of this.status.configs){
            let groupIndex = !config.generated ? 2 : ('files' === config.type ? 0 : 1);
            groups[groupIndex].items.push(this.h('option', {value: config.name, text: this.configLabel(config)}));
        }
        let children = [];
        for(let group of groups){
            if(0 < group.items.length){
                children.push(this.h('optgroup', {label: group.label}, group.items));
            }
        }
        select.replaceChildren(...children);
        if(previous && this.findConfig(previous)){
            select.value = previous;
        }
        let latestName = this.status.latestFilesConfig ? this.status.latestFilesConfig.name : '';
        if(latestName && latestName !== this.latestFilesConfigName){
            // a new inspection created a new files config, select it:
            select.value = latestName;
        }
        this.latestFilesConfigName = latestName;
        this.updateSyncForm();
    }

    findConfig(name)
    {
        for(let config of (this.status.configs || [])){
            if(config.name === name){
                return config;
            }
        }
        return false;
    }

    updateSyncForm()
    {
        let config = this.findConfig(this.byId('sync-config').value);
        let removeInput = this.byId('sync-remove');
        let isFilesConfig = config && 'files' === config.type;
        removeInput.disabled = !config || isFilesConfig;
        if(removeInput.disabled){
            removeInput.checked = false;
        }
        removeInput.closest('label').classList.toggle('disabled', removeInput.disabled);
        let button = this.byId('run-sync');
        let isDryRun = this.byId('sync-dry').checked;
        button.textContent = isDryRun ? 'Preview sync' : 'Start sync (copies files)';
        button.classList.toggle('danger', !isDryRun);
        button.disabled = !config || this.isJobRunning();
        this.byId('view-sync-config').disabled = !config;
        delete button.dataset.confirming;
        button.style.minWidth = '';
        button.removeAttribute('title');
    }

    runSelectedSync(button)
    {
        let params = {
            action: 'sync',
            config: this.byId('sync-config').value,
            dryRun: this.byId('sync-dry').checked,
            withHash: this.byId('sync-hash').checked,
            allowRemove: this.byId('sync-remove').checked
        };
        if(params.dryRun){
            this.startJob(params);
            return;
        }
        let message = params.allowRemove ? 'Click again to copy AND delete' : 'Click again to copy';
        this.confirmClick(button, message, () => {
            this.startJob(params);
        });
    }

    confirmClick(button, message, callback)
    {
        if('1' === button.dataset.confirming){
            this.resetConfirm(button);
            callback();
            return;
        }
        button.dataset.confirming = '1';
        button.dataset.originalText = button.textContent;
        button.dataset.wasDanger = button.classList.contains('danger') ? '1' : '';
        // keep the current width, so the label change never moves or wraps the buttons next to it:
        button.style.minWidth = button.offsetWidth+'px';
        button.classList.add('danger');
        button.title = 'Click again to confirm, or wait to cancel';
        button.textContent = message;
        setTimeout(() => {
            if('1' === button.dataset.confirming){
                this.resetConfirm(button);
            }
        }, this.confirmTimeoutMs);
    }

    resetConfirm(button)
    {
        delete button.dataset.confirming;
        button.textContent = button.dataset.originalText || button.textContent;
        if('1' !== button.dataset.wasDanger){
            button.classList.remove('danger');
        }
        button.style.minWidth = '';
        button.removeAttribute('title');
    }

    renderMappings()
    {
        let container = this.byId('mappings');
        let mappings = this.status.mappings || [];
        if(0 === mappings.length){
            container.replaceChildren(this.h('p', {class: 'danger-text', text: this.status.mappingsError || 'No mappings configured.'}));
            return;
        }
        let rows = [];
        let isRunning = this.isJobRunning();
        for(let index = 0; index < mappings.length; index++){
            let mapping = mappings[index];
            let destinations = [];
            for(let destination of mapping.to){
                destinations.push(this.renderPath(destination.path, destination.exists));
            }
            let runButtonAttributes = (label, extraClass) => {
                return {
                    type: 'button',
                    class: 'small'+(extraClass ? ' '+extraClass : ''),
                    text: label,
                    'data-run-button': '1',
                    'data-mapping-disabled': mapping.enabled ? '' : '1',
                    disabled: !mapping.enabled || isRunning,
                    title: mapping.enabled ? false : 'Enable the mapping to run it'
                };
            };
            rows.push(this.h('div', {class: 'mapping'+(mapping.enabled ? '' : ' is-disabled')}, [
                this.h('div', {class: 'mapping-head'}, [
                    this.h('span', {class: 'mapping-number', text: '#'+mapping.number}),
                    this.h('label', {class: 'check'}, [
                        this.h('input', {type: 'checkbox', checked: mapping.enabled, onchange: (event) => {
                            this.toggleMapping(index, mapping.from, event.currentTarget.checked);
                        }}),
                        'Enabled'
                    ]),
                    mapping.enabled ? '' : this.pill('disabled: skipped by full inspections, syncs and schedules', 'muted')
                ]),
                this.renderMappingSchedule(index, mapping),
                this.renderPath(mapping.from, mapping.fromExists),
                this.h('span', {class: 'arrow', text: '→'}),
                this.h('div', {}, destinations),
                this.h('div', {class: 'filters muted', text: this.describeFilters(mapping)}),
                this.h('div', {class: 'mapping-actions'}, [
                    this.h('button', Object.assign(runButtonAttributes('Inspect'), {onclick: () => {
                        this.startJob({action: 'inspect', mapping: index, expectedFrom: mapping.from});
                    }})),
                    this.h('button', Object.assign(runButtonAttributes('Sync', 'primary'), {title: 'Inspects this mapping, then copies the changes it finds', onclick: (event) => {
                        this.confirmClick(event.currentTarget, 'Confirm', () => {
                            this.startJob({action: 'sync', mapping: index, expectedFrom: mapping.from, dryRun: false});
                        });
                    }})),
                    this.h('button', {type: 'button', class: 'small', text: 'Edit', onclick: () => {
                        this.openMappingEditor(index);
                    }}),
                    this.h('button', {type: 'button', class: 'small', text: 'Delete', onclick: (event) => {
                        this.confirmClick(event.currentTarget, 'Confirm', () => {
                            this.deleteMapping(index, mapping.from);
                        });
                    }})
                ])
            ]));
        }
        rows.push(this.h('p', {
            class: 'muted',
            text: 'Changes are saved in configurations/inspect.config.js. Commit that file in the configuration'
                +' repository to keep its history.'
        }));
        container.replaceChildren(...rows);
    }

    renderMappingSchedule(index, mapping)
    {
        let schedule = mapping.schedule;
        let text = 'Not scheduled';
        let textClass = 'muted';
        if(schedule.enabled && schedule.nextRunAt){
            let source = '' === schedule.cron ? 'general schedule' : 'own schedule';
            text = schedule.description+' ('+source+', '+schedule.effectiveCron+'), next run '+this.formatDateTime(schedule.nextRunAt);
            textClass = '';
        }
        if(schedule.enabled && !schedule.nextRunAt){
            text = 'Scheduled, but not running: '+(mapping.enabled ? 'no valid cron here or in the general schedule' : 'the mapping is disabled');
            textClass = 'warn-text';
        }
        return this.h('div', {class: 'mapping-head mapping-schedule'}, [
            this.h('label', {class: 'check'}, [
                this.h('input', {type: 'checkbox', checked: schedule.enabled, onchange: (event) => {
                    this.toggleMappingSchedule(index, mapping.from, event.currentTarget.checked);
                }}),
                'Scheduled'
            ]),
            this.h('span', {class: textClass, text: text})
        ]);
    }

    async toggleMappingSchedule(index, expectedFrom, enabled)
    {
        try{
            await this.api('/api/mappings/'+index+'/schedule', {expectedFrom: expectedFrom, enabled: enabled}, 'PUT');
        }catch(error){
            this.showMappingsNotice(error.message, 'warn');
            await this.refresh();
            return;
        }
        this.showMappingsNotice('Mapping #'+(index+1)+' schedule turned '+(enabled ? 'on' : 'off')+'. The scheduler picks it up within a minute.', 'ok');
        await this.refresh();
    }

    formatDateTime(isoDate)
    {
        let date = new Date(isoDate);
        return date.toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'})+' '
            +date.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
    }

    renderSchedulerCard()
    {
        let scheduler = this.status.scheduler || {isRunning: false, state: false};
        let schedule = this.status.schedule || {jobs: [], warnings: []};
        let contents = [];
        let state = '';
        if(scheduler.isRunning){
            let running = scheduler.state.running || [];
            contents.push(this.h('div', {class: 'big', text: 0 < running.length ? 'Running '+running.length+' job'+(1 < running.length ? 's' : '') : 'Waiting'}));
            for(let run of running){
                contents.push(this.h('div', {text: run.jobName+': '+run.step+' of mapping'+(1 < run.mappingNumbers.length ? 's' : '')+' #'+run.mappingNumbers.join(', #')}));
            }
        }
        if(!scheduler.isRunning){
            let reason = scheduler.state && scheduler.state.lockError
                ? scheduler.state.lockError
                : 'The schedules stopped, restart the Backup Tool to run them again.';
            contents.push(this.h('div', {class: 'big', text: 'Not running here'}));
            contents.push(this.h('div', {class: 'muted', text: reason}));
            state = 0 < schedule.jobs.length ? 'warn' : '';
        }
        let nextJob = schedule.jobs.filter((job) => {
            return '' !== job.nextRunAt;
        }).sort((a, b) => {
            return a.nextRunAt.localeCompare(b.nextRunAt);
        })[0];
        if(nextJob){
            contents.push(this.h('div', {class: 'muted', text: 'Next: '+nextJob.name+', '+this.formatDateTime(nextJob.nextRunAt)}));
        }
        if(0 === schedule.jobs.length){
            contents.push(this.h('div', {class: 'muted', text: 'No scheduled jobs.'}));
        }
        let lastRuns = scheduler.state && scheduler.state.lastRuns ? Object.values(scheduler.state.lastRuns) : [];
        lastRuns.sort((a, b) => {
            return String(b.finishedAt).localeCompare(String(a.finishedAt));
        });
        if(lastRuns[0]){
            let last = lastRuns[0];
            contents.push(this.h('div', {
                class: 'error' === last.status ? 'danger-text' : '',
                text: 'Last: '+last.jobName+', '+last.result+' ('+this.formatDateTime(last.finishedAt)+')'
            }));
            if('error' === last.status && !state){
                state = 'warn';
            }
        }
        for(let warning of schedule.warnings){
            contents.push(this.h('div', {class: 'warn-text', text: warning}));
            state = state || 'warn';
        }
        if(scheduler.state && scheduler.state.configError){
            contents.push(this.h('div', {class: 'danger-text', text: scheduler.state.configError}));
            state = 'danger';
        }
        this.fillCard('card-scheduler', 'Scheduler', contents, state);
    }

    renderSettings()
    {
        let settings = this.status.settings;
        if(!settings || this.isSettingsDirty){
            // unsaved changes in the settings block are kept until they are saved
            return;
        }
        let thresholdInput = this.byId('setting-threshold');
        thresholdInput.value = String(settings.modifiedTimeThresholdMs/1000);
        thresholdInput.title = settings.isDefaultThreshold ? 'Default value, not saved in the config yet' : '';
        this.byId('setting-schedule-enabled').checked = settings.schedule.enabled;
        this.byId('setting-schedule-cron').value = settings.schedule.cron;
        this.byId('setting-logs-remove').checked = settings.logs.removeOldLogs;
        this.byId('setting-logs-days').value = String(settings.logs.keepDays);
        this.previewCron(settings.schedule.cron, this.byId('setting-schedule-preview'));
        if(!this.isSettingsWatched){
            this.isSettingsWatched = true;
            for(let id of ['setting-threshold', 'setting-schedule-enabled', 'setting-schedule-cron', 'setting-logs-remove', 'setting-logs-days']){
                this.byId(id).addEventListener('input', () => {
                    this.isSettingsDirty = true;
                });
            }
        }
    }

    async saveSettings()
    {
        let seconds = Number(this.byId('setting-threshold').value);
        let settings = {
            modifiedTimeThresholdMs: Math.round(seconds*1000),
            schedule: {
                enabled: this.byId('setting-schedule-enabled').checked,
                cron: this.byId('setting-schedule-cron').value
            },
            logs: {
                removeOldLogs: this.byId('setting-logs-remove').checked,
                keepDays: Number(this.byId('setting-logs-days').value)
            }
        };
        try{
            await this.api('/api/settings', settings, 'PUT');
        }catch(error){
            this.showMappingsNotice(error.message, 'warn');
            return;
        }
        this.isSettingsDirty = false;
        this.showMappingsNotice('Settings saved. The next inspections, syncs and the scheduler (within a minute) use them.', 'ok');
        await this.refresh();
    }

    async toggleMapping(index, expectedFrom, enabled)
    {
        try{
            await this.api('/api/mappings/'+index+'/enabled', {expectedFrom: expectedFrom, enabled: enabled}, 'PUT');
        }catch(error){
            this.showMappingsNotice(error.message, 'warn');
        }
        if(!enabled){
            this.showMappingsNotice('Mapping #'+(index+1)+' disabled: full inspections and syncs skip it.', 'ok');
        }
        if(enabled){
            this.showMappingsNotice('Mapping #'+(index+1)+' enabled.', 'ok');
        }
        await this.refresh();
    }

    isScopedRun(log)
    {
        return !!(log && log.scope && log.scope.startsWith('selected'));
    }

    describeScope(log)
    {
        let numbers = log.scope.replace('selected ', '');
        return (-1 === numbers.indexOf(',') ? 'mapping ' : 'mappings ')+numbers;
    }

    showMappingsNotice(message, type)
    {
        let notice = this.byId('mappings-notice');
        notice.className = 'notice '+(type || '');
        notice.textContent = message;
        notice.hidden = !message;
    }

    openMappingEditor(index)
    {
        let isNew = 0 > index;
        let mapping = isNew ? this.newMappingDefaults : this.status.mappings[index];
        let destinationsList = this.h('div', {});
        for(let destination of mapping.to){
            destinationsList.append(this.buildPathRow(destination.path, true));
        }
        let fromRow = this.buildPathRow(mapping.from, false);
        fromRow.querySelector('input').id = 'mapping-from';
        let errorBox = this.h('div', {class: 'danger-text form-error', hidden: true});
        let form = this.h('div', {class: 'dialog-body-inner'}, [
            this.h('label', {class: 'field', for: 'mapping-from'}, this.h('span', {text: 'Source folder'})),
            fromRow,
            this.h('div', {class: 'field'}, [
                this.h('span', {text: 'Destination folders'}),
                destinationsList,
                this.h('div', {}, this.h('button', {type: 'button', class: 'small', text: 'Add destination', onclick: () => {
                    destinationsList.append(this.buildPathRow('', true));
                }}))
            ]),
            this.h('div', {class: 'form-grid'}, [
                this.buildTextField('mapping-include', 'Only these extensions (empty = all)', mapping.includeExtensions.join(', '), '.pdf, .jpg'),
                this.buildTextField('mapping-exclude', 'Skip these extensions', mapping.excludeExtensions.join(', '), '.tmp, .log'),
                this.buildTextField('mapping-names', 'Skip files and folders named', mapping.excludeNames.join(', '), 'node_modules, .git'),
                this.buildTextField(
                    'mapping-max-size',
                    'Skip files larger than (MB, 0 = no limit)',
                    String(Math.round((mapping.maxSizeBytes || 0)/1048576*100)/100),
                    '0',
                    'number'
                )
            ]),
            this.h('label', {class: 'check'}, [
                this.h('input', {type: 'checkbox', id: 'mapping-enabled', checked: false !== mapping.enabled}),
                'Enabled (disabled mappings are skipped by full inspections, syncs and schedules)'
            ]),
            this.buildScheduleFields(mapping.schedule || {enabled: false, cron: ''}),
            this.h('label', {class: 'check'}, [
                this.h('input', {type: 'checkbox', id: 'mapping-hidden', checked: mapping.excludeHidden}),
                'Skip hidden files and folders (names starting with ".")'
            ]),
            this.h('label', {class: 'check'}, [
                this.h('input', {type: 'checkbox', id: 'mapping-system', checked: mapping.excludeSystem}),
                'Skip Windows system files (System Volume Information, $RECYCLE.BIN, desktop.ini, Thumbs.db)'
            ]),
            errorBox,
            this.h('div', {class: 'buttons'}, [
                this.h('button', {type: 'button', class: 'primary', text: isNew ? 'Add mapping' : 'Save changes', onclick: () => {
                    this.saveMapping(index, isNew ? '' : mapping.from, destinationsList, errorBox);
                }}),
                this.h('button', {type: 'button', class: 'ghost', text: 'Cancel', onclick: () => {
                    this.byId('dialog').close();
                }})
            ])
        ]);
        this.byId('dialog').dataset.mode = 'form';
        this.openDialog(isNew ? 'Add mapping' : 'Edit mapping', [form]);
        this.byId('dialog').addEventListener('close', () => {
            delete this.byId('dialog').dataset.mode;
        }, {once: true});
    }

    buildScheduleFields(schedule)
    {
        let preview = this.h('span', {class: 'muted help'});
        let cronInput = this.h('input', {
            type: 'text',
            id: 'mapping-schedule-cron',
            class: 'cron-input',
            value: schedule.cron || '',
            placeholder: 'general schedule',
            spellcheck: 'false',
            'aria-label': 'Own cron expression',
            oninput: () => {
                this.previewCron(cronInput.value, preview, 'Uses the general schedule.');
            }
        });
        this.previewCron(cronInput.value, preview, 'Uses the general schedule.');
        return this.h('div', {class: 'field'}, [
            this.h('span', {text: 'Schedule'}),
            this.h('label', {class: 'check'}, [
                this.h('input', {type: 'checkbox', id: 'mapping-schedule-enabled', checked: true === schedule.enabled}),
                'Scheduled: the scheduler inspects this mapping and syncs it when something changed'
            ]),
            this.h('div', {class: 'settings-line'}, [
                cronInput,
                this.h('button', {type: 'button', class: 'small', text: 'Edit schedule...', onclick: () => {
                    this.openCronBuilder(cronInput.value, (expression) => {
                        cronInput.value = expression;
                        this.previewCron(cronInput.value, preview, 'Uses the general schedule.');
                    });
                }}),
                preview
            ]),
            this.h('span', {class: 'muted help', text: 'Leave the cron empty to use the general schedule, an own cron overrides it.'})
        ]);
    }

    buildPathRow(value, isRemovable)
    {
        let input = this.h('input', {type: 'text', value: value || '', spellcheck: 'false', placeholder: 'D:\\folder or \\\\server\\share'});
        let row = this.h('div', {class: 'path-row'}, [
            input,
            this.h('button', {type: 'button', class: 'small', text: 'Browse...', onclick: () => {
                this.openPicker(input.value, (selectedPath) => {
                    input.value = selectedPath;
                });
            }})
        ]);
        if(isRemovable){
            row.append(this.h('button', {type: 'button', class: 'small ghost', text: 'Remove', 'aria-label': 'Remove destination', onclick: () => {
                row.remove();
            }}));
        }
        return row;
    }

    buildTextField(id, label, value, placeholder, type)
    {
        return this.h('label', {class: 'field', for: id}, [
            this.h('span', {text: label}),
            this.h('input', {
                type: type || 'text',
                id: id,
                value: value,
                placeholder: placeholder,
                spellcheck: 'false',
                min: 'number' === type ? '0' : false,
                step: 'number' === type ? 'any' : false
            })
        ]);
    }

    async saveMapping(index, expectedFrom, destinationsList, errorBox)
    {
        let destinations = [];
        for(let input of destinationsList.querySelectorAll('input')){
            destinations.push(input.value);
        }
        let mapping = {
            from: this.byId('mapping-from').value,
            to: destinations,
            includeExtensions: this.byId('mapping-include').value,
            excludeExtensions: this.byId('mapping-exclude').value,
            excludeNames: this.byId('mapping-names').value,
            maxSizeBytes: Math.round(Number(this.byId('mapping-max-size').value || 0)*1048576),
            excludeHidden: this.byId('mapping-hidden').checked,
            excludeSystem: this.byId('mapping-system').checked,
            enabled: this.byId('mapping-enabled').checked,
            schedule: {
                enabled: this.byId('mapping-schedule-enabled').checked,
                cron: this.byId('mapping-schedule-cron').value
            }
        };
        let result;
        try{
            if(0 > index){
                result = await this.api('/api/mappings', mapping);
            }
            if(0 <= index){
                result = await this.api('/api/mappings/'+index, {expectedFrom: expectedFrom, mapping: mapping}, 'PUT');
            }
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return;
        }
        this.byId('dialog').close();
        let warnings = result.warnings || [];
        this.showMappingsNotice(
            0 < warnings.length ? 'Saved, with warnings:\n'+warnings.join('\n') : 'Saved.',
            0 < warnings.length ? 'warn' : 'ok'
        );
        await this.refresh();
    }

    async deleteMapping(index, expectedFrom)
    {
        try{
            await this.api('/api/mappings/'+index+'?from='+encodeURIComponent(expectedFrom), false, 'DELETE');
        }catch(error){
            this.showMappingsNotice(error.message, 'warn');
            return;
        }
        this.showMappingsNotice('Mapping deleted: '+expectedFrom, 'ok');
        await this.refresh();
    }

    previewCron(expression, element, emptyText)
    {
        let value = String(expression || '').trim();
        clearTimeout(element.cronPreviewTimer);
        if('' === value){
            element.textContent = emptyText || '';
            element.classList.remove('danger-text');
            element.classList.add('muted');
            return;
        }
        element.cronPreviewTimer = setTimeout(async () => {
            let result;
            try{
                result = await this.api('/api/cron?expression='+encodeURIComponent(value));
            }catch(error){
                result = {valid: false, error: error.message};
            }
            element.classList.toggle('danger-text', !result.valid);
            element.classList.toggle('muted', result.valid);
            if(!result.valid){
                element.textContent = result.error;
                return;
            }
            element.textContent = result.description+'. Next: '+result.nextRuns.map((run) => {
                return this.formatDateTime(run);
            }).join(', ');
        }, 250);
    }

    setupCronBuilder()
    {
        this.cronValues = {minutes: 30, minute: 0, time: '03:00', days: [1], dayOfMonth: 1};
        this.byId('cron-close').addEventListener('click', () => {
            this.byId('cron-dialog').close();
        });
        this.byId('cron-mode').addEventListener('change', () => {
            this.renderCronFields();
            this.updateCronFromFields();
        });
        this.byId('cron-expression').addEventListener('input', () => {
            // typing an expression switches to the custom mode:
            if('custom' !== this.byId('cron-mode').value){
                this.byId('cron-mode').value = 'custom';
                this.renderCronFields();
            }
            this.previewCron(this.byId('cron-expression').value, this.byId('cron-preview'));
        });
        this.byId('cron-use').addEventListener('click', async () => {
            let expression = this.byId('cron-expression').value.trim().replace(/\s+/g, ' ');
            let result;
            try{
                result = await this.api('/api/cron?expression='+encodeURIComponent(expression));
            }catch(error){
                result = {valid: false, error: error.message};
            }
            if(!result.valid){
                let preview = this.byId('cron-preview');
                preview.textContent = result.error;
                preview.classList.add('danger-text');
                return;
            }
            this.byId('cron-dialog').close();
            this.cronCallback(expression);
        });
        this.byId('cron-clear').addEventListener('click', () => {
            this.byId('cron-dialog').close();
            this.cronCallback('');
        });
    }

    openCronBuilder(expression, callback)
    {
        this.cronCallback = callback;
        let parsed = this.parseCronForBuilder(expression);
        Object.assign(this.cronValues, parsed.values);
        this.byId('cron-mode').value = parsed.mode;
        this.renderCronFields();
        let value = String(expression || '').trim();
        this.byId('cron-expression').value = '' === value ? this.buildCronFromFields() : value;
        this.previewCron(this.byId('cron-expression').value, this.byId('cron-preview'));
        this.byId('cron-dialog').showModal();
    }

    parseCronForBuilder(expression)
    {
        let value = String(expression || '').trim().replace(/\s+/g, ' ');
        if('' === value){
            return {mode: 'daily', values: {}};
        }
        let pad2 = (number) => {
            return String(number).padStart(2, '0');
        };
        let matchers = [
            [/^\*\/(\d+) \* \* \* \*$/, (match) => {
                return {mode: 'minutes', values: {minutes: Number(match[1])}};
            }],
            [/^(\d+) \* \* \* \*$/, (match) => {
                return {mode: 'hourly', values: {minute: Number(match[1])}};
            }],
            [/^(\d+) (\d+) \* \* \*$/, (match) => {
                return {mode: 'daily', values: {time: pad2(match[2])+':'+pad2(match[1])}};
            }],
            [/^(\d+) (\d+) \* \* ([0-7](?:,[0-7])*)$/, (match) => {
                let days = match[3].split(',').map((day) => {
                    return 7 === Number(day) ? 0 : Number(day);
                });
                return {mode: 'weekly', values: {time: pad2(match[2])+':'+pad2(match[1]), days: days}};
            }],
            [/^(\d+) (\d+) (\d+) \* \*$/, (match) => {
                return {mode: 'monthly', values: {time: pad2(match[2])+':'+pad2(match[1]), dayOfMonth: Number(match[3])}};
            }]
        ];
        for(let [pattern, toResult] of matchers){
            let match = pattern.exec(value);
            if(match){
                return toResult(match);
            }
        }
        return {mode: 'custom', values: {}};
    }

    renderCronFields()
    {
        let mode = this.byId('cron-mode').value;
        let values = this.cronValues;
        let numberInput = (key, min, max, label) => {
            return this.h('input', {type: 'number', min: String(min), max: String(max), step: '1', value: String(values[key]), 'aria-label': label, oninput: (event) => {
                values[key] = Number(event.currentTarget.value);
                this.updateCronFromFields();
            }});
        };
        let timeInput = () => {
            return this.h('input', {type: 'time', value: values.time, 'aria-label': 'Time', oninput: (event) => {
                values.time = event.currentTarget.value;
                this.updateCronFromFields();
            }});
        };
        let fields = [];
        if('minutes' === mode){
            fields = ['Every', numberInput('minutes', 1, 59, 'Minutes'), 'minutes'];
        }
        if('hourly' === mode){
            fields = ['At minute', numberInput('minute', 0, 59, 'Minute'), 'of every hour'];
        }
        if('daily' === mode){
            fields = ['At', timeInput()];
        }
        if('weekly' === mode){
            let names = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
            let checks = names.map(([day, name]) => {
                return this.h('label', {class: 'check'}, [
                    this.h('input', {type: 'checkbox', checked: -1 !== values.days.indexOf(day), onchange: (event) => {
                        values.days = values.days.filter((value) => {
                            return value !== day;
                        });
                        if(event.currentTarget.checked){
                            values.days.push(day);
                        }
                        this.updateCronFromFields();
                    }}),
                    name
                ]);
            });
            fields = [this.h('div', {class: 'weekdays'}, checks), 'at', timeInput()];
        }
        if('monthly' === mode){
            fields = ['On day', numberInput('dayOfMonth', 1, 31, 'Day of the month'), 'at', timeInput(),
                this.h('span', {class: 'muted help', text: 'Months without that day are skipped.'})];
        }
        if('custom' === mode){
            fields = [this.h('span', {class: 'muted help', text: 'Type any standard cron expression below, for example "0 */6 * * *" (every 6 hours) or "30 2 * * 1-5" (02:30 on weekdays).'})];
        }
        this.byId('cron-fields').replaceChildren(...fields);
    }

    buildCronFromFields()
    {
        let mode = this.byId('cron-mode').value;
        let values = this.cronValues;
        let timeParts = String(values.time || '03:00').split(':');
        let hour = Number(timeParts[0]);
        let minute = Number(timeParts[1]);
        if('minutes' === mode){
            return '*/'+values.minutes+' * * * *';
        }
        if('hourly' === mode){
            return values.minute+' * * * *';
        }
        if('daily' === mode){
            return minute+' '+hour+' * * *';
        }
        if('weekly' === mode){
            let days = values.days.slice().sort();
            return 0 === days.length ? '' : minute+' '+hour+' * * '+days.join(',');
        }
        if('monthly' === mode){
            return minute+' '+hour+' '+values.dayOfMonth+' * *';
        }
        return this.byId('cron-expression').value;
    }

    updateCronFromFields()
    {
        if('custom' === this.byId('cron-mode').value){
            return;
        }
        let expression = this.buildCronFromFields();
        this.byId('cron-expression').value = expression;
        this.previewCron(expression, this.byId('cron-preview'), 'Pick at least one day.');
    }

    setupPicker()
    {
        this.byId('picker-close').addEventListener('click', () => {
            this.byId('picker').close();
        });
        this.byId('picker-roots').addEventListener('click', () => {
            this.navigatePicker('');
        });
        this.byId('picker-up').addEventListener('click', () => {
            this.navigatePicker(this.pickerData ? this.pickerData.parent : '');
        });
        this.byId('picker-go').addEventListener('click', () => {
            this.navigatePicker(this.byId('picker-path').value);
        });
        this.byId('picker-path').addEventListener('keydown', (event) => {
            if('Enter' === event.key){
                event.preventDefault();
                this.navigatePicker(this.byId('picker-path').value);
            }
        });
        this.byId('picker-hidden').addEventListener('change', () => {
            this.renderPicker();
        });
        this.byId('picker-new').addEventListener('click', () => {
            this.createPickerFolder();
        });
        this.byId('picker-select').addEventListener('click', () => {
            if(!this.pickerData || this.pickerData.isRoots || !this.pickerCallback){
                return;
            }
            this.pickerCallback(this.pickerData.path);
            this.byId('picker').close();
        });
    }

    async openPicker(startPath, callback)
    {
        this.pickerCallback = callback;
        this.byId('picker-new-name').value = '';
        this.byId('picker').showModal();
        let opened = await this.navigatePicker(String(startPath || '').trim());
        if(!opened){
            await this.navigatePicker('');
        }
    }

    async navigatePicker(folderPath)
    {
        let errorBox = this.byId('picker-error');
        let data;
        try{
            data = await this.api('/api/browse?path='+encodeURIComponent(folderPath || ''));
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return false;
        }
        errorBox.hidden = true;
        this.pickerData = data;
        this.renderPicker();
        return true;
    }

    renderPicker()
    {
        let data = this.pickerData;
        if(!data){
            return;
        }
        let showHidden = this.byId('picker-hidden').checked;
        this.byId('picker-path').value = data.path;
        this.byId('picker-up').disabled = data.isRoots;
        this.byId('picker-select').disabled = data.isRoots;
        this.byId('picker-select').textContent = data.isRoots ? 'Open a drive or folder first' : 'Select '+data.path;
        this.byId('picker-new').disabled = data.isRoots;
        this.byId('picker-new-name').disabled = data.isRoots;
        let items = [];
        for(let folder of data.folders){
            if(!showHidden && (folder.hidden || folder.system)){
                continue;
            }
            items.push(this.h('button', {type: 'button', text: (data.isRoots ? '' : '▸ ')+folder.name, onclick: () => {
                this.navigatePicker(folder.path);
            }}));
        }
        if(0 === items.length){
            items.push(this.h('div', {class: 'empty muted', text: 'No sub-folders here.'}));
        }
        this.byId('picker-list').replaceChildren(...items);
        this.byId('picker-list').scrollTop = 0;
    }

    async createPickerFolder()
    {
        if(!this.pickerData || this.pickerData.isRoots){
            return;
        }
        let errorBox = this.byId('picker-error');
        let result;
        try{
            result = await this.api('/api/folders', {parent: this.pickerData.path, name: this.byId('picker-new-name').value});
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return;
        }
        this.byId('picker-new-name').value = '';
        await this.navigatePicker(result.path);
    }

    renderPath(path, exists)
    {
        return this.h('div', {class: 'path'}, [
            this.h('span', {class: exists ? 'ok-text' : 'danger-text', title: exists ? 'Found' : 'Not found', text: exists ? '✓' : '✗'}),
            this.h('code', {text: path}),
            exists ? '' : this.pill('not found', 'danger')
        ]);
    }

    describeFilters(mapping)
    {
        let parts = [];
        if(0 < mapping.includeExtensions.length){
            parts.push('only '+mapping.includeExtensions.join(' '));
        }
        if(0 < mapping.excludeExtensions.length){
            parts.push('skips '+mapping.excludeExtensions.join(' '));
        }
        if(mapping.excludeHidden){
            parts.push('skips hidden');
        }
        if(mapping.excludeSystem){
            parts.push('skips system files');
        }
        if(0 < mapping.excludeNames.length){
            parts.push('skips '+mapping.excludeNames.join(', '));
        }
        if(0 < mapping.maxSizeBytes){
            parts.push('max '+Math.round(mapping.maxSizeBytes/1048576)+' MB');
        }
        return 0 === parts.length ? 'No filters' : 'Filters: '+parts.join(' - ');
    }

    renderLogs()
    {
        let head = this.h('thead', {}, this.h('tr', {}, [
            this.h('th', {text: 'Date'}),
            this.h('th', {text: 'Type'}),
            this.h('th', {text: 'Result'}),
            this.h('th', {text: 'Config'}),
            this.h('th', {text: ''})
        ]));
        let rows = [];
        for(let log of this.status.logs){
            rows.push(this.h('tr', {}, [
                this.h('td', {}, [log.createdAt, this.h('div', {class: 'muted', text: this.ago(log.createdAt)})]),
                this.h('td', {}, this.renderLogType(log)),
                this.h('td', {text: this.describeLogResult(log)}),
                this.h('td', {class: 'mono muted', text: log.config || ''}),
                this.h('td', {}, this.h('button', {type: 'button', class: 'small', text: 'View', onclick: () => {
                    this.openLog(log.name);
                }}))
            ]));
        }
        if(0 === rows.length){
            rows.push(this.h('tr', {}, this.h('td', {colspan: '5', class: 'muted', text: 'No logs yet.'})));
        }
        this.byId('logs-table').replaceChildren(head, this.h('tbody', {}, rows));
    }

    renderLogType(log)
    {
        let pills = [];
        if('inspect' === log.type){
            pills.push(this.pill('Inspection', 'muted'));
        }
        if('sync' === log.type){
            pills.push(log.dryRun ? this.pill('Dry run', 'muted') : this.pill('Sync', 'ok'));
        }
        if(log.allowRemove){
            pills.push(' ', this.pill('remove', 'warn'));
        }
        if(log.interrupted){
            pills.push(' ', this.pill('interrupted', 'danger'));
        }
        if(this.isScopedRun(log)){
            pills.push(' ', this.pill(this.describeScope(log), 'muted'));
        }
        if(log.triggeredBy){
            pills.push(' ', this.pill('scheduled', 'running'));
        }
        return pills;
    }

    describeLogResult(log)
    {
        if('inspect' === log.type){
            if(0 === log.pendingFiles){
                return 'No changes';
            }
            return this.plural(log.pendingFiles, 'change', 'changes')+' in '+this.plural(log.counts['FOLDERS WITH CHANGES'] || 0, 'folder', 'folders');
        }
        let parts = [];
        let verb = log.dryRun ? 'to copy' : 'copied';
        parts.push(this.number(log.counts['UPDATED FILES'] || 0)+' '+verb);
        if(log.counts['ALREADY SYNCED FILES']){
            parts.push(this.number(log.counts['ALREADY SYNCED FILES'])+' already in sync');
        }
        if(log.counts['REMOVED FILES']){
            parts.push(this.number(log.counts['REMOVED FILES'])+(log.dryRun ? ' to remove' : ' removed'));
        }
        let errors = (log.counts['ERRORS'] || 0)+(log.counts['HASH ERRORS'] || 0);
        if(0 < errors){
            parts.push(this.plural(errors, 'error', 'errors'));
        }
        return parts.join(' - ');
    }

    renderConfigs()
    {
        let head = this.h('thead', {}, this.h('tr', {}, [
            this.h('th', {text: 'Created'}),
            this.h('th', {text: 'File'}),
            this.h('th', {text: 'Type'}),
            this.h('th', {class: 'num', text: 'Entries'}),
            this.h('th', {text: ''})
        ]));
        let rows = [];
        for(let config of this.status.configs){
            let entries = 'files' === config.type
                ? this.plural(config.destinations, 'copy', 'copies')
                : this.plural(config.entries, 'folder', 'folders');
            rows.push(this.h('tr', {class: config.generated ? '' : 'highlight'}, [
                this.h('td', {text: config.generated ? config.createdAt : 'main config'}),
                this.h('td', {class: 'mono', text: config.name}),
                this.h('td', {text: 'files' === config.type ? 'Files' : 'Folders'}),
                this.h('td', {class: 'num', text: config.error ? config.error : entries}),
                this.h('td', {}, this.h('div', {class: 'buttons'}, [
                    this.h('button', {type: 'button', class: 'small', text: 'View', onclick: () => {
                        this.openConfig(config.name);
                    }}),
                    this.h('button', {type: 'button', class: 'small', text: 'Use', onclick: () => {
                        this.byId('sync-config').value = config.name;
                        this.updateSyncForm();
                        this.byId('run-panel').scrollIntoView({behavior: 'smooth'});
                    }})
                ]))
            ]));
        }
        this.byId('configs-table').replaceChildren(head, this.h('tbody', {}, rows));
    }

    openDialog(title, children)
    {
        this.byId('dialog-title').textContent = title;
        this.byId('dialog-body').replaceChildren(...children);
        let dialog = this.byId('dialog');
        if(!dialog.open){
            dialog.showModal();
        }
    }

    async openLog(name)
    {
        this.openDialog(name, [this.h('p', {class: 'muted', text: 'Loading...'})]);
        let log;
        try{
            log = await this.api('/api/logs/'+encodeURIComponent(name));
        }catch(error){
            this.openDialog(name, [this.h('p', {class: 'danger-text', text: error.message})]);
            return;
        }
        let chips = [this.pill(log.createdAt, 'muted')].concat(this.renderLogType(log));
        if(log.config){
            chips.push(this.pill('config: '+log.config, 'muted'));
        }
        chips.push(this.pill(log.withHash ? 'hash on' : 'hash off', 'muted'));
        if(null !== log.modifiedTimeThresholdMs){
            chips.push(this.pill('time tolerance '+(log.modifiedTimeThresholdMs/1000)+' s', 'muted'));
        }
        let children = [
            this.h('div', {class: 'chips'}, chips),
            this.h('div', {text: this.describeLogResult(log)})
        ];
        let openSections = ['UPDATED FILES', 'REMOVED FILES', 'ERRORS', 'HASH ERRORS', 'FOLDERS WITH CHANGES'];
        for(let section of log.sections){
            let lines = section.lines.slice();
            if(0 < section.truncated){
                lines.push('... and '+this.number(section.truncated)+' more lines, open the raw log to see them all.');
            }
            children.push(this.h('details', {open: -1 !== openSections.indexOf(section.title) && section.count < 2000}, [
                this.h('summary', {text: section.title+' ('+this.number(section.count)+')'}),
                this.h('pre', {text: lines.join('\n')})
            ]));
        }
        if(0 === log.sections.length){
            children.push(this.h('p', {class: 'muted', text: 'Nothing to list.'}));
        }
        children.push(this.h('div', {class: 'buttons'}, [
            this.h('a', {class: 'button small', href: '/raw/logs/'+encodeURIComponent(name), target: '_blank', rel: 'noopener', text: 'Open raw log'})
        ]));
        this.openDialog(name, children);
    }

    async openConfig(name)
    {
        this.openDialog(name, [this.h('p', {class: 'muted', text: 'Loading...'})]);
        let config;
        try{
            config = await this.api('/api/configs/'+encodeURIComponent(name));
        }catch(error){
            this.openDialog(name, [this.h('p', {class: 'danger-text', text: error.message})]);
            return;
        }
        let children = [];
        let summary = 'files' === config.type
            ? this.plural(config.destinations, 'file copy', 'file copies')+' from '+this.plural(config.entries, 'source file', 'source files')+' in '+this.plural(config.folders.length, 'destination folder', 'destination folders')
            : this.plural(config.entries, 'folder mapping', 'folder mappings')+' to '+this.plural(config.destinations, 'destination', 'destinations');
        children.push(this.h('div', {class: 'chips'}, [
            this.pill(config.generated ? 'created '+config.createdAt : 'main config', 'muted'),
            this.pill('files' === config.type ? 'Files config' : 'Folders config', 'muted'),
            null === config.modifiedTimeThresholdMs ? '' : this.pill('time tolerance '+(config.modifiedTimeThresholdMs/1000)+' s', 'muted')
        ]));
        children.push(this.h('div', {text: summary}));
        if(config.error){
            children.push(this.h('p', {class: 'danger-text', text: config.error}));
        }
        for(let folder of config.folders){
            children.push(this.h('details', {}, [
                this.h('summary', {text: folder.destination+' ('+this.number(folder.files.length)+')'}),
                this.h('pre', {text: 'From: '+folder.source+'\n\n'+folder.files.join('\n')})
            ]));
        }
        if(0 < config.mappings.length){
            let lines = [];
            for(let mapping of config.mappings){
                lines.push(mapping.from+'\n  -> '+(mapping.to || []).join('\n  -> '));
            }
            children.push(this.h('details', {open: config.mappings.length < 50}, [
                this.h('summary', {text: 'Mappings ('+this.number(config.mappings.length)+')'}),
                this.h('pre', {text: lines.join('\n\n')})
            ]));
        }
        children.push(this.h('div', {class: 'buttons'}, [
            this.h('button', {type: 'button', class: 'small', text: 'Preview (dry run)', onclick: () => {
                this.byId('dialog').close();
                this.startJob({action: 'sync', config: name, dryRun: true});
            }}),
            this.h('button', {type: 'button', class: 'small primary', text: 'Sync now', onclick: (event) => {
                this.confirmClick(event.currentTarget, 'Confirm', () => {
                    this.byId('dialog').close();
                    this.startJob({action: 'sync', config: name, dryRun: false});
                });
            }}),
            this.h('a', {class: 'button small', href: '/raw/configs/'+encodeURIComponent(name), target: '_blank', rel: 'noopener', text: 'Open raw file'})
        ]));
        this.openDialog(name, children);
    }

    isJobRunning()
    {
        return !!(this.status && this.status.job && this.status.job.running);
    }

    async startJob(params)
    {
        try{
            await this.api('/api/run', params);
        }catch(error){
            this.showError(error.message);
            return;
        }
        this.hideError();
        this.wasRunning = true;
        this.byId('job').hidden = false;
        this.byId('run-panel').scrollIntoView({behavior: 'smooth'});
        this.pollJob();
    }

    async stopJob()
    {
        try{
            await this.api('/api/stop', {});
        }catch(error){
            this.showError(error.message);
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
            data = await this.api('/api/job?from='+requestedFrom);
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
        if(this.status){
            this.status.job = job;
        }
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
        let output = this.byId('job-output');
        let isAtBottom = output.scrollTop+output.clientHeight >= output.scrollHeight-40;
        if(0 < job.skippedLines){
            this.outputLines.push('... '+this.number(job.skippedLines)+' older lines not shown ...');
        }
        for(let line of job.lines){
            this.outputLines.push(line);
        }
        if(this.maxOutputLines < this.outputLines.length){
            this.outputLines.splice(0, this.outputLines.length-this.maxOutputLines);
        }
        this.nextLine = job.nextLine;
        this.byId('job-lines').textContent = 0 < this.outputLines.length ? this.outputLines.join('\n')+'\n' : '';
        this.byId('job-current').textContent = job.currentLine || '';
        if(isAtBottom){
            output.scrollTop = output.scrollHeight;
        }
    }

    renderJob(job)
    {
        this.byId('job').hidden = false;
        this.byId('job-label').textContent = job.label;
        this.byId('job-command').textContent = job.command;
        let state = '';
        if(job.running){
            state = (job.stopping ? 'Stopping... ' : 'Running since ')+new Date(job.startedAt).toLocaleTimeString()
                +'. Closing the Backup Tool console window cancels it.';
        }
        if(!job.running){
            state = (0 === job.exitCode ? 'Finished at ' : 'Ended with exit code '+job.exitCode+' at ')+new Date(job.finishedAt).toLocaleTimeString();
        }
        this.byId('job-state').textContent = '- '+state;
        let stopButton = this.byId('stop-job');
        stopButton.hidden = !job.running;
        stopButton.disabled = job.stopping;
        let files = [];
        if(job.outputFiles['Log file']){
            let logName = job.outputFiles['Log file'];
            files.push(this.h('button', {type: 'button', class: 'small', text: 'View log', onclick: () => {
                this.openLog(logName);
            }}));
        }
        if(job.outputFiles['File config']){
            let fileConfig = job.outputFiles['File config'];
            files.push(this.h('button', {type: 'button', class: 'small', text: 'View changed files', onclick: () => {
                this.openConfig(fileConfig);
            }}));
            files.push(this.h('button', {type: 'button', class: 'small primary', text: 'Preview sync of these files', onclick: () => {
                this.startJob({action: 'sync', config: fileConfig, dryRun: true});
            }}));
        }
        this.byId('job-files').replaceChildren(...files);
        this.renderJobPill(job);
    }

    renderJobPill(job)
    {
        let pill = this.byId('job-pill');
        let isRunning = job && job.running;
        pill.className = 'pill '+(isRunning ? 'running' : 'muted');
        pill.textContent = isRunning ? 'Running: '+job.label : 'Idle';
        this.byId('run-inspect').disabled = !!isRunning;
        // per-mapping Inspect/Preview/Sync buttons: off while a job runs, and always off for disabled mappings
        for(let button of document.querySelectorAll('[data-run-button]')){
            button.disabled = !!isRunning || '1' === button.dataset.mappingDisabled;
        }
        this.updateSyncForm();
    }

}

let backupToolClient = new BackupToolClient();
backupToolClient.init();
