// Task commands. Every change produces a new record object; cached records are
// never mutated in place.
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { isDateKey } from '../utils/dates.js';
import { nextOrder } from './ordering.js';
import { isPriority } from './priorities.js';
import { getSetting } from './settings.js';
import { STATUS, containerTasks, isGroupVisibleOn, subtasksOf } from './taskQueries.js';

const allTasks = () => store.all('tasks');
const allGroups = () => store.all('groups');

export function getTask(id) {
  return store.get('tasks', id);
}

export function createTask({ title, scheduledDate, groupId = null, parentTaskId = null, priority }) {
  const trimmed = (title || '').trim();
  if (!trimmed) return Promise.resolve(null);

  const parent = parentTaskId ? getTask(parentTaskId) : null;
  if (parentTaskId && !parent) return Promise.resolve(null);

  const siblings = parent
    ? subtasksOf(allTasks(), parentTaskId)
    : containerTasks(allTasks(), allGroups(), scheduledDate, groupId);

  const createdAt = nowIso();
  const task = {
    id: createId(),
    title: trimmed,
    description: '',
    notes: '',
    // Subtasks follow their parent's date, group and (by default) priority.
    scheduledDate: parent ? null : scheduledDate,
    deadline: null,
    deadlineTime: null,
    executionTime: null,
    priority: parent ? null : isPriority(priority) ? priority : getSetting('defaultPriority'),
    categoryId: null,
    groupId: parent ? null : groupId,
    parentTaskId: parent ? parent.id : null,
    projectId: null,
    projectSubtaskId: null,
    recurrenceRuleId: null,
    status: STATUS.OPEN,
    manualOrder: nextOrder(siblings),
    estimatedDuration: null,
    rescheduleHistory: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelledAt: null,
  };
  return store.put('tasks', task).then(() => task);
}

export function updateTask(id, patch) {
  const task = getTask(id);
  if (!task) return Promise.resolve();
  return store.put('tasks', { ...task, ...patch, updatedAt: nowIso() });
}

export function setStatus(id, status) {
  const task = getTask(id);
  if (!task || task.status === status) return Promise.resolve();
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
  if (!task || task.status === STATUS.CANCELLED) return Promise.resolve();
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

export function moveTaskToGroupEnd(id, groupId) {
  const task = getTask(id);
  if (!task || task.parentTaskId) return Promise.resolve();
  const target = containerTasks(allTasks(), allGroups(), task.scheduledDate, groupId).filter((t) => t.id !== id);
  return updateTask(id, { groupId, manualOrder: nextOrder(target) });
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
