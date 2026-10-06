/**
 * Log Lines
 *
 * Builds the text of the inspection and sync logs: header lines and "--- TITLE (count) ---" sections.
 * No dependencies.
 */

class LogLines
{

    constructor()
    {
        this.lines = [];
    }

    push(line)
    {
        this.lines.push(line);
    }

    pushSection(title, items, formatItem)
    {
        if(0 === items.length){
            return;
        }
        this.lines.push('--- '+title+' ('+items.length.toString()+') ---');
        for(let item of items){
            this.lines.push(formatItem(item));
        }
        this.lines.push('');
    }

    pushHashErrors(hashErrors)
    {
        this.pushSection('HASH ERRORS', hashErrors, (err) => {
            let msg = 'file='+err.file+' | reason='+err.reason;
            if(err.size){
                msg = msg+' | size='+err.size.toString();
            }
            return msg;
        });
    }

    text()
    {
        return this.lines.join('\n');
    }

}

module.exports.LogLines = LogLines;
