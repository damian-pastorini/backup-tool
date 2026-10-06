/**
 * API Routes
 *
 * The web panel's HTTP API: status, jobs, logs and configs, the mappings and settings editor, the cron preview and
 * the folder picker.
 */

const { CronExpression } = require('../scheduler/cron-expression');

class ApiRoutes
{

    constructor(props)
    {
        this.projectFiles = props.projectFiles;
        this.mappingsConfig = props.mappingsConfig;
        this.folderBrowser = props.folderBrowser;
        this.jobRunner = props.jobRunner;
        this.panelJobs = props.panelJobs;
        this.panelStatus = props.panelStatus;
        this.onShutdown = props.onShutdown;
    }

    register(app)
    {
        this.registerFileRoutes(app);
        this.registerJobRoutes(app);
        this.registerConfigRoutes(app);
        this.registerToolRoutes(app);
    }

    registerFileRoutes(app)
    {
        app.get('/api/status', (req, res) => {
            return res.json(this.panelStatus.fetch());
        });
        app.get('/api/configs/:name', (req, res) => {
            if(!this.projectFiles.isConfigName(req.params.name)){
                return res.status(404).json({error: 'Unknown config.'});
            }
            let details = this.projectFiles.fetchConfigDetails(req.params.name);
            if(!details){
                return res.status(404).json({error: 'Config not found.'});
            }
            return res.json(details);
        });
        app.get('/api/logs/:name', (req, res) => {
            if(!this.projectFiles.isLogName(req.params.name)){
                return res.status(404).json({error: 'Unknown log.'});
            }
            let details = this.projectFiles.fetchLogDetails(req.params.name);
            if(!details){
                return res.status(404).json({error: 'Log not found.'});
            }
            return res.json(details);
        });
        app.get('/raw/logs/:name', (req, res) => {
            if(!this.projectFiles.isLogName(req.params.name)){
                return res.status(404).send('Unknown log.');
            }
            return res.type('text/plain').sendFile(this.projectFiles.logPath(req.params.name));
        });
        app.get('/raw/configs/:name', (req, res) => {
            if(!this.projectFiles.isConfigName(req.params.name)){
                return res.status(404).send('Unknown config.');
            }
            return res.type('text/plain').sendFile(this.projectFiles.configPath(req.params.name));
        });
    }

    registerJobRoutes(app)
    {
        app.get('/api/job', (req, res) => {
            return res.json({job: this.jobRunner.serialize(req.query.from)});
        });
        app.post('/api/run', (req, res) => {
            return this.sendResult(res, this.panelJobs.run(req.body || {}));
        });
        app.post('/api/stop', (req, res) => {
            return res.json({stopping: this.jobRunner.stop()});
        });
        // used by the tray's Exit: stops everything cleanly, only from this machine
        app.post('/api/shutdown', (req, res) => {
            if(!this.isLocalRequest(req)){
                return res.status(403).json({error: 'Only allowed from this machine.'});
            }
            res.json({stopping: true});
            setTimeout(() => {
                this.onShutdown();
            }, 100);
        });
    }

    registerConfigRoutes(app)
    {
        app.post('/api/mappings', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.add(req.body || {}));
        });
        app.put('/api/mappings/:index', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.update(Number(req.params.index), body.expectedFrom, body.mapping || {}));
        });
        app.delete('/api/mappings/:index', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.remove(Number(req.params.index), String(req.query.from || '')));
        });
        app.put('/api/mappings/:index/enabled', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.setEnabled(Number(req.params.index), body.expectedFrom, body.enabled));
        });
        app.put('/api/settings', (req, res) => {
            return this.sendResult(res, this.mappingsConfig.updateSettings(req.body || {}));
        });
        app.put('/api/mappings/:index/schedule', (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, this.mappingsConfig.setScheduleEnabled(Number(req.params.index), body.expectedFrom, body.enabled));
        });
    }

    registerToolRoutes(app)
    {
        app.get('/api/cron', (req, res) => {
            let expression = new CronExpression(String(req.query.expression || ''));
            if(!expression.isValid()){
                return res.json({valid: false, error: expression.error});
            }
            let nextRuns = expression.nextRuns(new Date(), 3).map((date) => {
                return date.toISOString();
            });
            return res.json({valid: true, description: expression.describe(), nextRuns: nextRuns});
        });
        app.get('/api/browse', async (req, res) => {
            return this.sendResult(res, await this.folderBrowser.list(req.query.path || ''));
        });
        app.post('/api/folders', async (req, res) => {
            let body = req.body || {};
            return this.sendResult(res, await this.folderBrowser.createFolder(body.parent, body.name));
        });
    }

    sendResult(res, result)
    {
        if(result.error){
            return res.status(400).json(result);
        }
        return res.json(result);
    }

    isLocalRequest(req)
    {
        let address = String(req.socket.remoteAddress || '');
        return '127.0.0.1' === address || '::1' === address || '::ffff:127.0.0.1' === address;
    }

}

module.exports.ApiRoutes = ApiRoutes;
