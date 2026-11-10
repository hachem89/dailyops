import * as store from '../../core/store.js';
import { DB_VERSION } from '../../core/db.js';
import { h } from '../../utils/dom.js';
import { CATEGORY_COLORS, createCategory, deleteCategory, listCategories, updateCategory } from '../../domain/categories.js';
import { PRIORITIES } from '../../domain/priorities.js';
import { getSetting, setSetting } from '../../domain/settings.js';
import { registerActions, ui } from '../actions.js';
import { confirmDialog } from '../components/dialog.js';
import { toast } from '../components/toast.js';
import { icon } from '../icons.js';

export const APP_VERSION = '0.3.0';

const storageInfo = { persisted: null, usage: null };

async function refreshStorageInfo() {
  try {
    storageInfo.persisted = (await navigator.storage?.persisted?.()) ?? null;
    const estimate = await navigator.storage?.estimate?.();
    storageInfo.usage = estimate?.usage ?? null;
  } catch {
    /* Storage API not available */
  }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function row(label, hint, control) {
  return h('div', { class: 'setting-row' }, h('div', { class: 'setting-label' }, label, hint ? h('small', null, hint) : null), control);
}

export function renderSettings(root) {
  const theme = getSetting('theme');
  const categories = listCategories();

  root.replaceChildren(
    h(
      'div',
      { class: 'view' },
      h('header', { class: 'view-header' }, h('h1', { class: 'view-title' }, 'Settings')),

      h(
        'section',
        { class: 'settings-section' },
        h('h2', null, 'Appearance'),
        row(
          'Theme',
          'Remembered on this device.',
          h(
            'div',
            { class: 'segmented', role: 'group', 'aria-label': 'Theme' },
            ['system', 'light', 'dark'].map((value) =>
              h('button', { type: 'button', 'aria-pressed': String(theme === value), dataset: { action: 'set-theme', value } }, capitalize(value)),
            ),
          ),
        ),
      ),

      h(
        'section',
        { class: 'settings-section' },
        h('h2', null, 'Task defaults'),
        row(
          'Default priority',
          'Applied to new tasks. Changing a priority never changes a task’s position.',
          h(
            'select',
            { class: 'select', style: { width: 'auto' }, 'aria-label': 'Default priority', dataset: { action: 'set-default-priority' } },
            PRIORITIES.map((p) => h('option', { value: String(p.value), selected: getSetting('defaultPriority') === p.value }, `${p.label} — ${p.name}`)),
          ),
        ),
        row(
          'Show start times',
          'Display optional execution times on task rows. Times are never required.',
          h(
            'label',
            { class: 'switch' },
            h('input', { type: 'checkbox', checked: getSetting('showExecutionTimes'), dataset: { action: 'toggle-show-times' } }),
            'Show',
          ),
        ),
      ),

      h(
        'section',
        { class: 'settings-section' },
        h('h2', null, 'Categories'),
        h('p', null, 'Categories describe what a task is about (groups describe where you organize it). Deleting a category leaves its tasks uncategorized.'),
        categories.map((category) =>
          h(
            'div',
            { class: 'category-row' },
            h('span', { class: `cat-dot cat-${category.color}` }),
            h('input', {
              class: 'input',
              type: 'text',
              value: category.name,
              maxlength: 60,
              'aria-label': `Rename category ${category.name}`,
              dataset: { action: 'rename-category', id: category.id, focusKey: `cat:${category.id}` },
            }),
            h(
              'select',
              { class: 'select', 'aria-label': `Color for ${category.name}`, dataset: { action: 'color-category', id: category.id } },
              CATEGORY_COLORS.map((color) => h('option', { value: color, selected: color === category.color }, capitalize(color))),
            ),
            h(
              'button',
              { type: 'button', class: 'icon-btn', 'aria-label': `Delete category ${category.name}`, title: 'Delete category', dataset: { action: 'delete-category', id: category.id } },
              icon('trash'),
            ),
          ),
        ),
        !categories.length ? h('p', { class: 'faint' }, 'No categories. Tasks can stay uncategorized.') : null,
        h(
          'form',
          { class: 'add-category', dataset: { action: 'add-category' } },
          h('input', { class: 'input', name: 'name', type: 'text', placeholder: 'New category', maxlength: 60, autocomplete: 'off', 'aria-label': 'New category name', dataset: { focusKey: 'new-category' } }),
          h(
            'select',
            { class: 'select', name: 'color', style: { width: '110px' }, 'aria-label': 'New category color' },
            CATEGORY_COLORS.map((color) => h('option', { value: color, selected: color === 'blue' }, capitalize(color))),
          ),
          h('button', { type: 'submit', class: 'btn' }, icon('plus'), 'Add'),
        ),
      ),

      h(
        'section',
        { class: 'settings-section' },
        h('h2', null, 'Your data'),
        h('p', null, 'DailyOps has no accounts and no server. Everything you create is stored in this browser’s IndexedDB on this device.'),
        h(
          'ul',
          { class: 'info-list' },
          h('li', null, 'Data is not synchronized between devices or browsers. Each one keeps its own separate copy.'),
          h('li', null, 'Clearing this browser’s site data, or using a private window, can erase your tasks.'),
          h('li', null, 'No task, project or note is ever sent to an external service.'),
          h('li', null, 'Backup export and restore (JSON) are planned for the release phase and will appear here.'),
        ),
        h(
          'dl',
          { class: 'kv', style: { marginTop: '14px' } },
          h('dt', null, 'Persistent storage'),
          h(
            'dd',
            null,
            storageInfo.persisted === true
              ? 'Granted — the browser will not evict this data automatically.'
              : storageInfo.persisted === false
                ? ['Not granted. ', h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'request-persist' } }, 'Request persistent storage')]
                : 'Unknown in this browser.',
          ),
          h('dt', null, 'Storage used'),
          h('dd', null, storageInfo.usage != null ? `${(storageInfo.usage / 1024).toFixed(1)} KB` : 'Unknown'),
          h('dt', null, 'Tasks stored'),
          h('dd', null, String(store.all('tasks').length)),
        ),
        h(
          'div',
          { style: { marginTop: '16px' } },
          h('button', { type: 'button', class: 'btn btn-danger', dataset: { action: 'delete-all-data' } }, icon('trash'), 'Delete all local data'),
        ),
      ),

      h(
        'section',
        { class: 'settings-section' },
        h('h2', null, 'About'),
        h(
          'dl',
          { class: 'kv' },
          h('dt', null, 'Version'),
          h('dd', null, APP_VERSION),
          h('dt', null, 'Database schema'),
          h('dd', null, `v${DB_VERSION}`),
          h('dt', null, 'Philosophy'),
          h('dd', null, 'Know what matters. Start whenever you can. Work through it one task at a time.'),
        ),
      ),
    ),
  );
}

export function loadStorageInfo() {
  return refreshStorageInfo();
}

registerActions({
  'set-theme': (el) => setSetting('theme', el.dataset.value),
  'set-default-priority': (el) => setSetting('defaultPriority', Number(el.value)),
  'toggle-show-times': (el) => setSetting('showExecutionTimes', el.checked),
  'rename-category': (el) => {
    const name = el.value.trim();
    if (!name) {
      ui.render();
      return;
    }
    return updateCategory(el.dataset.id, { name });
  },
  'color-category': (el) => updateCategory(el.dataset.id, { color: el.value }),
  'add-category': async (form) => {
    const name = form.elements.name.value.trim();
    if (!name) return;
    form.elements.name.value = '';
    await createCategory(name, form.elements.color.value);
  },
  'delete-category': async (el) => {
    const category = store.get('categories', el.dataset.id);
    if (!category) return;
    const count = store.all('tasks').filter((t) => t.categoryId === category.id).length;
    const ok = await confirmDialog({
      title: `Delete “${category.name}”?`,
      message: count ? `${count} task${count === 1 ? '' : 's'} will become uncategorized. Nothing else changes.` : 'No tasks use this category.',
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (ok) await deleteCategory(category.id);
  },
  'request-persist': async () => {
    const granted = await navigator.storage?.persist?.();
    await refreshStorageInfo();
    toast(granted ? 'Persistent storage granted' : 'The browser declined persistent storage');
    ui.render();
  },
  'delete-all-data': async () => {
    const ok = await confirmDialog({
      title: 'Delete all local data?',
      message: 'Every task, group, category and setting stored in this browser will be permanently erased. This cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    await store.clearAll();
    try {
      localStorage.removeItem('dailyops.theme');
    } catch {
      /* ignore */
    }
    location.hash = '#/today';
    location.reload();
  },
});
