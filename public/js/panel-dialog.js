class PanelDialog
{

    constructor(props)
    {
        this.dom = props.dom;
    }

    setup()
    {
        this.dom.byId('dialog-close').addEventListener('click', () => {
            this.dom.byId('dialog').close();
        });
        this.dom.byId('dialog').addEventListener('click', (event) => {
            // a click outside a form must not throw the changes away:
            if(event.target === this.dom.byId('dialog') && 'form' !== this.dom.byId('dialog').dataset.mode){
                this.dom.byId('dialog').close();
            }
        });
    }

    openDialog(title, children)
    {
        this.dom.byId('dialog-title').textContent = title;
        this.dom.byId('dialog-body').replaceChildren(...children);
        let dialog = this.dom.byId('dialog');
        if(!dialog.open){
            dialog.showModal();
        }
    }

}
