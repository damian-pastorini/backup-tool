/**
 * Script Arguments
 *
 * Reads the command line options of run-inspect-folders.js and run-sync.js. parse() returns {error} for the first
 * invalid option. No dependencies.
 */

const { ModifiedTimeThreshold } = require('../common/modified-time-threshold');

class ScriptArguments
{

    constructor(props)
    {
        this.args = props.args;
        this.modifiedTimeThreshold = new ModifiedTimeThreshold();
    }

    parse()
    {
        let thresholdPrefix = '--modified-time-threshold=';
        let thresholdArg = this.find(thresholdPrefix);
        let modifiedTimeThresholdMs = null;
        if('' !== thresholdArg){
            modifiedTimeThresholdMs = this.modifiedTimeThreshold.parse(thresholdArg.substring(thresholdPrefix.length));
            if(false === modifiedTimeThresholdMs){
                return {error: 'Invalid '+thresholdArg+', use milliseconds (2000) or seconds (2s).'};
            }
        }
        let selectedMappings = this.parseMappingSelection();
        if(false === selectedMappings){
            return {
                error: 'Invalid '+this.find('--mapping=')
                    +', use mapping numbers starting at 1, like --mapping=2 or --mapping=1,3.'
            };
        }
        return {
            dryRun: this.has('--dry-run'),
            allowRemove: this.has('--allow-remove'),
            withHash: this.has('--with-hash'),
            modifiedTimeThresholdMs: modifiedTimeThresholdMs,
            selectedMappings: selectedMappings,
            triggeredBy: this.text('--triggered-by='),
            configFile: this.configFile()
        };
    }

    has(flag)
    {
        return -1 !== this.args.indexOf(flag);
    }

    find(prefix)
    {
        for(let arg of this.args){
            if(arg.startsWith(prefix)){
                return arg;
            }
        }
        return '';
    }

    text(prefix)
    {
        let arg = this.find(prefix);
        if('' === arg){
            return '';
        }
        return arg.substring(prefix.length).trim();
    }

    parseMappingSelection()
    {
        let prefix = '--mapping=';
        let arg = this.find(prefix);
        if('' === arg){
            return [];
        }
        let numbers = arg.substring(prefix.length).split(',').map((value) => {
            return Number(value.trim());
        });
        for(let number of numbers){
            if(!Number.isInteger(number) || 1 > number){
                return false;
            }
        }
        return numbers;
    }

    configFile()
    {
        for(let arg of this.args){
            if(arg.startsWith('--config-files=')){
                return {name: arg.substring(15), isFileList: true};
            }
            if(arg.startsWith('--config=')){
                return {name: arg.substring(9), isFileList: false};
            }
        }
        return false;
    }

}

module.exports.ScriptArguments = ScriptArguments;
