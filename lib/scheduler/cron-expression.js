/**
 * Cron Expression
 *
 * Parses standard 5-field cron expressions: minute hour day-of-month month day-of-week.
 * Supports "*", numbers, ranges (1-5), steps (*\/15, 1-30/5, 5/10), lists (1,15,30), month and weekday names
 * (JAN-DEC, SUN-SAT), 7 as Sunday, and the @hourly, @daily, @midnight, @weekly, @monthly, @yearly and @annually macros.
 * Like standard cron, when both day-of-month and day-of-week are restricted, a day matches if either of them matches.
 * Times are local times. No dependencies, so the scheduler only needs Node.js.
 */

class CronExpression
{

    constructor(expression)
    {
        this.expression = String(expression || '').trim();
        this.error = '';
        this.fields = false;
        this.isDayOfMonthRestricted = false;
        this.isDayOfWeekRestricted = false;
        this.maxSearchSteps = 200000;
        this.macros = {
            '@yearly': '0 0 1 1 *',
            '@annually': '0 0 1 1 *',
            '@monthly': '0 0 1 * *',
            '@weekly': '0 0 * * 0',
            '@daily': '0 0 * * *',
            '@midnight': '0 0 * * *',
            '@hourly': '0 * * * *'
        };
        this.fieldRanges = [
            {label: 'minute', min: 0, max: 59},
            {label: 'hour', min: 0, max: 23},
            {label: 'day of month', min: 1, max: 31},
            {label: 'month', min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']},
            {label: 'day of week', min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']}
        ];
        this.parse();
    }

    isValid()
    {
        return '' === this.error;
    }

    parse()
    {
        if('' === this.expression){
            this.error = 'The cron expression is empty.';
            return;
        }
        let source = this.macros[this.expression.toLowerCase()] || this.expression;
        let parts = source.split(/\s+/);
        if(5 !== parts.length){
            this.error = 'A cron expression needs 5 fields: minute, hour, day of month, month and day of week (like "0 3 * * *").';
            return;
        }
        let fields = [];
        for(let i = 0; i < parts.length; i++){
            let values = this.parseField(parts[i], this.fieldRanges[i]);
            if(false === values){
                return;
            }
            fields.push(values);
        }
        // 7 and 0 are both Sunday:
        if(fields[4].has(7)){
            fields[4].delete(7);
            fields[4].add(0);
        }
        this.isDayOfMonthRestricted = '*' !== parts[2].charAt(0);
        this.isDayOfWeekRestricted = '*' !== parts[4].charAt(0);
        this.fields = fields;
        this.parts = parts;
    }

    parseField(text, range)
    {
        let values = new Set();
        for(let item of text.split(',')){
            let stepParts = item.split('/');
            if('' === item || 2 < stepParts.length){
                return this.fail('Invalid '+range.label+' value "'+item+'".');
            }
            let step = 1;
            if(2 === stepParts.length){
                if(!/^\d+$/.test(stepParts[1]) || 1 > Number(stepParts[1])){
                    return this.fail('Invalid step "'+stepParts[1]+'" in the '+range.label+' field.');
                }
                step = Number(stepParts[1]);
            }
            let start = range.min;
            let end = range.max;
            if('*' !== stepParts[0]){
                let rangeParts = stepParts[0].split('-');
                if(2 < rangeParts.length){
                    return this.fail('Invalid '+range.label+' range "'+stepParts[0]+'".');
                }
                start = this.parseValue(rangeParts[0], range);
                if(false === start){
                    return false;
                }
                end = 2 === rangeParts.length ? this.parseValue(rangeParts[1], range) : (2 === stepParts.length ? range.max : start);
                if(false === end){
                    return false;
                }
                if(start > end){
                    return this.fail('The '+range.label+' range "'+stepParts[0]+'" goes backwards.');
                }
            }
            for(let value = start; value <= end; value += step){
                values.add(value);
            }
        }
        return values;
    }

    parseValue(text, range)
    {
        let upper = String(text).toUpperCase();
        if(range.names && -1 !== range.names.indexOf(upper)){
            return range.names.indexOf(upper)+(1 === range.min ? 1 : 0);
        }
        if(!/^\d+$/.test(upper)){
            return this.fail('Invalid '+range.label+' value "'+text+'".');
        }
        let value = Number(upper);
        if(value < range.min || value > range.max){
            return this.fail('The '+range.label+' must be between '+range.min+' and '+range.max+', not '+value+'.');
        }
        return value;
    }

    fail(message)
    {
        this.error = message;
        return false;
    }

    isDayMatch(date)
    {
        let dayOfMonthMatches = this.fields[2].has(date.getDate());
        let dayOfWeekMatches = this.fields[4].has(date.getDay());
        if(this.isDayOfMonthRestricted && this.isDayOfWeekRestricted){
            return dayOfMonthMatches || dayOfWeekMatches;
        }
        if(this.isDayOfMonthRestricted){
            return dayOfMonthMatches;
        }
        if(this.isDayOfWeekRestricted){
            return dayOfWeekMatches;
        }
        return true;
    }

    matches(date)
    {
        if(!this.fields){
            return false;
        }
        return this.fields[0].has(date.getMinutes())
            && this.fields[1].has(date.getHours())
            && this.fields[3].has(date.getMonth()+1)
            && this.isDayMatch(date);
    }

    next(fromDate)
    {
        if(!this.fields){
            return null;
        }
        let date = new Date(fromDate || Date.now());
        date.setSeconds(0, 0);
        date.setMinutes(date.getMinutes()+1);
        for(let step = 0; step < this.maxSearchSteps; step++){
            if(!this.fields[3].has(date.getMonth()+1)){
                date.setMonth(date.getMonth()+1, 1);
                date.setHours(0, 0, 0, 0);
                continue;
            }
            if(!this.isDayMatch(date)){
                date.setDate(date.getDate()+1);
                date.setHours(0, 0, 0, 0);
                continue;
            }
            if(!this.fields[1].has(date.getHours())){
                date.setHours(date.getHours()+1, 0, 0, 0);
                continue;
            }
            if(!this.fields[0].has(date.getMinutes())){
                date.setMinutes(date.getMinutes()+1, 0, 0);
                continue;
            }
            return date;
        }
        // for example "0 0 30 2 *" (February 30th) never happens:
        return null;
    }

    nextRuns(fromDate, count)
    {
        let runs = [];
        let from = fromDate || new Date();
        for(let i = 0; i < count; i++){
            let next = this.next(from);
            if(!next){
                break;
            }
            runs.push(next);
            from = next;
        }
        return runs;
    }

    describe()
    {
        if(!this.fields){
            return '';
        }
        let [minute, hour, dayOfMonth, month, dayOfWeek] = this.parts;
        let isNumber = (value) => {
            return /^\d+$/.test(value);
        };
        let time = isNumber(minute) && isNumber(hour) ? String(hour).padStart(2, '0')+':'+String(minute).padStart(2, '0') : '';
        let isEveryDay = '*' === dayOfMonth && '*' === month && '*' === dayOfWeek;
        if('*' === minute && '*' === hour && isEveryDay){
            return 'Every minute';
        }
        let minuteStep = /^\*\/(\d+)$/.exec(minute);
        if(minuteStep && '*' === hour && isEveryDay){
            return 'Every '+minuteStep[1]+' minutes';
        }
        if(isNumber(minute) && '*' === hour && isEveryDay){
            return 'Every hour at minute '+minute;
        }
        let hourStep = /^\*\/(\d+)$/.exec(hour);
        if(isNumber(minute) && hourStep && isEveryDay){
            return 'Every '+hourStep[1]+' hours at minute '+minute;
        }
        if('' !== time && isEveryDay){
            return 'Every day at '+time;
        }
        if('' !== time && '*' === dayOfMonth && '*' === month){
            let names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let days = Array.from(this.fields[4]).sort().map((day) => {
                return names[day];
            });
            return 'Every '+days.join(', ')+' at '+time;
        }
        if('' !== time && isNumber(dayOfMonth) && '*' === month && '*' === dayOfWeek){
            return 'Every month on day '+dayOfMonth+' at '+time;
        }
        return 'Custom schedule: '+this.expression;
    }

}

module.exports.CronExpression = CronExpression;
