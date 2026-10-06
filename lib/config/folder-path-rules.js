/**
 * Folder Path Rules
 *
 * Normalizes and validates the source and destination folders of a mapping: full Windows paths, without the
 * characters Windows does not allow.
 */

const path = require('path');

class FolderPathRules
{

    constructor()
    {
        this.invalidNamePattern = /[<>:"|?*]/;
    }

    normalize(value)
    {
        let trimmed = String(value || '').trim();
        if('' === trimmed){
            return '';
        }
        let normalized = path.normalize(trimmed);
        // keep "D:\" and "\\server\share" roots, drop any other trailing separator:
        while(3 < normalized.length && /[\\/]$/.test(normalized) && path.parse(normalized).root !== normalized){
            normalized = normalized.substring(0, normalized.length-1);
        }
        return normalized;
    }

    validate(value, label)
    {
        if('' === value){
            return label+' is required.';
        }
        if(!path.isAbsolute(value) || /^[a-zA-Z]:[^\\/]/.test(value)){
            return label+' must be a full path, like D:\\folder or \\\\server\\share: '+value;
        }
        let withoutDrive = value.replace(/^[a-zA-Z]:/, '');
        if(this.invalidNamePattern.test(withoutDrive)){
            return label+' contains characters Windows does not allow (< > : " | ? *): '+value;
        }
        return '';
    }

    isSameOrInside(childPath, parentPath)
    {
        let relative = path.relative(parentPath, childPath);
        if('' === relative){
            return true;
        }
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    contains(list, value)
    {
        for(let item of list){
            if('' === path.relative(item, value)){
                return true;
            }
        }
        return false;
    }

}

module.exports.FolderPathRules = FolderPathRules;
