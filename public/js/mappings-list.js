class MappingsList
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.messages = props.messages;
        this.confirmation = props.confirmation;
        this.startJob = props.startJob;
        this.openMappingEditor = props.openMappingEditor;
        this.refresh = props.refresh;
    }

    renderMappings()
    {
        let container = this.dom.byId('mappings');
        let mappings = this.panelStatus.data.mappings || [];
        if(0 === mappings.length){
            container.replaceChildren(this.dom.h('p', {
                class: 'danger-text',
                text: this.panelStatus.data.mappingsError || 'No mappings configured.'
            }));
            return;
        }
        let rows = [];
        let isRunning = this.panelStatus.isJobRunning();
        for(let index = 0; index < mappings.length; index++){
            rows.push(this.renderMapping(index, mappings[index], isRunning));
        }
        rows.push(this.dom.h('p', {
            class: 'muted',
            text: 'Changes are saved in configurations/inspect.config.js. Commit that file in the configuration'
                +' repository to keep its history.'
        }));
        container.replaceChildren(...rows);
    }

    renderMapping(index, mapping, isRunning)
    {
        let destinations = [];
        for(let destination of mapping.to){
            destinations.push(this.renderPath(destination.path, destination.exists));
        }
        return this.dom.h('div', {class: 'mapping'+(mapping.enabled ? '' : ' is-disabled')}, [
            this.dom.h('div', {class: 'mapping-head'}, [
                this.dom.h('span', {class: 'mapping-number', text: '#'+mapping.number}),
                this.dom.h('label', {class: 'check'}, [
                    this.dom.h('input', {type: 'checkbox', checked: mapping.enabled, onchange: (event) => {
                        this.toggleMapping(index, mapping.from, event.currentTarget.checked);
                    }}),
                    'Enabled'
                ]),
                mapping.enabled
                    ? ''
                    : this.dom.pill('disabled: skipped by full inspections, syncs and schedules', 'muted')
            ]),
            this.renderMappingSchedule(index, mapping),
            this.renderPath(mapping.from, mapping.fromExists),
            this.dom.h('span', {class: 'arrow', text: '→'}),
            this.dom.h('div', {}, destinations),
            this.dom.h('div', {class: 'filters muted', text: this.describeFilters(mapping)}),
            this.renderMappingActions(index, mapping, isRunning)
        ]);
    }

    renderMappingActions(index, mapping, isRunning)
    {
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
        return this.dom.h('div', {class: 'mapping-actions'}, [
            this.dom.h('button', Object.assign(runButtonAttributes('Inspect'), {onclick: () => {
                this.startJob({action: 'inspect', mapping: index, expectedFrom: mapping.from});
            }})),
            this.dom.h('button', Object.assign(runButtonAttributes('Sync', 'primary'), {
                title: 'Inspects this mapping, then copies the changes it finds',
                onclick: (event) => {
                    this.confirmation.confirmClick(event.currentTarget, 'Confirm', () => {
                        this.startJob({action: 'sync', mapping: index, expectedFrom: mapping.from, dryRun: false});
                    });
                }
            })),
            this.dom.h('button', {type: 'button', class: 'small', text: 'Edit', onclick: () => {
                this.openMappingEditor(index);
            }}),
            this.dom.h('button', {type: 'button', class: 'small', text: 'Delete', onclick: (event) => {
                this.confirmation.confirmClick(event.currentTarget, 'Confirm', () => {
                    this.deleteMapping(index, mapping.from);
                });
            }})
        ]);
    }

    renderMappingSchedule(index, mapping)
    {
        let schedule = mapping.schedule;
        let text = 'Not scheduled';
        let textClass = 'muted';
        if(schedule.enabled && schedule.nextRunAt){
            let source = '' === schedule.cron ? 'general schedule' : 'own schedule';
            text = schedule.description+' ('+source+', '+schedule.effectiveCron+'), next run '
                +this.formatter.formatDateTime(schedule.nextRunAt);
            textClass = '';
        }
        if(schedule.enabled && !schedule.nextRunAt){
            text = 'Scheduled, but not running: '
                +(mapping.enabled ? 'no valid cron here or in the general schedule' : 'the mapping is disabled');
            textClass = 'warn-text';
        }
        return this.dom.h('div', {class: 'mapping-head mapping-schedule'}, [
            this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {type: 'checkbox', checked: schedule.enabled, onchange: (event) => {
                    this.toggleMappingSchedule(index, mapping.from, event.currentTarget.checked);
                }}),
                'Scheduled'
            ]),
            this.dom.h('span', {class: textClass, text: text})
        ]);
    }

    async toggleMappingSchedule(index, expectedFrom, enabled)
    {
        try{
            await this.api.request(
                '/api/mappings/'+index+'/schedule',
                {expectedFrom: expectedFrom, enabled: enabled},
                'PUT'
            );
        }catch(error){
            this.messages.showMappingsNotice(error.message, 'warn');
            await this.refresh();
            return;
        }
        this.messages.showMappingsNotice(
            'Mapping #'+(index+1)+' schedule turned '+(enabled ? 'on' : 'off')
                +'. The scheduler picks it up within a minute.',
            'ok'
        );
        await this.refresh();
    }

    async toggleMapping(index, expectedFrom, enabled)
    {
        try{
            await this.api.request(
                '/api/mappings/'+index+'/enabled',
                {expectedFrom: expectedFrom, enabled: enabled},
                'PUT'
            );
        }catch(error){
            this.messages.showMappingsNotice(error.message, 'warn');
        }
        if(!enabled){
            this.messages.showMappingsNotice(
                'Mapping #'+(index+1)+' disabled: full inspections and syncs skip it.',
                'ok'
            );
        }
        if(enabled){
            this.messages.showMappingsNotice('Mapping #'+(index+1)+' enabled.', 'ok');
        }
        await this.refresh();
    }

    async deleteMapping(index, expectedFrom)
    {
        try{
            await this.api.request('/api/mappings/'+index+'?from='+encodeURIComponent(expectedFrom), false, 'DELETE');
        }catch(error){
            this.messages.showMappingsNotice(error.message, 'warn');
            return;
        }
        this.messages.showMappingsNotice('Mapping deleted: '+expectedFrom, 'ok');
        await this.refresh();
    }

    renderPath(path, exists)
    {
        return this.dom.h('div', {class: 'path'}, [
            this.dom.h('span', {
                class: exists ? 'ok-text' : 'danger-text',
                title: exists ? 'Found' : 'Not found',
                text: exists ? '✓' : '✗'
            }),
            this.dom.h('code', {text: path}),
            exists ? '' : this.dom.pill('not found', 'danger')
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

}
