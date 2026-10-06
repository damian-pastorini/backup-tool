/**
 * File Filters
 *
 * Decides which files of a mapping are backed up: the mapping filters (hidden and system names, excluded names,
 * extensions, maximum size), and Google Drive shortcuts, which are never copied. No dependencies.
 */

const path = require('path');

class FileFilters
{

    isGoogleDriveShortcut(filePath)
    {
        let ext = path.extname(filePath).toLowerCase();
        return '.gsheet' === ext || '.gmap' === ext || '.gdoc' === ext || '.gslides' === ext || '.gform' === ext;
    }

    pathSegments(rel)
    {
        if('' === rel){
            return [];
        }
        return rel.split('/').filter((x) => { return '' !== x; });
    }

    isHiddenName(name)
    {
        if(0 === name.length){
            return false;
        }
        if('.' === name[0]){
            return true;
        }
        return false;
    }

    isSystemName(name)
    {
        let lower = name.toLowerCase();
        if('system volume information' === lower){
            return true;
        }
        if('$recycle.bin' === lower){
            return true;
        }
        if('desktop.ini' === lower){
            return true;
        }
        if('thumbs.db' === lower){
            return true;
        }
        return false;
    }

    extOf(rel)
    {
        let b = path.basename(rel);
        let idx = b.lastIndexOf('.');
        if(-1 === idx){
            return '';
        }
        return b.substring(idx).toLowerCase();
    }

    matches(rel, st, opts)
    {
        if(!opts){
            return true;
        }
        let segs = this.pathSegments(rel);
        if(opts.excludeHidden){
            for(let s of segs){
                if(this.isHiddenName(s)){
                    return false;
                }
            }
        }
        if(opts.excludeSystem){
            for(let s of segs){
                if(this.isSystemName(s)){
                    return false;
                }
            }
        }
        let exNames = opts.excludeNames || [];
        if(0 < exNames.length){
            for(let s of segs){
                if(-1 !== exNames.indexOf(s)){
                    return false;
                }
            }
        }
        let includeExt = opts.includeExtensions || [];
        if(0 < includeExt.length){
            let e = this.extOf(rel);
            if(-1 === includeExt.indexOf(e)){
                return false;
            }
        }
        let excludeExt = opts.excludeExtensions || [];
        if(0 < excludeExt.length){
            let e2 = this.extOf(rel);
            if(-1 !== excludeExt.indexOf(e2)){
                return false;
            }
        }
        if(opts.maxSizeBytes && 0 < opts.maxSizeBytes){
            if(st && st.size && opts.maxSizeBytes < st.size){
                return false;
            }
        }
        return true;
    }

}

module.exports.FileFilters = FileFilters;
