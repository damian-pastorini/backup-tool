class ConfigsTable
{

    constructor(props)
    {
        this.dom = props.dom;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.openConfig = props.openConfig;
        this.useConfig = props.useConfig;
    }

    renderConfigs()
    {
        let head = this.dom.h('thead', {}, this.dom.h('tr', {}, [
            this.dom.h('th', {text: 'Created'}),
            this.dom.h('th', {text: 'File'}),
            this.dom.h('th', {text: 'Type'}),
            this.dom.h('th', {class: 'num', text: 'Entries'}),
            this.dom.h('th', {text: ''})
        ]));
        let rows = [];
        for(let config of this.panelStatus.data.configs){
            let entries = 'files' === config.type
                ? this.formatter.plural(config.destinations, 'copy', 'copies')
                : this.formatter.plural(config.entries, 'folder', 'folders');
            rows.push(this.dom.h('tr', {class: config.generated ? '' : 'highlight'}, [
                this.dom.h('td', {text: config.generated ? config.createdAt : 'main config'}),
                this.dom.h('td', {class: 'mono', text: config.name}),
                this.dom.h('td', {text: 'files' === config.type ? 'Files' : 'Folders'}),
                this.dom.h('td', {class: 'num', text: config.error ? config.error : entries}),
                this.dom.h('td', {}, this.dom.h('div', {class: 'buttons'}, [
                    this.dom.h('button', {type: 'button', class: 'small', text: 'View', onclick: () => {
                        this.openConfig(config.name);
                    }}),
                    this.dom.h('button', {type: 'button', class: 'small', text: 'Use', onclick: () => {
                        this.useConfig(config.name);
                    }})
                ]))
            ]));
        }
        this.dom.byId('configs-table').replaceChildren(head, this.dom.h('tbody', {}, rows));
    }

}
