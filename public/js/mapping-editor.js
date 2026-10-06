class MappingEditor
{

    constructor(props)
    {
        this.dom = props.dom;
        this.api = props.api;
        this.panelStatus = props.panelStatus;
        this.messages = props.messages;
        this.panelDialog = props.panelDialog;
        this.cronPreview = props.cronPreview;
        this.cronBuilder = props.cronBuilder;
        this.folderPicker = props.folderPicker;
        this.refresh = props.refresh;
        this.newMappingDefaults = {
            from: '',
            to: [{path: ''}],
            enabled: true,
            schedule: {enabled: false, cron: ''},
            includeExtensions: [],
            excludeExtensions: ['.tmp', '.log'],
            maxSizeBytes: 0,
            excludeHidden: true,
            excludeSystem: true,
            excludeNames: []
        };
    }

    setup()
    {
        this.dom.byId('add-mapping').addEventListener('click', () => {
            this.openMappingEditor(-1);
        });
    }

    openMappingEditor(index)
    {
        let isNew = 0 > index;
        let mapping = isNew ? this.newMappingDefaults : this.panelStatus.data.mappings[index];
        let destinationsList = this.dom.h('div', {});
        for(let destination of mapping.to){
            destinationsList.append(this.buildPathRow(destination.path, true));
        }
        let fromRow = this.buildPathRow(mapping.from, false);
        fromRow.querySelector('input').id = 'mapping-from';
        let errorBox = this.dom.h('div', {class: 'danger-text form-error', hidden: true});
        let form = this.dom.h('div', {class: 'dialog-body-inner'}, [
            this.dom.h('label', {class: 'field', for: 'mapping-from'}, this.dom.h('span', {text: 'Source folder'})),
            fromRow,
            this.dom.h('div', {class: 'field'}, [
                this.dom.h('span', {text: 'Destination folders'}),
                destinationsList,
                this.dom.h('div', {}, this.dom.h('button', {
                    type: 'button',
                    class: 'small',
                    text: 'Add destination',
                    onclick: () => {
                        destinationsList.append(this.buildPathRow('', true));
                    }
                }))
            ]),
            this.buildFilterFields(mapping),
            this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {type: 'checkbox', id: 'mapping-enabled', checked: false !== mapping.enabled}),
                'Enabled (disabled mappings are skipped by full inspections, syncs and schedules)'
            ]),
            this.buildScheduleFields(mapping.schedule || {enabled: false, cron: ''}),
            this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {type: 'checkbox', id: 'mapping-hidden', checked: mapping.excludeHidden}),
                'Skip hidden files and folders (names starting with ".")'
            ]),
            this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {type: 'checkbox', id: 'mapping-system', checked: mapping.excludeSystem}),
                'Skip Windows system files (System Volume Information, $RECYCLE.BIN, desktop.ini, Thumbs.db)'
            ]),
            errorBox,
            this.dom.h('div', {class: 'buttons'}, [
                this.dom.h('button', {
                    type: 'button',
                    class: 'primary',
                    text: isNew ? 'Add mapping' : 'Save changes',
                    onclick: () => {
                        this.saveMapping(index, isNew ? '' : mapping.from, destinationsList, errorBox);
                    }
                }),
                this.dom.h('button', {type: 'button', class: 'ghost', text: 'Cancel', onclick: () => {
                    this.dom.byId('dialog').close();
                }})
            ])
        ]);
        this.dom.byId('dialog').dataset.mode = 'form';
        this.panelDialog.openDialog(isNew ? 'Add mapping' : 'Edit mapping', [form]);
        this.dom.byId('dialog').addEventListener('close', () => {
            delete this.dom.byId('dialog').dataset.mode;
        }, {once: true});
    }

    buildFilterFields(mapping)
    {
        return this.dom.h('div', {class: 'form-grid'}, [
            this.buildTextField(
                'mapping-include',
                'Only these extensions (empty = all)',
                mapping.includeExtensions.join(', '),
                '.pdf, .jpg'
            ),
            this.buildTextField(
                'mapping-exclude',
                'Skip these extensions',
                mapping.excludeExtensions.join(', '),
                '.tmp, .log'
            ),
            this.buildTextField(
                'mapping-names',
                'Skip files and folders named',
                mapping.excludeNames.join(', '),
                'node_modules, .git'
            ),
            this.buildTextField(
                'mapping-max-size',
                'Skip files larger than (MB, 0 = no limit)',
                String(Math.round((mapping.maxSizeBytes || 0)/1048576*100)/100),
                '0',
                'number'
            )
        ]);
    }

    buildScheduleFields(schedule)
    {
        let preview = this.dom.h('span', {class: 'muted help'});
        let cronInput = this.dom.h('input', {
            type: 'text',
            id: 'mapping-schedule-cron',
            class: 'cron-input',
            value: schedule.cron || '',
            placeholder: 'general schedule',
            spellcheck: 'false',
            'aria-label': 'Own cron expression',
            oninput: () => {
                this.cronPreview.previewCron(cronInput.value, preview, 'Uses the general schedule.');
            }
        });
        this.cronPreview.previewCron(cronInput.value, preview, 'Uses the general schedule.');
        return this.dom.h('div', {class: 'field'}, [
            this.dom.h('span', {text: 'Schedule'}),
            this.dom.h('label', {class: 'check'}, [
                this.dom.h('input', {
                    type: 'checkbox',
                    id: 'mapping-schedule-enabled',
                    checked: true === schedule.enabled
                }),
                'Scheduled: the scheduler inspects this mapping and syncs it when something changed'
            ]),
            this.dom.h('div', {class: 'settings-line'}, [
                cronInput,
                this.dom.h('button', {type: 'button', class: 'small', text: 'Edit schedule...', onclick: () => {
                    this.cronBuilder.openCronBuilder(cronInput.value, (expression) => {
                        cronInput.value = expression;
                        this.cronPreview.previewCron(cronInput.value, preview, 'Uses the general schedule.');
                    });
                }}),
                preview
            ]),
            this.dom.h('span', {
                class: 'muted help',
                text: 'Leave the cron empty to use the general schedule, an own cron overrides it.'
            })
        ]);
    }

    buildPathRow(value, isRemovable)
    {
        let input = this.dom.h('input', {
            type: 'text',
            value: value || '',
            spellcheck: 'false',
            placeholder: 'D:\\folder or \\\\server\\share'
        });
        let row = this.dom.h('div', {class: 'path-row'}, [
            input,
            this.dom.h('button', {type: 'button', class: 'small', text: 'Browse...', onclick: () => {
                this.folderPicker.openPicker(input.value, (selectedPath) => {
                    input.value = selectedPath;
                });
            }})
        ]);
        if(isRemovable){
            row.append(this.dom.h('button', {
                type: 'button',
                class: 'small ghost',
                text: 'Remove',
                'aria-label': 'Remove destination',
                onclick: () => {
                    row.remove();
                }
            }));
        }
        return row;
    }

    buildTextField(id, label, value, placeholder, type)
    {
        return this.dom.h('label', {class: 'field', for: id}, [
            this.dom.h('span', {text: label}),
            this.dom.h('input', {
                type: type || 'text',
                id: id,
                value: value,
                placeholder: placeholder,
                spellcheck: 'false',
                min: 'number' === type ? '0' : false,
                step: 'number' === type ? 'any' : false
            })
        ]);
    }

    async saveMapping(index, expectedFrom, destinationsList, errorBox)
    {
        let destinations = [];
        for(let input of destinationsList.querySelectorAll('input')){
            destinations.push(input.value);
        }
        let mapping = {
            from: this.dom.byId('mapping-from').value,
            to: destinations,
            includeExtensions: this.dom.byId('mapping-include').value,
            excludeExtensions: this.dom.byId('mapping-exclude').value,
            excludeNames: this.dom.byId('mapping-names').value,
            maxSizeBytes: Math.round(Number(this.dom.byId('mapping-max-size').value || 0)*1048576),
            excludeHidden: this.dom.byId('mapping-hidden').checked,
            excludeSystem: this.dom.byId('mapping-system').checked,
            enabled: this.dom.byId('mapping-enabled').checked,
            schedule: {
                enabled: this.dom.byId('mapping-schedule-enabled').checked,
                cron: this.dom.byId('mapping-schedule-cron').value
            }
        };
        let result;
        try{
            if(0 > index){
                result = await this.api.request('/api/mappings', mapping);
            }
            if(0 <= index){
                result = await this.api.request(
                    '/api/mappings/'+index,
                    {expectedFrom: expectedFrom, mapping: mapping},
                    'PUT'
                );
            }
        }catch(error){
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return;
        }
        this.dom.byId('dialog').close();
        let warnings = result.warnings || [];
        this.messages.showMappingsNotice(
            0 < warnings.length ? 'Saved, with warnings:\n'+warnings.join('\n') : 'Saved.',
            0 < warnings.length ? 'warn' : 'ok'
        );
        await this.refresh();
    }

}
