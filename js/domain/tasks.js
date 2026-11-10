// Task commands. Every change produces a new record object; cached records are
// never mutated in place.
import * as store from '../core/store.js';
import { nowIso } from '../utils/ids.js';
import { isDateKey } from '../utils/dates.js';
import { nextOrder } from './ordering.js';
import { isPriority } from './priorities.js';
import { getSetting } from './settings.js';
import { SUBTASK_STATUS } from './projectQueries.js';
import { renameProjectSubtask, setProjectSubtaskStatus } from './projectLinks.js';
import { applyTemplateChange, setRuleGroup } from './repeat.js';
import { STATUS, containerTasks, isGroupVisibleOn, subtasksOf } from './taskQueries.js';
import { taskRecord } from './taskRecord.js';

const allTasks = () => store.all('tasks');
const allGroups = () => store.all('groups');

export function getTask(id) {
  return store.get('tasks', id);
}

export function createTask({
  title,
  scheduledDate,
  groupId = null,
  parentTaskId = null,
  priority,
  projectId = null,
  projectSubtaskId = null,
}) {
  const trimmed = (title || '').trim();
  if (!trimmed) return Promise.resolve(null);

  const parent = parentTaskId ? getTask(parentTaskId) : null;
  if (parentTaskId && !parent) return Promise.resolve(null);

  const siblings = parent
    ? subtasksOf(allTasks(), parentTaskId)
    : containerTasks(allTasks(), allGroups(), scheduledDate, groupId);

  const task = taskRecord({
    title: trimmed,
    // Subtasks follow their parent's date, group and (by default) priority.
    scheduledDate: parent ? null : scheduledDate,
    priority: parent ? null : isPriority(priority) ? priority : getSetting('defaultPriority'),
    groupId: parent ? null : groupId,
    parentTaskId: parent ? parent.id : null,
    projectId: parent ? null : projectId,
    projectSubtaskId: parent ? null : projectSubtaskId,
    manualOrder: nextOrder(siblings),
  });
  return store.put('tasks', task).then(() => task);
}

export async function updateTask(id, patch) {
  const task = getTask(id);
  if (!task) return;
  await store.put('tasks', { ...task, ...patch, updatedAt: nowIso() });
  if (task.recurrenceRuleId) await applyTemplateChange(task, patch);
  if (task.projectSubtaskId && patch.title && patch.title !== task.title) {
    await renameProjectSubtask(task.projectSubtaskId, patch.title);
  }
}

export function setStatus(id, status) {
  const task = getTask(id);
  if (!task || task.status === status) return Promise.resolve();
  // A daily task that stands for a project subtask completes the subtask itself.
  if (task.projectSubtaskId && store.get('projectSubtasks', task.projectSubtaskId)) {
    if (status === STATUS.DONE) return setProjectSubtaskStatus(task.projectSubtaskId, SUBTASK_STATUS.DONE);
    if (status === STATUS.OPEN && task.status === STATUS.DONE) {
      return setProjectSubtaskStatus(task.projectSubtaskId, SUBTASK_STATUS.OPEN);
    }
  }
  const now = nowIso();
  return store.put('tasks', {
    ...task,
    status,
    completedAt: status === STATUS.DONE ? now : null,
    cancelledAt: status === STATUS.CANCELLED ? now : null,
    updatedAt: now,
  });
}

// Completing a parent never completes its subtasks, and the task keeps its position.
export function toggleComplete(id) {
  const task = getTask(id);
  if (!task || task.status === STATUS.CANCELLED || task.status === STATUS.SKIPPED) return Promise.resolve();
  return setStatus(id, task.status === STATUS.DONE ? STATUS.OPEN : STATUS.DONE);
}

// Changes the scheduled date of the original task (never duplicates it).
// All metadata, subtasks and history stay attached. The change is recorded so
// postponement patterns can be analysed later.
export function rescheduleTask(id, date) {
  const task = getTask(id);
  if (!task || task.parentTaskId || !isDateKey(date) || task.scheduledDate === date) return Promise.resolve();

  const group = task.groupId ? store.get('groups', task.groupId) : null;
  const groupId = group && isGroupVisibleOn(group, date) ? group.id : null;
  const target = containerTasks(allTasks(), allGroups(), date, groupId);
  const now = nowIso();

  return store.put('tasks', {
    ...task,
    scheduledDate: date,
    groupId,
    manualOrder: nextOrder(target),
    rescheduleHistory: [...(task.rescheduleHistory || []), { from: task.scheduledDate, to: date, at: now }],
    updatedAt: now,
  });
}

export async function rescheduleMany(ids, date) {
  for (const id of ids) await rescheduleTask(id, date);
}

// Applies a new order to one container (a group, or the default container when
// groupId is null). Tasks dragged in from another container adopt its groupId.
export function arrangeTasks(groupId, orderedIds) {
  const updatedAt = nowIso();
  const updates = [];
  orderedIds.forEach((id, index) => {
    const task = getTask(id);
    if (!task || task.parentTaskId) return;
    if (task.manualOrder !== index || task.groupId !== groupId) {
      updates.push({ ...task, groupId, manualOrder: index, updatedAt });
    }
  });
  return store.put('tasks', updates);
}

export async function moveTaskToGroupEnd(id, groupId, { updateSeries = false } = {}) {
  const task = getTask(id);
  if (!task || task.parentTaskId) return;
  const target = containerTasks(allTasks(), allGroups(), task.scheduledDate, groupId).filter((t) => t.id !== id);
  await store.put('tasks', { ...task, groupId, manualOrder: nextOrder(target), updatedAt: nowIso() });
  // Choosing a group in the details panel also sets where future occurrences go.
  if (updateSeries && task.recurrenceRuleId) await setRuleGroup(task.recurrenceRuleId, groupId);
}

export function arrangeSubtasks(orderedIds) {
  const updatedAt = nowIso();
  const updates = [];
  orderedIds.forEach((id, index) => {
    const task = getTask(id);
    if (task && task.parentTaskId && task.manualOrder !== index) {
      updates.push({ ...task, manualOrder: index, updatedAt });
    }
  });
  return store.put('tasks', updates);
}

// Removes a task and its subtasks. Returns the removed records so the deletion
// can be undone.
export async function deleteTask(id) {
  const task = getTask(id);
  if (!task) return [];
  const removed = [task, ...allTasks().filter((t) => t.parentTaskId === id)];
  await store.remove(
    'tasks',
    removed.map((t) => t.id),
  );
  return removed;
}

export function restoreTasks(records) {
  return store.put('tasks', records);
}
