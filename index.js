/**
 * Backup Tool - web panel and scheduled backups, in one process
 *
 * USAGE:
 * - node . (or: npm start), keep it running: the scheduled backups run inside this process
 * - Open http://localhost:9977
 * - node . --open: also opens the panel in the default browser.
 *   If the panel is already running, it only opens the browser.
 * - node . --log-console: also writes the console output to logs/console-YYYYMMDD.log (used by the tray, which runs
 *   it without a console window, see scripts/tray.ps1).
 * - Optional environment variables: BACKUP_TOOL_PORT (default 9977), BACKUP_TOOL_HOST (default 127.0.0.1)
 */

const path = require('path');
const { BackupToolServer } = require('./lib/server/backup-tool-server');
const { ConsoleFileLog } = require('./lib/server/console-file-log');

process.title = 'Backup Tool';

if(-1 !== process.argv.indexOf('--log-console')){
    new ConsoleFileLog({logsPath: path.join(__dirname, 'logs')}).start();
}

let server = new BackupToolServer({
    rootPath: __dirname,
    port: process.env.BACKUP_TOOL_PORT,
    host: process.env.BACKUP_TOOL_HOST,
    openOnStart: -1 !== process.argv.indexOf('--open')
});

server.start().then((started) => {
    if(!started){
        process.exit(1);
    }
}).catch((error) => {
    console.error('Fatal: '+error.message);
    process.exit(1);
});
