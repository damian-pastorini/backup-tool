class DisplayFormatter
{

    parseLocalDate(value)
    {
        let match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
        if(!match){
            return false;
        }
        return new Date(
            Number(match[1]),
            Number(match[2])-1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6])
        );
    }

    daysSince(value)
    {
        let date = this.parseLocalDate(value);
        if(!date){
            return 0;
        }
        return (Date.now()-date.getTime())/86400000;
    }

    ago(value)
    {
        let date = this.parseLocalDate(value);
        if(!date){
            return '';
        }
        let seconds = Math.round((Date.now()-date.getTime())/1000);
        if(seconds < 60){
            return 'just now';
        }
        let minutes = Math.round(seconds/60);
        if(minutes < 60){
            return minutes+' min ago';
        }
        let hours = Math.round(minutes/60);
        if(hours < 24){
            return hours+(1 === hours ? ' hour ago' : ' hours ago');
        }
        let days = Math.round(hours/24);
        if(days < 60){
            return days+(1 === days ? ' day ago' : ' days ago');
        }
        let months = Math.round(days/30.4);
        if(months < 24){
            return months+' months ago';
        }
        return Math.round(days/365)+' years ago';
    }

    number(value)
    {
        return Number(value || 0).toLocaleString();
    }

    plural(count, singular, pluralWord)
    {
        return this.number(count)+' '+(1 === count ? singular : pluralWord);
    }

    formatDateTime(isoDate)
    {
        let date = new Date(isoDate);
        return date.toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'})+' '
            +date.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
    }

}
