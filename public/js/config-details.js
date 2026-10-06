class ConfigDetails
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.formatter = props.formatter;
        this.panelDialog = props.panelDialog;
        this.confirmation = props.confirmation;
        this.startJob = props.startJob;
    }

    async openConfig(name)
    {
        this.panelDialog.openDialog(name, [this.dom.h('p', {class: 'muted', text: 'Loading...'})]);
        let config;
        try{
            config = await this.api.request('/api/configs/'+encodeURIComponent(name));
        }catch(error){
            this.panelDialog.openDialog(name, [this.dom.h('p', {class: 'danger-text', text: error.message})]);
            return;
        }
        let children = [];
        children.push(this.dom.h('div', {class: 'chips'}, [
            this.dom.pill(config.generated ? 'created '+config.createdAt : 'main config', 'muted'),
            this.dom.pill('files' === config.type ? 'Files config' : 'Folders config', 'muted'),
            null === config.modifiedTimeThresholdMs
                ? ''
                : this.dom.pill('time tolerance '+(config.modifiedTimeThresholdMs/1000)+' s', 'muted')
        ]));
        children.push(this.dom.h('div', {text: this.describeConfig(config)}));
        if(config.error){
            children.push(this.dom.h('p', {class: 'danger-text', text: config.error}));
        }
        for(let folder of config.folders){
            children.push(this.dom.h('details', {}, [
                this.dom.h('summary', {text: folder.destination+' ('+this.formatter.number(folder.files.length)+')'}),
                this.dom.h('pre', {text: 'From: '+folder.source+'\n\n'+folder.files.join('\n')})
            ]));
        }
        if(0 < config.removals.length){
            children.push(this.dom.h('details', {open: config.removals.length < 50}, [
                this.dom.h('summary', {text: 'Files to remove ('+this.formatter.number(config.removals.length)+')'}),
                this.dom.h('pre', {text: config.removals.join('\n')})
            ]));
        }
        if(0 < config.mappings.length){
            let lines = [];
            for(let mapping of config.mappings){
                lines.push(mapping.from+'\n  -> '+(mapping.to || []).join('\n  -> '));
            }
            children.push(this.dom.h('details', {open: config.mappings.length < 50}, [
                this.dom.h('summary', {text: 'Mappings ('+this.formatter.number(config.mappings.length)+')'}),
                this.dom.h('pre', {text: lines.join('\n\n')})
            ]));
        }
        children.push(this.buildActions(name));
        this.panelDialog.openDialog(name, children);
    }

    describeConfig(config)
    {
        if('files' === config.type){
            return this.formatter.plural(config.destinations, 'file copy', 'file copies')
                +' from '+this.formatter.plural(config.entries, 'source file', 'source files')
                +' in '+this.formatter.plural(config.folders.length, 'destination folder', 'destination folders')
                +(0 < config.removals.length
                    ? ', and '+this.formatter.plural(config.removals.length, 'file', 'files')+' to remove'
                    : '');
        }
        return this.formatter.plural(config.entries, 'folder mapping', 'folder mappings')
            +' to '+this.formatter.plural(config.destinations, 'destination', 'destinations');
    }

    buildActions(name)
    {
        return this.dom.h('div', {class: 'buttons'}, [
            this.dom.h('button', {type: 'button', class: 'small', text: 'Preview (dry run)', onclick: () => {
                this.dom.byId('dialog').close();
                this.startJob({action: 'sync', config: name, dryRun: true});
            }}),
            this.dom.h('button', {type: 'button', class: 'small primary', text: 'Sync now', onclick: (event) => {
                this.confirmation.confirmClick(event.currentTarget, 'Confirm', () => {
                    this.dom.byId('dialog').close();
                    this.startJob({action: 'sync', config: name, dryRun: false});
                });
            }}),
            this.dom.h('a', {
                class: 'button small',
                href: '/raw/configs/'+encodeURIComponent(name),
                target: '_blank',
                rel: 'noopener',
                text: 'Open raw file'
            })
        ]);
    }

}
