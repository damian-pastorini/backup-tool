class CronPreview
{

    constructor(props)
    {
        this.api = props.api;
        this.formatter = props.formatter;
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
                result = await this.api.request('/api/cron?expression='+encodeURIComponent(value));
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
                return this.formatter.formatDateTime(run);
            }).join(', ');
        }, 250);
    }

}
