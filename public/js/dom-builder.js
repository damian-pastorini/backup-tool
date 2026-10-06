class DomBuilder
{

    byId(id)
    {
        return document.getElementById(id);
    }

    h(tag, attributes, children)
    {
        let element = document.createElement(tag);
        for(let key of Object.keys(attributes || {})){
            let value = attributes[key];
            if(false === value || null === value || undefined === value){
                continue;
            }
            if(key.startsWith('on') && 'function' === typeof value){
                element.addEventListener(key.substring(2), value);
                continue;
            }
            if('text' === key){
                element.textContent = value;
                continue;
            }
            element.setAttribute(key, true === value ? '' : value);
        }
        for(let child of [].concat(undefined === children ? [] : children)){
            if(null === child || undefined === child || false === child || '' === child){
                continue;
            }
            element.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        return element;
    }

    pill(text, type)
    {
        return this.h('span', {class: 'pill '+(type || 'muted'), text: text});
    }

}
