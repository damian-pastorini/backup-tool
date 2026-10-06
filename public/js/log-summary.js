class LogSummary
{

    constructor(props)
    {
        this.dom = props.dom;
        this.formatter = props.formatter;
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

    renderLogType(log)
    {
        let pills = [];
        if('inspect' === log.type){
            pills.push(this.dom.pill('Inspection', 'muted'));
        }
        if('sync' === log.type){
            pills.push(log.dryRun ? this.dom.pill('Dry run', 'muted') : this.dom.pill('Sync', 'ok'));
        }
        if(log.allowRemove){
            pills.push(' ', this.dom.pill('remove', 'warn'));
        }
        if(log.interrupted){
            pills.push(' ', this.dom.pill('interrupted', 'danger'));
        }
        if(this.isScopedRun(log)){
            pills.push(' ', this.dom.pill(this.describeScope(log), 'muted'));
        }
        if(log.triggeredBy){
            pills.push(' ', this.dom.pill('scheduled', 'running'));
        }
        return pills;
    }

    describeLogResult(log)
    {
        if('inspect' === log.type){
            if(0 === log.pendingFiles){
                return 'No changes';
            }
            return this.formatter.plural(log.pendingFiles, 'change', 'changes')+' in '
                +this.formatter.plural(log.counts['FOLDERS WITH CHANGES'] || 0, 'folder', 'folders');
        }
        let parts = [];
        let verb = log.dryRun ? 'to copy' : 'copied';
        parts.push(this.formatter.number(log.counts['UPDATED FILES'] || 0)+' '+verb);
        if(log.counts['ALREADY SYNCED FILES']){
            parts.push(this.formatter.number(log.counts['ALREADY SYNCED FILES'])+' already in sync');
        }
        if(log.counts['REMOVED FILES']){
            parts.push(this.formatter.number(log.counts['REMOVED FILES'])+(log.dryRun ? ' to remove' : ' removed'));
        }
        let errors = (log.counts['ERRORS'] || 0)+(log.counts['HASH ERRORS'] || 0);
        if(0 < errors){
            parts.push(this.formatter.plural(errors, 'error', 'errors'));
        }
        return parts.join(' - ');
    }

}
