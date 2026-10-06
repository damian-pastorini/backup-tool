class CronBuilder
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.cronPreview = props.cronPreview;
        this.cronValues = {minutes: 30, minute: 0, time: '03:00', days: [1], dayOfMonth: 1};
        this.cronCallback = false;
    }

    setup()
    {
        this.dom.byId('cron-close').addEventListener('click', () => {
            this.dom.byId('cron-dialog').close();
        });
        this.dom.byId('cron-mode').addEventListener('change', () => {
            this.renderCronFields();
            this.updateCronFromFields();
        });
        this.dom.byId('cron-expression').addEventListener('input', () => {
            // typing an expression switches to the custom mode:
            if('custom' !== this.dom.byId('cron-mode').value){
                this.dom.byId('cron-mode').value = 'custom';
                this.renderCronFields();
            }
            this.cronPreview.previewCron(this.dom.byId('cron-expression').value, this.dom.byId('cron-preview'));
        });
        this.dom.byId('cron-use').addEventListener('click', async () => {
            await this.useExpression();
        });
        this.dom.byId('cron-clear').addEventListener('click', () => {
            this.dom.byId('cron-dialog').close();
            this.cronCallback('');
        });
    }

    async useExpression()
    {
        let expression = this.dom.byId('cron-expression').value.trim().replace(/\s+/g, ' ');
        let result;
        try{
            result = await this.api.request('/api/cron?expression='+encodeURIComponent(expression));
        }catch(error){
            result = {valid: false, error: error.message};
        }
        if(!result.valid){
            let preview = this.dom.byId('cron-preview');
            preview.textContent = result.error;
            preview.classList.add('danger-text');
            return;
        }
        this.dom.byId('cron-dialog').close();
        this.cronCallback(expression);
    }

    openCronBuilder(expression, callback)
    {
        this.cronCallback = callback;
        let parsed = this.parseCronForBuilder(expression);
        Object.assign(this.cronValues, parsed.values);
        this.dom.byId('cron-mode').value = parsed.mode;
        this.renderCronFields();
        let value = String(expression || '').trim();
        this.dom.byId('cron-expression').value = '' === value ? this.buildCronFromFields() : value;
        this.cronPreview.previewCron(this.dom.byId('cron-expression').value, this.dom.byId('cron-preview'));
        this.dom.byId('cron-dialog').showModal();
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
                return {
                    mode: 'monthly',
                    values: {time: pad2(match[2])+':'+pad2(match[1]), dayOfMonth: Number(match[3])}
                };
            }]
        ];
        for(let matcher of matchers){
            let match = matcher[0].exec(value);
            if(match){
                return matcher[1](match);
            }
        }
        return {mode: 'custom', values: {}};
    }

    renderCronFields()
    {
        let mode = this.dom.byId('cron-mode').value;
        let fields = [];
        if('minutes' === mode){
            fields = ['Every', this.buildNumberInput('minutes', 1, 59, 'Minutes'), 'minutes'];
        }
        if('hourly' === mode){
            fields = ['At minute', this.buildNumberInput('minute', 0, 59, 'Minute'), 'of every hour'];
        }
        if('daily' === mode){
            fields = ['At', this.buildTimeInput()];
        }
        if('weekly' === mode){
            fields = [this.dom.h('div', {class: 'weekdays'}, this.buildWeekdayChecks()), 'at', this.buildTimeInput()];
        }
        if('monthly' === mode){
            fields = [
                'On day',
                this.buildNumberInput('dayOfMonth', 1, 31, 'Day of the month'),
                'at',
                this.buildTimeInput(),
                this.dom.h('span', {class: 'muted help', text: 'Months without that day are skipped.'})
            ];
        }
        if('custom' === mode){
            fields = [this.dom.h('span', {
                class: 'muted help',
                text: 'Type any standard cron expression below, for example "0 */6 * * *" (every 6 hours)'
                    +' or "30 2 * * 1-5" (02:30 on weekdays).'
            })];
        }
        this.dom.byId('cron-fields').replaceChildren(...fields);
    }

    buildNumberInput(key, min, max, label)
    {
        let values = this.cronValues;
        return this.dom.h('input', {
            type: 'number',
            min: String(min),
            max: String(max),
            step: '1',
            value: String(values[key]),
            'aria-label': label,
            oninput: (event) => {
                values[key] = Number(event.currentTarget.value);
                this.updateCronFromFields();
            }
        });
    }

    buildTimeInput()
    {
        let values = this.cronValues;
        return this.dom.h('input', {type: 'time', value: values.time, 'aria-label': 'Time', oninput: (event) => {
            values.time = event.currentTarget.value;
            this.updateCronFromFields();
        }});
    }

    buildWeekdayChecks()
    {
        let values = this.cronValues;
        let names = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
        return names.map((dayName) => {
            let day = dayName[0];
            return this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {type: 'checkbox', checked: -1 !== values.days.indexOf(day), onchange: (event) => {
                    values.days = values.days.filter((value) => {
                        return value !== day;
                    });
                    if(event.currentTarget.checked){
                        values.days.push(day);
                    }
                    this.updateCronFromFields();
                }}),
                dayName[1]
            ]);
        });
    }

    buildCronFromFields()
    {
        let mode = this.dom.byId('cron-mode').value;
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
        return this.dom.byId('cron-expression').value;
    }

    updateCronFromFields()
    {
        if('custom' === this.dom.byId('cron-mode').value){
            return;
        }
        let expression = this.buildCronFromFields();
        this.dom.byId('cron-expression').value = expression;
        this.cronPreview.previewCron(expression, this.dom.byId('cron-preview'), 'Pick at least one day.');
    }

}
