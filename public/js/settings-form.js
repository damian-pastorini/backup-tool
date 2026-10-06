class SettingsForm
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.panelStatus = props.panelStatus;
        this.messages = props.messages;
        this.cronPreview = props.cronPreview;
        this.cronBuilder = props.cronBuilder;
        this.refresh = props.refresh;
        this.isSettingsDirty = false;
        this.isSettingsWatched = false;
    }

    setup()
    {
        this.dom.byId('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        this.dom.byId('setting-schedule-edit').addEventListener('click', () => {
            let input = this.dom.byId('setting-schedule-cron');
            this.cronBuilder.openCronBuilder(input.value, (expression) => {
                input.value = expression;
                this.cronPreview.previewCron(input.value, this.dom.byId('setting-schedule-preview'));
            });
        });
        this.dom.byId('setting-schedule-cron').addEventListener('input', () => {
            this.cronPreview.previewCron(
                this.dom.byId('setting-schedule-cron').value,
                this.dom.byId('setting-schedule-preview')
            );
        });
    }

    renderSettings()
    {
        let settings = this.panelStatus.data.settings;
        if(!settings || this.isSettingsDirty){
            // unsaved changes in the settings block are kept until they are saved
            return;
        }
        let thresholdInput = this.dom.byId('setting-threshold');
        thresholdInput.value = String(settings.modifiedTimeThresholdMs/1000);
        thresholdInput.title = settings.isDefaultThreshold ? 'Default value, not saved in the config yet' : '';
        this.dom.byId('setting-schedule-enabled').checked = settings.schedule.enabled;
        this.dom.byId('setting-schedule-cron').value = settings.schedule.cron;
        this.dom.byId('setting-logs-remove').checked = settings.logs.removeOldLogs;
        this.dom.byId('setting-logs-days').value = String(settings.logs.keepDays);
        this.cronPreview.previewCron(settings.schedule.cron, this.dom.byId('setting-schedule-preview'));
        if(!this.isSettingsWatched){
            this.isSettingsWatched = true;
            let ids = [
                'setting-threshold',
                'setting-schedule-enabled',
                'setting-schedule-cron',
                'setting-logs-remove',
                'setting-logs-days'
            ];
            for(let id of ids){
                this.dom.byId(id).addEventListener('input', () => {
                    this.isSettingsDirty = true;
                });
            }
        }
    }

    async saveSettings()
    {
        let seconds = Number(this.dom.byId('setting-threshold').value);
        let settings = {
            modifiedTimeThresholdMs: Math.round(seconds*1000),
            schedule: {
                enabled: this.dom.byId('setting-schedule-enabled').checked,
                cron: this.dom.byId('setting-schedule-cron').value
            },
            logs: {
                removeOldLogs: this.dom.byId('setting-logs-remove').checked,
                keepDays: Number(this.dom.byId('setting-logs-days').value)
            }
        };
        try{
            await this.api.request('/api/settings', settings, 'PUT');
        }catch(error){
            this.messages.showMappingsNotice(error.message, 'warn');
            return;
        }
        this.isSettingsDirty = false;
        this.messages.showMappingsNotice(
            'Settings saved. The next inspections, syncs and the scheduler (within a minute) use them.',
            'ok'
        );
        await this.refresh();
    }

}
