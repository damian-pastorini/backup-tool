class RunForm
{

    constructor(props)
    {
        this.dom = props.dom;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.confirmation = props.confirmation;
        this.startJob = props.startJob;
        this.openConfig = props.openConfig;
        this.latestFilesConfigName = '';
    }

    setup()
    {
        this.dom.byId('run-inspect').addEventListener('click', () => {
            this.startJob({action: 'inspect', withHash: this.dom.byId('inspect-hash').checked});
        });
        this.dom.byId('run-sync').addEventListener('click', (event) => {
            this.runSelectedSync(event.currentTarget);
        });
        this.dom.byId('view-sync-config').addEventListener('click', () => {
            let configName = this.dom.byId('sync-config').value;
            if(configName){
                this.openConfig(configName);
            }
        });
        this.dom.byId('sync-config').addEventListener('change', () => {
            this.updateSyncForm();
        });
        this.dom.byId('sync-dry').addEventListener('change', () => {
            this.updateSyncForm();
        });
    }

    configLabel(config)
    {
        if('inspect.config.js' === config.name){
            return 'inspect.config.js - full scan of all mappings';
        }
        if('sync.config.js' === config.name){
            return 'sync.config.js - default config ('+this.formatter.plural(config.entries, 'folder', 'folders')+')';
        }
        if('files' === config.type){
            return config.createdAt+' - '+this.formatter.plural(config.destinations, 'file copy', 'file copies')
                +(0 < config.removals ? ', '+this.formatter.number(config.removals)+' to remove' : '');
        }
        return config.createdAt+' - '+this.formatter.plural(config.entries, 'folder', 'folders');
    }

    renderSyncConfigSelect()
    {
        let select = this.dom.byId('sync-config');
        let previous = select.value;
        let groups = [
            {label: 'Changed files (from inspections)', items: []},
            {label: 'Changed folders (from inspections)', items: []},
            {label: 'Main configs', items: []}
        ];
        for(let config of this.panelStatus.data.configs){
            let groupIndex = !config.generated ? 2 : ('files' === config.type ? 0 : 1);
            groups[groupIndex].items.push(this.dom.h('option', {value: config.name, text: this.configLabel(config)}));
        }
        let children = [];
        for(let group of groups){
            if(0 < group.items.length){
                children.push(this.dom.h('optgroup', {label: group.label}, group.items));
            }
        }
        select.replaceChildren(...children);
        if(previous && this.findConfig(previous)){
            select.value = previous;
        }
        let latestFilesConfig = this.panelStatus.data.latestFilesConfig;
        let latestName = latestFilesConfig ? latestFilesConfig.name : '';
        if(latestName && latestName !== this.latestFilesConfigName){
            // a new inspection created a new files config, select it:
            select.value = latestName;
        }
        this.latestFilesConfigName = latestName;
        this.updateSyncForm();
    }

    findConfig(name)
    {
        for(let config of (this.panelStatus.data.configs || [])){
            if(config.name === name){
                return config;
            }
        }
        return false;
    }

    updateSyncForm()
    {
        let config = this.findConfig(this.dom.byId('sync-config').value);
        let removeInput = this.dom.byId('sync-remove');
        let isFilesConfig = config && 'files' === config.type;
        removeInput.disabled = !config || isFilesConfig;
        if(removeInput.disabled){
            removeInput.checked = false;
        }
        removeInput.closest('label').classList.toggle('disabled', removeInput.disabled);
        let button = this.dom.byId('run-sync');
        let isDryRun = this.dom.byId('sync-dry').checked;
        button.textContent = isDryRun ? 'Preview sync' : 'Start sync (copies files)';
        button.classList.toggle('danger', !isDryRun);
        button.disabled = !config || this.panelStatus.isJobRunning();
        this.dom.byId('view-sync-config').disabled = !config;
        delete button.dataset.confirming;
        button.style.minWidth = '';
        button.removeAttribute('title');
    }

    useConfig(name)
    {
        this.dom.byId('sync-config').value = name;
        this.updateSyncForm();
        this.dom.byId('run-panel').scrollIntoView({behavior: 'smooth'});
    }

    runSelectedSync(button)
    {
        let params = {
            action: 'sync',
            config: this.dom.byId('sync-config').value,
            dryRun: this.dom.byId('sync-dry').checked,
            withHash: this.dom.byId('sync-hash').checked,
            allowRemove: this.dom.byId('sync-remove').checked
        };
        if(params.dryRun){
            this.startJob(params);
            return;
        }
        let config = this.findConfig(params.config);
        let isRemoving = params.allowRemove || (config && 0 < config.removals);
        let message = isRemoving ? 'Click again to copy AND delete' : 'Click again to copy';
        this.confirmation.confirmClick(button, message, () => {
            this.startJob(params);
        });
    }

}
