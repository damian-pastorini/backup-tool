/**
 * Mapping Selection
 *
 * Which mappings of a folder config a script runs: the ones given with --mapping (numbered from 1 in the config
 * order), or every mapping except the ones with "enabled: false". No dependencies.
 */

class MappingSelection
{

    constructor(props)
    {
        this.selectedNumbers = props.selectedNumbers;
    }

    isExplicit()
    {
        return 0 < this.selectedNumbers.length;
    }

    findMissing(mappings)
    {
        for(let number of this.selectedNumbers){
            if(mappings.length < number){
                return 'There is no mapping #'+number+', the config has '+mappings.length+' mappings.';
            }
        }
        return '';
    }

    isIncluded(index, mapping)
    {
        // an explicit --mapping selection runs those mappings even when they are disabled:
        if(this.isExplicit()){
            return -1 !== this.selectedNumbers.indexOf(index+1);
        }
        return false !== mapping.enabled;
    }

    describe(mappings)
    {
        if(this.isExplicit()){
            return 'selected #'+this.selectedNumbers.join(', #');
        }
        let enabledCount = mappings.filter((mapping) => {
            return false !== mapping.enabled;
        }).length;
        return 'all enabled ('+enabledCount+' of '+mappings.length+')';
    }

}

module.exports.MappingSelection = MappingSelection;
