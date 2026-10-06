class LogsTable
{

    constructor(props)
    {
        this.dom = props.dom;
        this.formatter = props.formatter;
        this.panelStatus = props.panelStatus;
        this.logSummary = props.logSummary;
        this.openLog = props.openLog;
    }

    renderLogs()
    {
        let head = this.dom.h('thead', {}, this.dom.h('tr', {}, [
            this.dom.h('th', {text: 'Date'}),
            this.dom.h('th', {text: 'Type'}),
            this.dom.h('th', {text: 'Result'}),
            this.dom.h('th', {text: 'Config'}),
            this.dom.h('th', {text: ''})
        ]));
        let rows = [];
        for(let log of this.panelStatus.data.logs){
            rows.push(this.dom.h('tr', {}, [
                this.dom.h('td', {}, [
                    log.createdAt,
                    this.dom.h('div', {class: 'muted', text: this.formatter.ago(log.createdAt)})
                ]),
                this.dom.h('td', {}, this.logSummary.renderLogType(log)),
                this.dom.h('td', {text: this.logSummary.describeLogResult(log)}),
                this.dom.h('td', {class: 'mono muted', text: log.config || ''}),
                this.dom.h('td', {}, this.dom.h('button', {
                    type: 'button',
                    class: 'small',
                    text: 'View',
                    onclick: () => {
                        this.openLog(log.name);
                    }
                }))
            ]));
        }
        if(0 === rows.length){
            rows.push(this.dom.h('tr', {}, this.dom.h('td', {colspan: '5', class: 'muted', text: 'No logs yet.'})));
        }
        this.dom.byId('logs-table').replaceChildren(head, this.dom.h('tbody', {}, rows));
    }

}
