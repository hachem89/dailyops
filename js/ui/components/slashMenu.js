// Slash command menu for task inputs marked with `data-slash`.
// Arrow keys move, Enter or Tab selects, Escape closes. Listeners run in the
// capture phase so Enter selects a command instead of submitting the form and
// Escape closes the menu instead of the details panel.
import { h, cls } from '../../utils/dom.js';
import { matchCommands, parseSlash } from '../slashCommands.js';

// Inputs can be switched into "heading" mode; remembered by focus key because
// re-rendering replaces the input element.
const modes = new Map();
let menu = null;
let handler = () => {};

export const inputMode = (focusKey) => modes.get(focusKey) || 'task';

export function setInputMode(focusKey, mode) {
  if (mode === 'task') modes.delete(focusKey);
  else modes.set(focusKey, mode);
}

export function closeSlashMenu() {
  if (!menu) return false;
  menu.el.remove();
  menu.input.removeAttribute('aria-activedescendant');
  menu.input.setAttribute('aria-expanded', 'false');
  menu = null;
  return true;
}

function render() {
  const { el, items, active, input } = menu;
  el.replaceChildren(
    ...items.map((command, index) =>
      h(
        'button',
        {
          type: 'button',
          id: `slash-${command.id}`,
          class: cls('menu-item slash-item', index === active && 'active'),
          role: 'option',
          'aria-selected': String(index === active),
          onmousedown: (event) => event.preventDefault(), // keep focus in the input
          onclick: () => select(index),
        },
        h('span', { class: 'slash-label' }, command.label),
        h('span', { class: 'slash-hint' }, command.hint),
      ),
    ),
  );
  input.setAttribute('aria-activedescendant', `slash-${items[active].id}`);
}

function open(input, items) {
  if (!menu || menu.input !== input) {
    closeSlashMenu();
    const el = h('div', { class: 'menu slash-menu', role: 'listbox', 'aria-label': 'Commands' });
    document.body.append(el);
    menu = { el, input, items, active: 0 };
    input.setAttribute('aria-expanded', 'true');
  } else {
    menu.items = items;
    menu.active = Math.min(menu.active, items.length - 1);
  }
  render();
  const rect = input.getBoundingClientRect();
  const height = menu.el.offsetHeight;
  const top = rect.bottom + 6 + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6;
  menu.el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.el.offsetWidth - 8))}px`;
  menu.el.style.top = `${Math.max(8, top)}px`;
}

function update(input) {
  if (inputMode(input.dataset.focusKey) !== 'task') return closeSlashMenu();
  const parsed = parseSlash(input.value);
  const items = parsed ? matchCommands(parsed.query) : [];
  // An unknown command word closes the menu; Enter then adds the text as a task.
  if (!items.length) return closeSlashMenu();
  open(input, items);
}

function select(index) {
  if (!menu) return;
  const { input, items } = menu;
  const command = items[index];
  const parsed = parseSlash(input.value);
  closeSlashMenu();
  handler(command.id, { input, form: input.form, rest: parsed?.rest || '' });
}

export function initSlashMenu(root, { onCommand }) {
  handler = onCommand;
  root.addEventListener('input', (event) => {
    if (event.target.matches?.('[data-slash]') && !event.isComposing) update(event.target);
  });
  root.addEventListener(
    'keydown',
    (event) => {
      const input = event.target;
      if (!input.matches?.('[data-slash]')) return;
      const key = input.dataset.focusKey;

      if (menu && menu.input === input) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          menu.active = (menu.active + delta + menu.items.length) % menu.items.length;
          render();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          select(menu.active);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeSlashMenu();
        }
        return;
      }

      // Leave heading mode with Escape, or Backspace in an empty input.
      if (inputMode(key) !== 'task' && (event.key === 'Escape' || (event.key === 'Backspace' && !input.value))) {
        event.preventDefault();
        event.stopPropagation();
        setInputMode(key, 'task');
        handler('mode-changed', { input, form: input.form, rest: '' });
      }
    },
    true,
  );
  root.addEventListener('focusout', (event) => {
    if (menu && event.target === menu.input) setTimeout(() => menu && document.activeElement !== menu.input && closeSlashMenu(), 0);
  });
}
