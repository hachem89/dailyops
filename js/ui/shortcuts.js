// Keyboard shortcuts. Single-key shortcuts are ignored while typing so they
// never interfere with text entry. Browsers reserve Ctrl+N and Ctrl+Shift+N
// for new windows, so N and Shift+N are the dependable alternatives; the Ctrl
// versions are still handled wherever the browser passes them through.
import { h, isTypingTarget } from '../utils/dom.js';
import { openSearch } from './components/searchDialog.js';
import { navigate, parseHash } from './router.js';

export const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], mac: ['⌘', 'K'], label: 'Search tasks and projects' },
  { keys: ['N'], label: 'New task (Ctrl + N where the browser allows it)' },
  { keys: ['Shift', 'N'], label: 'New project (Ctrl + Shift + N where the browser allows it)' },
  { keys: ['/'], label: 'New task with the command menu' },
  { keys: ['T'], label: 'Go to Today' },
  { keys: ['Alt', '↑ / ↓'], label: 'Move the focused task, subtask or group' },
  { keys: ['Esc'], label: 'Close menus, dialogs and task details' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function shortcutKeys(shortcut) {
  return (isMac && shortcut.mac) || shortcut.keys;
}

function focusQuickAdd(prefix = '') {
  const route = parseHash();
  const focus = () => {
    const input = document.querySelector('#view-root [data-focus-key="quick-add"]');
    if (!input) return;
    input.focus();
    if (prefix) {
      input.value = prefix;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  if (route.name === 'today' || route.name === 'day') focus();
  else {
    navigate('#/today');
    setTimeout(focus, 50);
  }
}

export function showShortcutHelp() {
  if (document.querySelector('dialog.shortcut-dialog')) return;
  const dialog = h(
    'dialog',
    { class: 'dialog shortcut-dialog', 'aria-label': 'Keyboard shortcuts' },
    h(
      'form',
      { method: 'dialog' },
      h('h2', null, 'Keyboard shortcuts'),
      h(
        'dl',
        { class: 'shortcut-list' },
        SHORTCUTS.map((s) => [h('dt', null, shortcutKeys(s).map((k) => h('kbd', null, k))), h('dd', null, s.label)]),
      ),
      h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-primary', autofocus: true, onclick: () => close() }, 'Close')),
    ),
  );
  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', close);
  document.body.append(dialog);
  dialog.showModal();
}

export function initShortcuts({ newProject }) {
  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && !event.altKey && key === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (document.querySelector('dialog[open]')) return;
    if (mod && !event.altKey && key === 'n') {
      event.preventDefault();
      if (event.shiftKey) newProject();
      else focusQuickAdd();
      return;
    }
    if (mod || event.altKey || isTypingTarget(event.target)) return;

    if (event.key === 'n') {
      event.preventDefault();
      focusQuickAdd();
    } else if (event.key === 'N') {
      event.preventDefault();
      newProject();
    } else if (event.key === '/') {
      event.preventDefault();
      focusQuickAdd('/');
    } else if (key === 't') {
      event.preventDefault();
      navigate('#/today');
    } else if (event.key === '?') {
      event.preventDefault();
      showShortcutHelp();
    }
  });
}
