// Delegated event handling. Elements declare `data-action="name"` and views
// register handlers by name, so re-rendering never needs to rebind listeners.
//   buttons/links → click, inputs/selects → change, forms → submit,
//   `data-input-action` → input (skipped during IME composition).

const handlers = {};

export function registerActions(map) {
  Object.assign(handlers, map);
}

function run(name, el, event) {
  const handler = handlers[name];
  if (!handler) {
    console.warn(`No handler for action "${name}"`);
    return;
  }
  Promise.resolve(handler(el, event)).catch((error) => console.error(error));
}

export function bindActions(root) {
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || !root.contains(el) || el.matches('input, select, textarea, form')) return;
    run(el.dataset.action, el, event);
  });
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (!el.matches('input[data-action], select[data-action], textarea[data-action]')) return;
    run(el.dataset.action, el, event);
  });
  root.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-action]');
    if (!form) return;
    event.preventDefault();
    run(form.dataset.action, form, event);
  });
  root.addEventListener('input', (event) => {
    const el = event.target;
    if (!el.dataset?.inputAction || event.isComposing) return;
    run(el.dataset.inputAction, el, event);
  });
}

// Cross-cutting UI hooks, wired up by main.js to avoid circular imports.
export const ui = {
  openTask: () => {},
  closeDrawer: () => {},
  render: () => {},
};
