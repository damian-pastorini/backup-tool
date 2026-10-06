/**
 * Backup Tool - web panel
 *
 * USAGE:
 * - node . (or: npm start)
 * - Open http://localhost:9977
 * - node . --open: also opens the panel in the default browser (used by the desktop shortcut).
 *   If the panel is already running, it only opens the browser.
 * - Optional environment variables: BACKUP_TOOL_PORT (default 9977), BACKUP_TOOL_HOST (default 127.0.0.1)
 */

const { BackupToolServer } = require('./lib/backup-tool-server');

process.title = 'Backup Tool';

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
