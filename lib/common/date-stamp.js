/**
 * Date Stamp
 *
 * Local date and time formats used in log names, generated config names and log lines. No dependencies.
 */

class DateStamp
{

    pad2(value)
    {
        return (10 > value ? '0' : '')+value;
    }

    day(date)
    {
        return date.getFullYear().toString()+this.pad2(date.getMonth()+1)+this.pad2(date.getDate());
    }

    compact(date)
    {
        return this.day(date)+'-'+this.pad2(date.getHours())+this.pad2(date.getMinutes())+this.pad2(date.getSeconds());
    }

    dashed(date)
    {
        return date.getFullYear().toString()+'-'+this.pad2(date.getMonth()+1)+'-'+this.pad2(date.getDate())
            +'-'+this.pad2(date.getHours())+'-'+this.pad2(date.getMinutes())+'-'+this.pad2(date.getSeconds());
    }

    readable(date)
    {
        return date.getFullYear().toString()+'-'+this.pad2(date.getMonth()+1)+'-'+this.pad2(date.getDate())
            +' '+this.pad2(date.getHours())+':'+this.pad2(date.getMinutes())+':'+this.pad2(date.getSeconds());
    }

}

module.exports.DateStamp = DateStamp;
