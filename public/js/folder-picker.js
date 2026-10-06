class FolderPicker
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.pickerCallback = false;
        this.pickerData = false;
    }

    setup()
    {
        this.dom.byId('picker-close').addEventListener('click', () => {
            this.dom.byId('picker').close();
        });
        this.dom.byId('picker-roots').addEventListener('click', () => {
            this.navigatePicker('');
        });
        this.dom.byId('picker-up').addEventListener('click', () => {
            this.navigatePicker(this.pickerData ? this.pickerData.parent : '');
        });
        this.dom.byId('picker-go').addEventListener('click', () => {
            this.navigatePicker(this.dom.byId('picker-path').value);
        });
        this.dom.byId('picker-path').addEventListener('keydown', (event) => {
            if('Enter' === event.key){
                event.preventDefault();
                this.navigatePicker(this.dom.byId('picker-path').value);
            }
        });
        this.dom.byId('picker-hidden').addEventListener('change', () => {
            this.renderPicker();
        });
        this.dom.byId('picker-new').addEventListener('click', () => {
            this.createPickerFolder();
        });
        this.dom.byId('picker-select').addEventListener('click', () => {
            if(!this.pickerData || this.pickerData.isRoots || !this.pickerCallback){
                return;
            }
            this.pickerCallback(this.pickerData.path);
            this.dom.byId('picker').close();
        });
    }

    async openPicker(startPath, callback)
    {
        this.pickerCallback = callback;
        this.dom.byId('picker-new-name').value = '';
        this.dom.byId('picker').showModal();
        let opened = await this.navigatePicker(String(startPath || '').trim());
        if(!opened){
            await this.navigatePicker('');
        }
    }

    async navigatePicker(folderPath)
    {
        let errorBox = this.dom.byId('picker-error');
        let data;
        try{
            data = await this.api.request('/api/browse?path='+encodeURIComponent(folderPath || ''));
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return false;
        }
        errorBox.hidden = true;
        this.pickerData = data;
        this.renderPicker();
        return true;
    }

    renderPicker()
    {
        let data = this.pickerData;
        if(!data){
            return;
        }
        let showHidden = this.dom.byId('picker-hidden').checked;
        this.dom.byId('picker-path').value = data.path;
        this.dom.byId('picker-up').disabled = data.isRoots;
        let selectButton = this.dom.byId('picker-select');
        selectButton.disabled = data.isRoots;
        selectButton.textContent = data.isRoots ? 'Open a drive or folder first' : 'Select '+data.path;
        this.dom.byId('picker-new').disabled = data.isRoots;
        this.dom.byId('picker-new-name').disabled = data.isRoots;
        let items = [];
        for(let folder of data.folders){
            if(!showHidden && (folder.hidden || folder.system)){
                continue;
            }
            items.push(this.dom.h('button', {
                type: 'button',
                text: (data.isRoots ? '' : '▸ ')+folder.name,
                onclick: () => {
                    this.navigatePicker(folder.path);
                }
            }));
        }
        if(0 === items.length){
            items.push(this.dom.h('div', {class: 'empty muted', text: 'No sub-folders here.'}));
        }
        this.dom.byId('picker-list').replaceChildren(...items);
        this.dom.byId('picker-list').scrollTop = 0;
    }

    async createPickerFolder()
    {
        if(!this.pickerData || this.pickerData.isRoots){
            return;
        }
        let errorBox = this.dom.byId('picker-error');
        let result;
        try{
            result = await this.api.request('/api/folders', {
                parent: this.pickerData.path,
                name: this.dom.byId('picker-new-name').value
            });
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return;
        }
        this.dom.byId('picker-new-name').value = '';
        await this.navigatePicker(result.path);
    }

}
