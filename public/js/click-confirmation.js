class ClickConfirmation
{

    constructor()
    {
        this.confirmTimeoutMs = 5000;
    }

    confirmClick(button, message, callback)
    {
        if('1' === button.dataset.confirming){
            this.resetConfirm(button);
            callback();
            return;
        }
        button.dataset.confirming = '1';
        button.dataset.originalText = button.textContent;
        button.dataset.wasDanger = button.classList.contains('danger') ? '1' : '';
        // keep the current width, so the label change never moves or wraps the buttons next to it:
        button.style.minWidth = button.offsetWidth+'px';
        button.classList.add('danger');
        button.title = 'Click again to confirm, or wait to cancel';
        button.textContent = message;
        setTimeout(() => {
            if('1' === button.dataset.confirming){
                this.resetConfirm(button);
            }
        }, this.confirmTimeoutMs);
    }

    resetConfirm(button)
    {
        delete button.dataset.confirming;
        button.textContent = button.dataset.originalText || button.textContent;
        if('1' !== button.dataset.wasDanger){
            button.classList.remove('danger');
        }
        button.style.minWidth = '';
        button.removeAttribute('title');
    }

}
