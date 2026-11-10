// Keeps daily tasks that reference a project subtask consistent with it.
// The project subtask is the source of truth: completing it from either the
// project page or the daily list updates the subtask and every linked task.
import * as store from '../core/store.js';
import { nowIso } from '../utils/ids.js';
import { SUBTASK_STATUS } from './projectQueries.js';
import { STATUS } from './taskQueries.js';

export function linkedTasks(subtaskId) {
  return store.all('tasks').filter((t) => t.projectSubtaskId === subtaskId);
}

export async function setProjectSubtaskStatus(subtaskId, status) {
  const subtask = store.get('projectSubtasks', subtaskId);
  if (!subtask) return;
  const now = nowIso();
  const done = status === SUBTASK_STATUS.DONE;
  if (subtask.status !== status) {
    await store.put('projectSubtasks', { ...subtask, status, completedAt: done ? now : null, updatedAt: now });
  }
  // Cancelled or skipped daily tasks are left alone; only open/done mirror the subtask.
  const updates = linkedTasks(subtaskId)
    .filter((t) => t.status === STATUS.OPEN || t.status === STATUS.DONE)
    .filter((t) => t.status !== (done ? STATUS.DONE : STATUS.OPEN))
    .map((t) => ({ ...t, status: done ? STATUS.DONE : STATUS.OPEN, completedAt: done ? now : null, updatedAt: now }));
  await store.put('tasks', updates);
}

export async function renameProjectSubtask(subtaskId, title) {
  const subtask = store.get('projectSubtasks', subtaskId);
  if (!subtask) return;
  const now = nowIso();
  if (subtask.title !== title) await store.put('projectSubtasks', { ...subtask, title, updatedAt: now });
  await store.put(
    'tasks',
    linkedTasks(subtaskId)
      .filter((t) => t.title !== title)
      .map((t) => ({ ...t, title, updatedAt: now })),
  );
}
