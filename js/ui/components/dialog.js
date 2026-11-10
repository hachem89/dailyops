// Promise-based dialogs built on the native <dialog> element.
import { h } from '../../utils/dom.js';

function showDialog(buildContent) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      dialog.remove();
      resolve(value);
    };
    // Settle directly rather than waiting for the 'close' event, which is not
    // reliably dispatched after a programmatic close() in every browser.
    const finish = (value) => {
      if (dialog.open) dialog.close();
      settle(value);
    };
    dialog.append(buildContent(finish));
    // Escape or any other native close counts as cancel.
    dialog.addEventListener('close', () => settle(null));
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return showDialog((finish) => {
    const form = h(
      'form',
      {
        method: 'dialog',
        onsubmit: (event) => {
          event.preventDefault();
          finish(true);
        },
      },
      h('h2', null, title),
      message ? h('p', null, message) : null,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, 'Cancel'),
        h('button', { type: 'submit', class: danger ? 'btn btn-danger' : 'btn btn-primary', autofocus: true }, confirmLabel),
      ),
    );
    return form;
  }).then(Boolean);
}

// fields: [{ name, label, type: 'text' | 'radio' | 'select' | 'number' | 'checkboxes', value, placeholder,
//           required, hint, min, max, options: [{ value, label, hint }] }]
export function formDialog({ title, description, fields, submitLabel = 'Save' }) {
  return showDialog((finish) => {
    const form = h('form', { method: 'dialog' });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      fields.filter((f) => f.type === 'checkboxes').forEach((f) => (data[f.name] = formData.getAll(f.name)));
      for (const field of fields) {
        if (field.required && !String(data[field.name] ?? '').trim()) {
          form.elements[field.name]?.focus?.();
          return;
        }
      }
      finish(data);
    });

    form.append(
      h('h2', null, title),
      description ? h('p', null, description) : null,
      ...fields.map((field, index) => {
        if (field.type === 'radio') {
          return h(
            'fieldset',
            { class: 'radio-group', style: { border: 0, padding: 0, margin: 0 } },
            h('legend', { class: 'field-label' }, field.label),
            field.options.map((option) =>
              h(
                'label',
                { class: 'radio-option' },
                h('input', { type: 'radio', name: field.name, value: option.value, checked: option.value === field.value }),
                h('span', null, option.label, option.hint ? h('small', null, option.hint) : null),
              ),
            ),
          );
        }
        if (field.type === 'checkboxes') {
          return h(
            'fieldset',
            { class: 'checkbox-row', style: { border: 0, padding: 0, margin: 0 } },
            h('legend', { class: 'field-label' }, field.label),
            field.options.map((option) =>
              h(
                'label',
                { class: 'checkbox-pill' },
                h('input', { type: 'checkbox', name: field.name, value: option.value, checked: (field.value || []).includes(option.value) }),
                h('span', null, option.label),
              ),
            ),
            field.hint ? h('small', { class: 'faint', style: { display: 'block', marginTop: '4px' } }, field.hint) : null,
          );
        }
        if (field.type === 'select') {
          return h(
            'label',
            null,
            h('span', { class: 'field-label' }, field.label),
            h(
              'select',
              { class: 'select', name: field.name },
              field.options.map((option) => h('option', { value: option.value, selected: option.value === field.value }, option.label)),
            ),
          );
        }
        if (field.type === 'number') {
          return h(
            'label',
            null,
            h('span', { class: 'field-label' }, field.label),
            h('input', { class: 'input', type: 'number', name: field.name, value: field.value ?? '', min: field.min, max: field.max, style: { maxWidth: '140px' } }),
            field.hint ? h('small', { class: 'faint', style: { display: 'block', marginTop: '4px' } }, field.hint) : null,
          );
        }
        return h(
          'label',
          null,
          h('span', { class: 'field-label' }, field.label),
          h('input', {
            class: 'input',
            type: 'text',
            name: field.name,
            value: field.value ?? '',
            placeholder: field.placeholder ?? '',
            maxlength: 200,
            autocomplete: 'off',
            autofocus: index === 0,
          }),
        );
      }),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel),
      ),
    );
    return form;
  });
}
