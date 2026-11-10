// Pure queries over task, group and category arrays. No storage access here,
// so these functions can be unit-tested in Node.
import { byOrder } from './ordering.js';

export const STATUS = Object.freeze({ OPEN: 'open', DONE: 'done', CANCELLED: 'cancelled' });

export const isTopLevel = (task) => !task.parentTaskId;
export const isOpen = (task) => task.status === STATUS.OPEN;
export const isDone = (task) => task.status === STATUS.DONE;
export const isCancelled = (task) => task.status === STATUS.CANCELLED;

export function topLevelForDate(tasks, date) {
  return tasks.filter((t) => isTopLevel(t) && t.scheduledDate === date);
}

export function subtasksOf(tasks, parentId) {
  return tasks.filter((t) => t.parentTaskId === parentId).sort(byOrder);
}

// A top-level task is overdue when it is still open and its scheduled date has
// passed. It stays attached to its original date until the user moves it.
export function isOverdue(task, today) {
  return isTopLevel(task) && isOpen(task) && !!task.scheduledDate && task.scheduledDate < today;
}

export function overdueTasks(tasks, today) {
  return tasks
    .filter((t) => isOverdue(t, today))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || byOrder(a, b));
}

// Reusable groups appear on every date; day-specific groups only on their date.
export function isGroupVisibleOn(group, date) {
  return group.type === 'reusable' || (group.type === 'day' && group.associatedDate === date);
}

export function visibleGroupsForDate(groups, date) {
  return groups.filter((g) => isGroupVisibleOn(g, date)).sort(byOrder);
}

// The container a task renders in on its date. Tasks whose group is missing
// or not visible on that date fall back to the default container (null), so a
// task can never become invisible because of its group.
export function containerOf(task, visibleGroupIds) {
  return task.groupId && visibleGroupIds.has(task.groupId) ? task.groupId : null;
}

export function containerTasks(tasks, groups, date, groupId) {
  const visibleIds = new Set(visibleGroupsForDate(groups, date).map((g) => g.id));
  return topLevelForDate(tasks, date)
    .filter((t) => containerOf(t, visibleIds) === groupId)
    .sort(byOrder);
}

// Tasks with an execution time come first, by time; the rest keep manual order.
export function byExecutionTime(a, b) {
  const ta = a.executionTime || null;
  const tb = b.executionTime || null;
  if (ta && tb) return ta.localeCompare(tb) || byOrder(a, b);
  if (ta) return -1;
  if (tb) return 1;
  return byOrder(a, b);
}

// Cancelled tasks are excluded: they are neither done nor remaining.
export function dayProgress(tasks, date) {
  const relevant = topLevelForDate(tasks, date).filter((t) => !isCancelled(t));
  const done = relevant.filter(isDone).length;
  return { done, total: relevant.length };
}

export function matchesQuery(task, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [task.title, task.description, task.notes].some((field) => (field || '').toLowerCase().includes(q));
}
