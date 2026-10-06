/**
 * Backup Tool - web panel client
 */

class BackupToolClient
{

    constructor()
    {
        this.dom = new DomBuilder();
        this.api = new ApiClient();
        this.formatter = new DisplayFormatter();
        this.panelStatus = new PanelStatus();
        this.messages = new PageMessages({dom: this.dom});
        this.confirmation = new ClickConfirmation();
        this.logSummary = new LogSummary({dom: this.dom, formatter: this.formatter});
        this.cronPreview = new CronPreview({api: this.api, formatter: this.formatter});
        this.panelDialog = new PanelDialog({dom: this.dom});
        this.cronBuilder = new CronBuilder({dom: this.dom, api: this.api, cronPreview: this.cronPreview});
        this.folderPicker = new FolderPicker({dom: this.dom, api: this.api});
        let callbacks = this.createCallbacks();
        this.createDetailViews(callbacks);
        this.createPanelViews(callbacks);
    }

    createCallbacks()
    {
        return {
            startJob: (params) => {
                return this.jobMonitor.startJob(params);
            },
            openLog: (name) => {
                return this.logDetails.openLog(name);
            },
            openConfig: (name) => {
                return this.configDetails.openConfig(name);
            },
            refresh: () => {
                return this.refresh();
            }
        };
    }

    createDetailViews(callbacks)
    {
        this.logDetails = new LogDetails({
            dom: this.dom,
            api: this.api,
            formatter: this.formatter,
            logSummary: this.logSummary,
            panelDialog: this.panelDialog
        });
        this.configDetails = new ConfigDetails({
            dom: this.dom,
            api: this.api,
            formatter: this.formatter,
            panelDialog: this.panelDialog,
            confirmation: this.confirmation,
            startJob: callbacks.startJob
        });
        this.jobMonitor = new JobMonitor({
            dom: this.dom,
            api: this.api,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            messages: this.messages,
            openLog: callbacks.openLog,
            openConfig: callbacks.openConfig,
            refresh: callbacks.refresh,
            updateSyncForm: () => {
                this.runForm.updateSyncForm();
            }
        });
    }

    createPanelViews(callbacks)
    {
        this.statusCards = new StatusCards({
            dom: this.dom,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            logSummary: this.logSummary,
            confirmation: this.confirmation,
            openLog: callbacks.openLog,
            openConfig: callbacks.openConfig,
            startJob: callbacks.startJob
        });
        this.runForm = new RunForm({
            dom: this.dom,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            confirmation: this.confirmation,
            startJob: callbacks.startJob,
            openConfig: callbacks.openConfig
        });
        this.settingsForm = new SettingsForm({
            dom: this.dom,
            api: this.api,
            panelStatus: this.panelStatus,
            messages: this.messages,
            cronPreview: this.cronPreview,
            cronBuilder: this.cronBuilder,
            refresh: callbacks.refresh
        });
        this.createMappingViews(callbacks);
        this.logsTable = new LogsTable({
            dom: this.dom,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            logSummary: this.logSummary,
            openLog: callbacks.openLog
        });
        this.configsTable = new ConfigsTable({
            dom: this.dom,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            openConfig: callbacks.openConfig,
            useConfig: (name) => {
                this.runForm.useConfig(name);
            }
        });
    }

    createMappingViews(callbacks)
    {
        this.mappingEditor = new MappingEditor({
            dom: this.dom,
            api: this.api,
            panelStatus: this.panelStatus,
            messages: this.messages,
            panelDialog: this.panelDialog,
            cronPreview: this.cronPreview,
            cronBuilder: this.cronBuilder,
            folderPicker: this.folderPicker,
            refresh: callbacks.refresh
        });
        this.mappingsList = new MappingsList({
            dom: this.dom,
            api: this.api,
            formatter: this.formatter,
            panelStatus: this.panelStatus,
            messages: this.messages,
            confirmation: this.confirmation,
            startJob: callbacks.startJob,
            openMappingEditor: (index) => {
                this.mappingEditor.openMappingEditor(index);
            },
            refresh: callbacks.refresh
        });
    }

    init()
    {
        this.dom.byId('refresh').addEventListener('click', () => {
            this.refresh();
        });
        this.runForm.setup();
        this.jobMonitor.setup();
        this.panelDialog.setup();
        this.mappingEditor.setup();
        this.settingsForm.setup();
        this.folderPicker.setup();
        this.cronBuilder.setup();
        document.addEventListener('visibilitychange', () => {
            if('visible' === document.visibilityState){
                this.refresh();
            }
        });
        this.refresh();
    }

    async refresh()
    {
        try{
            this.panelStatus.data = await this.api.request('/api/status');
        }catch(error){
            this.messages.showError('Could not load the status, is the server running? '+error.message);
            return;
        }
        this.messages.hideError();
        this.statusCards.renderCards();
        this.runForm.renderSyncConfigSelect();
        this.settingsForm.renderSettings();
        this.mappingsList.renderMappings();
        this.logsTable.renderLogs();
        this.configsTable.renderConfigs();
        this.dom.byId('footer').textContent = 'Project folder: '+this.panelStatus.data.rootPath
            +' - updated '+new Date().toLocaleTimeString();
        this.jobMonitor.handleStatusJob(this.panelStatus.data.job);
    }

}

let backupToolClient = new BackupToolClient();
backupToolClient.init();
