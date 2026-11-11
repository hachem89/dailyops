// Backup format, validation, upgrade and merge. Pure: no storage or DOM, so
// every rule is unit-tested.
//
// A backup is one JSON file:
//   { format: 'dailyops-backup', formatVersion: 1, appVersion, schemaVersion,
//     createdAt, counts: { store: n }, data: { store: [records] } }
// `schemaVersion` is the database schema the data came from. Older backups are
// upgraded to the current schema on import; backups from a newer version of
// DailyOps are refused rather than guessed at.
import { isDateKey } from '../utils/dates.js';
import { TASK_DEFAULTS } from './taskRecord.js';

export const BACKUP_FORMAT = 'dailyops-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

// Stores, the schema version that introduced each one, and its key field.
export const BACKUP_STORES = {
  tasks: { since: 1, key: 'id' },
  groups: { since: 1, key: 'id' },
  categories: { since: 1, key: 'id' },
  settings: { since: 1, key: 'key' },
  projects: { since: 2, key: 'id' },
  projectSubtasks: { since: 2, key: 'id' },
  recurrenceRules: { since: 2, key: 'id' },
  timeSessions: { since: 3, key: 'id' },
};

const TASK_STATUSES = ['open', 'done', 'cancelled', 'skipped'];
const TASK_KINDS = ['task', 'heading', 'divider'];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createBackup(data, { appVersion, schemaVersion, now = new Date() }) {
  const payload = {};
  const counts = {};
  for (const name of Object.keys(BACKUP_STORES)) {
    payload[name] = Array.isArray(data[name]) ? data[name] : [];
    counts[name] = payload[name].length;
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion,
    createdAt: now.toISOString(),
    counts,
    data: payload,
  };
}

export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `dailyops-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Checks a parsed backup without changing anything. Errors block the import;
// warnings are shown but do not.
export function validateBackup(backup, { currentSchema }) {
  const errors = [];
  const warnings = [];
  if (!isObject(backup) || backup.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a DailyOps backup.'], warnings };
  }
  if (!Number.isInteger(backup.formatVersion) || backup.formatVersion > BACKUP_FORMAT_VERSION) {
    errors.push('This backup uses a newer file format. Update DailyOps and try again.');
  }
  if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion < 1) {
    errors.push('The backup does not say which data version it contains.');
  } else if (backup.schemaVersion > currentSchema) {
    errors.push(`This backup was made by a newer version of DailyOps (data version ${backup.schemaVersion}). Update the app before restoring it.`);
  }
  if (Number.isNaN(Date.parse(backup.createdAt))) warnings.push('The backup has no valid creation date.');
  if (!isObject(backup.data)) {
    errors.push('The backup contains no data section.');
    return { ok: false, errors, warnings };
  }

  for (const name of Object.keys(backup.data)) {
    if (!BACKUP_STORES[name]) warnings.push(`Unknown section “${name}” will be ignored.`);
  }
  for (const [name, { key }] of Object.entries(BACKUP_STORES)) {
    const records = backup.data[name];
    if (records === undefined) continue;
    if (!Array.isArray(records)) {
      errors.push(`“${name}” must be a list.`);
      continue;
    }
    const seen = new Set();
    records.forEach((record, index) => {
      if (!isObject(record) || typeof record[key] !== 'string' || !record[key]) {
        errors.push(`${name} #${index + 1} has no valid ${key}.`);
        return;
      }
      if (seen.has(record[key])) errors.push(`${name} contains the ${key} “${record[key]}” twice.`);
      seen.add(record[key]);
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20), warnings };

  const tasks = backup.data.tasks || [];
  const taskIds = new Set(tasks.map((t) => t.id));
  tasks.forEach((t) => {
    if (typeof t.title !== 'string') errors.push(`Task ${t.id} has no title.`);
    if (t.status !== undefined && !TASK_STATUSES.includes(t.status)) errors.push(`Task “${t.title}” has an unknown status “${t.status}”.`);
    if (t.kind !== undefined && !TASK_KINDS.includes(t.kind)) errors.push(`Task “${t.title}” has an unknown kind “${t.kind}”.`);
    if (!t.parentTaskId && t.scheduledDate != null && !isDateKey(t.scheduledDate)) errors.push(`Task “${t.title}” has an invalid date.`);
  });
  const orphans = tasks.filter((t) => t.parentTaskId && !taskIds.has(t.parentTaskId)).length;
  if (orphans) warnings.push(`${orphans} subtask${orphans === 1 ? '' : 's'} refer to a missing parent task and will not be visible.`);
  const projectIds = new Set((backup.data.projects || []).map((p) => p.id));
  const strayProjectSubtasks = (backup.data.projectSubtasks || []).filter((s) => !projectIds.has(s.projectId)).length;
  if (strayProjectSubtasks) warnings.push(`${strayProjectSubtasks} project subtask${strayProjectSubtasks === 1 ? '' : 's'} refer to a missing project.`);

  return { ok: errors.length === 0, errors: errors.slice(0, 20), warnings };
}

// Upgrades a validated backup to the current schema and normalizes records:
// missing stores become empty, missing task fields get their defaults, and a
// timer that was running when the backup was made is stopped at that moment.
export function upgradeBackupData(backup) {
  const data = {};
  for (const name of Object.keys(BACKUP_STORES)) data[name] = Array.isArray(backup.data[name]) ? backup.data[name] : [];
  const madeAt = Date.parse(backup.createdAt) || Date.now();

  const madeAtIso = new Date(madeAt).toISOString();
  data.tasks = data.tasks.map((t) => ({
    ...TASK_DEFAULTS,
    rescheduleHistory: [],
    createdAt: madeAtIso,
    updatedAt: madeAtIso,
    ...t,
  }));
  data.timeSessions = data.timeSessions.map((s) =>
    s.end == null ? { ...s, end: Math.max(s.start, madeAt), duration: Math.max(0, madeAt - s.start) } : s,
  );
  data.settings = data.settings.map((s) =>
    s.key === 'timer' && s.value ? { ...s, value: { ...s.value, status: 'paused' } } : s,
  );
  return data;
}

// Merge: adds records that do not exist yet; existing records and settings win.
export function mergeData(existing, incoming) {
  const merged = {};
  const added = {};
  for (const [name, { key }] of Object.entries(BACKUP_STORES)) {
    const current = existing[name] || [];
    const keys = new Set(current.map((r) => r[key]));
    const fresh = (incoming[name] || []).filter((r) => !keys.has(r[key]));
    merged[name] = [...current, ...fresh];
    added[name] = fresh.length;
  }
  return { merged, added };
}

export function summarize(data) {
  return Object.fromEntries(Object.keys(BACKUP_STORES).map((name) => [name, (data[name] || []).length]));
}

// Gentle reminder: once there is something worth keeping and a backup has
// never been made (or the last one is two weeks old), unless snoozed.
export const BACKUP_REMINDER_DAYS = 14;
export function shouldRemindBackup({ lastBackupAt, snoozedUntil, firstUseAt, taskCount, now = new Date() }) {
  const day = 86400000;
  if (taskCount < 5) return false;
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return false;
  if (lastBackupAt) return now.getTime() - Date.parse(lastBackupAt) >= BACKUP_REMINDER_DAYS * day;
  return !!firstUseAt && now.getTime() - Date.parse(firstUseAt) >= 3 * day;
}
