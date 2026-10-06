class LogDetails
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.formatter = props.formatter;
        this.logSummary = props.logSummary;
        this.panelDialog = props.panelDialog;
    }

    async openLog(name)
    {
        this.panelDialog.openDialog(name, [this.dom.h('p', {class: 'muted', text: 'Loading...'})]);
        let log;
        try{
            log = await this.api.request('/api/logs/'+encodeURIComponent(name));
        }catch(error){
            this.panelDialog.openDialog(name, [this.dom.h('p', {class: 'danger-text', text: error.message})]);
            return;
        }
        let chips = [this.dom.pill(log.createdAt, 'muted')].concat(this.logSummary.renderLogType(log));
        if(log.config){
            chips.push(this.dom.pill('config: '+log.config, 'muted'));
        }
        chips.push(this.dom.pill(log.withHash ? 'hash on' : 'hash off', 'muted'));
        if(null !== log.modifiedTimeThresholdMs){
            chips.push(this.dom.pill('time tolerance '+(log.modifiedTimeThresholdMs/1000)+' s', 'muted'));
        }
        let children = [
            this.dom.h('div', {class: 'chips'}, chips),
            this.dom.h('div', {text: this.logSummary.describeLogResult(log)})
        ];
        let openSections = ['UPDATED FILES', 'REMOVED FILES', 'ERRORS', 'HASH ERRORS', 'FOLDERS WITH CHANGES'];
        for(let section of log.sections){
            let lines = section.lines.slice();
            if(0 < section.truncated){
                lines.push('... and '+this.formatter.number(section.truncated)
                    +' more lines, open the raw log to see them all.');
            }
            let isOpen = -1 !== openSections.indexOf(section.title) && section.count < 2000;
            children.push(this.dom.h('details', {open: isOpen}, [
                this.dom.h('summary', {text: section.title+' ('+this.formatter.number(section.count)+')'}),
                this.dom.h('pre', {text: lines.join('\n')})
            ]));
        }
        if(0 === log.sections.length){
            children.push(this.dom.h('p', {class: 'muted', text: 'Nothing to list.'}));
        }
        children.push(this.dom.h('div', {class: 'buttons'}, [
            this.dom.h('a', {
                class: 'button small',
                href: '/raw/logs/'+encodeURIComponent(name),
                target: '_blank',
                rel: 'noopener',
                text: 'Open raw log'
            })
        ]));
        this.panelDialog.openDialog(name, children);
    }

}
