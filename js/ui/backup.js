// Backup export and restore (Settings) and the gentle backup reminder (Today).
import * as store from '../core/store.js';
import { DB_VERSION } from '../core/db.js';
import { h } from '../utils/dom.js';
import { formatTimestamp } from '../utils/dates.js';
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  mergeData,
  shouldRemindBackup,
  summarize,
  upgradeBackupData,
  validateBackup,
} from '../domain/backup.js';
import { getSetting, setSetting } from '../domain/settings.js';
import { isTaskItem } from '../domain/taskQueries.js';
import { registerActions, ui } from './actions.js';
import { confirmDialog } from './components/dialog.js';
import { toast } from './components/toast.js';

export const APP_VERSION = '0.6.0';

const STORE_LABELS = {
  tasks: 'Tasks and subtasks',
  projects: 'Projects',
  projectSubtasks: 'Project subtasks',
  recurrenceRules: 'Repeating series',
  timeSessions: 'Time sessions',
  groups: 'Groups',
  categories: 'Categories',
  settings: 'Settings',
};

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBackup({ quiet = false } = {}) {
  const now = new Date();
  const backup = createBackup(store.snapshot(), { appVersion: APP_VERSION, schemaVersion: DB_VERSION, now });
  download(backupFileName(now), JSON.stringify(backup, null, 2));
  await Promise.all([setSetting('lastBackupAt', now.toISOString()), setSetting('backupSnoozedUntil', null)]);
  if (!quiet) toast('Backup downloaded. Keep the file somewhere safe, such as cloud storage or a USB drive.', { duration: 7000 });
}

// ------------------------------------------------------------------ restore

function countsTable(counts) {
  return h(
    'table',
    { class: 'data-table backup-counts' },
    h(
      'tbody',
      null,
      Object.entries(STORE_LABELS).map(([name, label]) =>
        h('tr', null, h('td', null, label), h('td', { class: 'num' }, String(counts[name] ?? 0))),
      ),
    ),
  );
}

// Shows what a backup contains and asks how to restore it. Resolves to
// { mode: 'merge' | 'replace', safetyCopy } or null.
function restoreDialog({ backup, result, counts, current }) {
  return new Promise((resolve) => {
    let settled = false;
    const dialog = h('dialog', { class: 'dialog restore-dialog', 'aria-label': 'Restore backup' });
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    const form = h('form', { method: 'dialog' });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      finish({ mode: data.get('mode'), safetyCopy: data.get('safety') === 'on' });
    });
    const ok = result.ok;
    form.append(
      h('h2', null, ok ? 'Restore this backup?' : 'This backup cannot be restored'),
      ok
        ? h(
            'p',
            null,
            `Made ${formatTimestamp(backup.createdAt)} with DailyOps ${backup.appVersion || '(unknown version)'}, data version ${backup.schemaVersion}${backup.schemaVersion < DB_VERSION ? ' (it will be upgraded)' : ''}.`,
          )
        : null,
      result.errors.length ? h('ul', { class: 'backup-errors' }, result.errors.map((e) => h('li', null, e))) : null,
      result.warnings.length ? h('ul', { class: 'backup-warnings' }, result.warnings.map((w) => h('li', null, w))) : null,
      ok ? countsTable(counts) : null,
      ok
        ? h(
            'fieldset',
            { class: 'radio-group', style: { border: 0, padding: 0, margin: 0 } },
            h('legend', { class: 'field-label' }, 'How to restore'),
            h(
              'label',
              { class: 'radio-option' },
              h('input', { type: 'radio', name: 'mode', value: 'merge', checked: true }),
              h('span', null, 'Merge with my current data', h('small', null, 'Adds what is missing. Nothing you have now is changed or removed.')),
            ),
            h(
              'label',
              { class: 'radio-option' },
              h('input', { type: 'radio', name: 'mode', value: 'replace' }),
              h(
                'span',
                null,
                'Replace all my current data',
                h('small', null, `Your ${current.tasks} task${current.tasks === 1 ? '' : 's'} and everything else on this device are replaced by the backup.`),
              ),
            ),
            h(
              'label',
              { class: 'switch', style: { marginTop: '4px' } },
              h('input', { type: 'checkbox', name: 'safety', checked: true }),
              'Download a backup of my current data first',
            ),
          )
        : null,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, ok ? 'Cancel' : 'Close'),
        ok ? h('button', { type: 'submit', class: 'btn btn-primary' }, 'Restore') : null,
      ),
    );
    dialog.append(form);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener('close', () => finish(null));
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function importBackupFile(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    toast('That file is too large to be a DailyOps backup.', { type: 'error' });
    return;
  }
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    toast('That file is not valid JSON, so it cannot be a DailyOps backup.', { type: 'error', duration: 7000 });
    return;
  }

  // Validation happens before anything is changed.
  const result = validateBackup(backup, { currentSchema: DB_VERSION });
  const counts = result.ok ? summarize(upgradeBackupData(backup)) : {};
  const current = summarize(store.snapshot());
  const choice = await restoreDialog({ backup, result, counts, current });
  if (!choice) return;

  if (choice.mode === 'replace') {
    const sure = await confirmDialog({
      title: 'Replace all data on this device?',
      message: choice.safetyCopy
        ? 'A copy of your current data will be downloaded first, then everything is replaced by the backup.'
        : 'Everything currently stored in this browser will be replaced by the backup. Without a copy, this cannot be undone.',
      confirmLabel: 'Replace my data',
      danger: true,
    });
    if (!sure) return;
  }
  if (choice.safetyCopy) await exportBackup({ quiet: true });

  const incoming = upgradeBackupData(backup);
  const data = choice.mode === 'replace' ? incoming : mergeData(store.snapshot(), incoming).merged;
  // Never re-seed the default categories after a restore.
  data.settings = [...data.settings.filter((s) => s.key !== 'seededDefaults'), { key: 'seededDefaults', value: true }];

  try {
    await store.replaceAll(data);
  } catch (error) {
    toast(`Restore failed and nothing was changed: ${error.message || error}`, { type: 'error', duration: 9000 });
    return;
  }
  ui.closeDrawer();
  const restored = summarize(data);
  toast(
    choice.mode === 'replace'
      ? `Restored ${restored.tasks} tasks and ${restored.projects} projects from the backup.`
      : `Merged: you now have ${restored.tasks} tasks and ${restored.projects} projects.`,
    { duration: 7000 },
  );
}

// ----------------------------------------------------------------- reminder

export function backupReminderNeeded() {
  const tasks = store.all('tasks').filter(isTaskItem);
  const firstUseAt = tasks.reduce((min, t) => (!min || t.createdAt < min ? t.createdAt : min), null);
  return shouldRemindBackup({
    lastBackupAt: getSetting('lastBackupAt'),
    snoozedUntil: getSetting('backupSnoozedUntil'),
    firstUseAt,
    taskCount: tasks.length,
  });
}

registerActions({
  'export-backup': () => exportBackup(),
  'choose-backup-file': () => document.getElementById('backup-file')?.click(),
  'import-backup': async (input) => {
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    await importBackupFile(file);
  },
  'snooze-backup-reminder': () => setSetting('backupSnoozedUntil', new Date(Date.now() + 7 * 86400000).toISOString()),
});
