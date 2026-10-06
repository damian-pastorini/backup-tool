class PageMessages
{

    constructor(props)
    {
        this.dom = props.dom;
    }

    showError(message)
    {
        let banner = this.dom.byId('error');
        banner.textContent = message;
        banner.hidden = false;
    }

    hideError()
    {
        this.dom.byId('error').hidden = true;
    }

    showMappingsNotice(message, type)
    {
        let notice = this.dom.byId('mappings-notice');
        notice.className = 'notice '+(type || '');
        notice.textContent = message;
        notice.hidden = !message;
    }

}
