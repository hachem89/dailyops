import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_STORES,
  backupFileName,
  createBackup,
  mergeData,
  shouldRemindBackup,
  summarize,
  upgradeBackupData,
  validateBackup,
} from '../js/domain/backup.js';

const CURRENT = 3;
const sample = () => ({
  tasks: [
    { id: 't1', title: 'Write report', status: 'open', scheduledDate: '2026-11-11', kind: 'task' },
    { id: 's1', title: 'Outline', status: 'done', parentTaskId: 't1', scheduledDate: null },
  ],
  groups: [{ id: 'g1', name: 'Study', type: 'reusable' }],
  categories: [{ id: 'c1', name: 'Personal', color: 'pink' }],
  settings: [{ key: 'theme', value: 'dark' }],
  projects: [{ id: 'p1', name: 'Thesis', status: 'active' }],
  projectSubtasks: [{ id: 'ps1', projectId: 'p1', title: 'Chapter 1', status: 'open' }],
  recurrenceRules: [],
  timeSessions: [{ id: 'x1', taskId: 't1', start: 1000, end: 61000, duration: 60000, date: '2026-11-11' }],
});

test('a backup records format, schema version, date and counts for every store', () => {
  const backup = createBackup(sample(), { appVersion: '0.6.0', schemaVersion: CURRENT, now: new Date('2026-11-11T10:00:00Z') });
  assert.equal(backup.format, 'dailyops-backup');
  assert.equal(backup.schemaVersion, CURRENT);
  assert.equal(backup.createdAt, '2026-11-11T10:00:00.000Z');
  assert.deepEqual(Object.keys(backup.data).sort(), Object.keys(BACKUP_STORES).sort());
  assert.equal(backup.counts.tasks, 2);
  assert.match(backupFileName(new Date(2026, 10, 11)), /^dailyops-backup-2026-11-11\.json$/);
});

test('a backup survives a JSON round trip and validates', () => {
  const backup = JSON.parse(JSON.stringify(createBackup(sample(), { appVersion: '0.6.0', schemaVersion: CURRENT })));
  const result = validateBackup(backup, { currentSchema: CURRENT });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.warnings, []);
});

test('foreign files, newer versions and malformed records are refused', () => {
  assert.equal(validateBackup({ hello: 'world' }, { currentSchema: CURRENT }).ok, false);
  assert.equal(validateBackup(null, { currentSchema: CURRENT }).ok, false);
  const backup = createBackup(sample(), { appVersion: '9', schemaVersion: CURRENT });
  assert.match(validateBackup({ ...backup, schemaVersion: CURRENT + 1 }, { currentSchema: CURRENT }).errors[0], /newer version/);
  assert.equal(validateBackup({ ...backup, data: { tasks: 'nope' } }, { currentSchema: CURRENT }).ok, false);
  const duplicate = { ...backup, data: { ...backup.data, tasks: [backup.data.tasks[0], backup.data.tasks[0]] } };
  assert.match(validateBackup(duplicate, { currentSchema: CURRENT }).errors.join(), /twice/);
  const badStatus = { ...backup, data: { ...backup.data, tasks: [{ id: 'z', title: 'x', status: 'finished' }] } };
  assert.match(validateBackup(badStatus, { currentSchema: CURRENT }).errors.join(), /unknown status/);
  const badDate = { ...backup, data: { ...backup.data, tasks: [{ id: 'z', title: 'x', scheduledDate: '2026-13-40' }] } };
  assert.match(validateBackup(badDate, { currentSchema: CURRENT }).errors.join(), /invalid date/);
});

test('missing references are reported as warnings, not errors', () => {
  const data = sample();
  data.tasks.push({ id: 'orphan', title: 'Lost', parentTaskId: 'gone', status: 'open' });
  data.projectSubtasks.push({ id: 'ps2', projectId: 'gone', title: 'Lost' });
  const result = validateBackup(createBackup(data, { appVersion: '1', schemaVersion: CURRENT }), { currentSchema: CURRENT });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 2);
});

test('an old schema 1 backup is upgraded to the current schema', () => {
  const old = {
    format: 'dailyops-backup',
    formatVersion: 1,
    schemaVersion: 1,
    createdAt: '2026-11-10T09:00:00.000Z',
    data: {
      tasks: [{ id: 't1', title: 'Old task', status: 'open', scheduledDate: '2026-11-10', manualOrder: 2 }],
      groups: [],
      categories: [],
      settings: [],
    },
  };
  assert.equal(validateBackup(old, { currentSchema: CURRENT }).ok, true);
  const data = upgradeBackupData(old);
  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.timeSessions, []);
  const task = data.tasks[0];
  assert.equal(task.kind, 'task');
  assert.equal(task.projectId, null);
  assert.equal(task.recurrenceRuleId, null);
  assert.deepEqual(task.rescheduleHistory, []);
  assert.equal(task.manualOrder, 2, 'existing values are kept');
  assert.equal(task.createdAt, '2026-11-10T09:00:00.000Z');
});

test('a timer running at backup time is stopped at that moment', () => {
  const backup = createBackup(
    { ...sample(), timeSessions: [{ id: 'run', taskId: 't1', start: Date.parse('2026-11-11T09:00:00Z'), end: null }], settings: [{ key: 'timer', value: { targetType: 'task', targetId: 't1', status: 'running' } }] },
    { appVersion: '1', schemaVersion: CURRENT, now: new Date('2026-11-11T09:30:00Z') },
  );
  const data = upgradeBackupData(backup);
  assert.equal(data.timeSessions[0].duration, 30 * 60000);
  assert.equal(data.settings[0].value.status, 'paused');
});

test('merge adds only records that do not exist yet', () => {
  const existing = sample();
  const incoming = sample();
  incoming.tasks = [{ ...incoming.tasks[0], title: 'Changed in backup' }, { id: 't9', title: 'New one', status: 'open' }];
  incoming.settings = [{ key: 'theme', value: 'light' }];
  const { merged, added } = mergeData(existing, incoming);
  assert.equal(added.tasks, 1);
  assert.equal(merged.tasks.find((t) => t.id === 't1').title, 'Write report', 'existing record wins');
  assert.equal(merged.settings.find((s) => s.key === 'theme').value, 'dark', 'existing settings win');
  assert.equal(summarize(merged).tasks, 3);
});

test('backup reminder is gentle', () => {
  const now = new Date('2026-11-30T12:00:00Z');
  const base = { firstUseAt: '2026-11-01T00:00:00Z', taskCount: 10, now };
  assert.equal(shouldRemindBackup({ ...base, taskCount: 3 }), false, 'nothing worth backing up yet');
  assert.equal(shouldRemindBackup({ ...base }), true, 'never backed up');
  assert.equal(shouldRemindBackup({ ...base, firstUseAt: '2026-11-29T00:00:00Z' }), false, 'brand new user');
  assert.equal(shouldRemindBackup({ ...base, lastBackupAt: '2026-11-25T00:00:00Z' }), false, 'recent backup');
  assert.equal(shouldRemindBackup({ ...base, lastBackupAt: '2026-11-10T00:00:00Z' }), true, 'old backup');
  assert.equal(shouldRemindBackup({ ...base, snoozedUntil: '2026-12-05T00:00:00Z' }), false, 'snoozed');
});
