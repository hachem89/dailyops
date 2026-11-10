// Assigns Islamic reminders to tasks and remembers them.
//
// A task keeps the reminders it was given, so they stay the same across
// refreshes and remain visible in the task:
//   task.reminders = { before: { itemId, checked, at }, after: { itemId, checked, at } }
// The rotation position of every pool is stored in the `reminderRotation`
// setting, so refreshing never restarts or repeats the sequence.
// Ticking a reminder is optional and never changes the task's own status.
import * as store from '../core/store.js';
import { nowIso } from '../utils/ids.js';
import { todayKey } from '../utils/dates.js';
import { ISLAMIC_CONTENT } from '../content/islamic.js';
import { MOMENTS, poolKey, takeNext, themeForTask } from './reminderRotation.js';
import { getSetting, setSetting } from './settings.js';
import { STATUS } from './taskQueries.js';

const byId = new Map(ISLAMIC_CONTENT.map((item) => [item.id, item]));

export const reminderItem = (itemId) => byId.get(itemId) ?? null;

function contextOf(task) {
  const owner = task.parentTaskId ? store.get('tasks', task.parentTaskId) || task : task;
  return themeForTask(owner, owner.categoryId ? store.get('categories', owner.categoryId) : null);
}

// Gives `task` a reminder for `moment` unless it already has one.
export async function assignReminder(taskId, moment) {
  const task = store.get('tasks', taskId);
  if (!task || task.parentTaskId || reminderItem(task.reminders?.[moment]?.itemId)) return;
  const key = poolKey(moment, contextOf(task));
  const { item, state } = takeNext(getSetting('reminderRotation'), key, ISLAMIC_CONTENT);
  if (!item) return;
  // Task and rotation are written in the same tick so they cannot drift apart.
  await Promise.all([
    store.put('tasks', {
      ...task,
      reminders: { ...task.reminders, [moment]: { itemId: item.id, checked: false, at: nowIso() } },
    }),
    setSetting('reminderRotation', state),
  ]);
}

export async function setReminderChecked(taskId, moment, checked) {
  const task = store.get('tasks', taskId);
  const current = task?.reminders?.[moment];
  if (!current || current.checked === checked) return;
  await store.put('tasks', { ...task, reminders: { ...task.reminders, [moment]: { ...current, checked } } });
}

// Gratitude follows completion, by whichever path the task was completed
// (task row, details, a linked project subtask). Only tasks completed today
// are considered, so older history does not consume the rotation.
let assigningAfter = false;

export function ensureAfterReminders() {
  if (assigningAfter) return;
  const pending = store
    .all('tasks')
    .filter(
      (t) =>
        !t.parentTaskId &&
        t.status === STATUS.DONE &&
        t.completedAt &&
        new Date(t.completedAt).toDateString() === new Date().toDateString() &&
        !reminderItem(t.reminders?.after?.itemId),
    );
  if (!pending.length) return;
  // Sequential so each task takes the next item in the rotation.
  assigningAfter = true;
  (async () => {
    for (const task of pending) await assignReminder(task.id, MOMENTS.AFTER);
  })()
    .catch(() => {})
    .finally(() => {
      assigningAfter = false;
    });
}

// One Quran reminder for the day, shown at the top of Today.
export function dailyReminder(date = todayKey()) {
  const current = getSetting('dailyReminder');
  if (current?.date === date && reminderItem(current.itemId)) return { ...current, item: reminderItem(current.itemId) };
  return null;
}

export function ensureDailyReminder(date = todayKey()) {
  if (dailyReminder(date)) return;
  const { item, state } = takeNext(getSetting('reminderRotation'), 'daily', ISLAMIC_CONTENT);
  if (!item) return;
  Promise.all([
    setSetting('dailyReminder', { date, itemId: item.id, checked: false }),
    setSetting('reminderRotation', state),
  ]).catch(() => {});
}

export async function setDailyReminderChecked(checked) {
  const current = getSetting('dailyReminder');
  if (current) await setSetting('dailyReminder', { ...current, checked });
}
