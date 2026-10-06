/**
 * Browser Opener
 *
 * Opens a URL in the default browser (Windows, macOS and Linux).
 */

const { spawn } = require('child_process');

class BrowserOpener
{

    open(url)
    {
        let command = 'xdg-open';
        let args = [url];
        if('win32' === process.platform){
            // the empty argument is the window title that "start" expects before the URL:
            command = 'cmd';
            args = ['/c', 'start', '', url];
        }
        if('darwin' === process.platform){
            command = 'open';
        }
        let child = spawn(command, args, {detached: true, stdio: 'ignore', windowsHide: true});
        child.on('error', (error) => {
            console.log('Could not open the browser ('+error.message+'), open '+url+' manually.');
        });
        child.unref();
    }

}

module.exports.BrowserOpener = BrowserOpener;
