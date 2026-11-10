import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  containerTasks,
  dayProgress,
  overdueTasks,
  subtasksOf,
  visibleGroupsForDate,
  byExecutionTime,
  isMissed,
} from '../js/domain/taskQueries.js';
import { insertAt, reassignSlots, shiftId, sortByOrder } from '../js/domain/ordering.js';
import { effectivePriority } from '../js/domain/priorities.js';

const task = (id, extra = {}) => ({
  id,
  title: id,
  parentTaskId: null,
  scheduledDate: '2026-11-10',
  groupId: null,
  status: 'open',
  priority: 3,
  manualOrder: 0,
  createdAt: '2026-11-10T08:00:00.000Z',
  ...extra,
});

test('reusable groups appear on every date, day-specific only on their date', () => {
  const groups = [
    { id: 'g1', type: 'reusable', manualOrder: 1 },
    { id: 'g2', type: 'day', associatedDate: '2026-11-10', manualOrder: 0 },
  ];
  assert.deepEqual(visibleGroupsForDate(groups, '2026-11-10').map((g) => g.id), ['g2', 'g1']);
  assert.deepEqual(visibleGroupsForDate(groups, '2026-11-11').map((g) => g.id), ['g1']);
});

test('tasks in a hidden or missing group fall back to the default container', () => {
  const groups = [{ id: 'day', type: 'day', associatedDate: '2026-11-09', manualOrder: 0 }];
  const tasks = [task('a', { groupId: 'day' }), task('b', { groupId: 'deleted' }), task('c')];
  assert.deepEqual(containerTasks(tasks, groups, '2026-11-10', null).map((t) => t.id).sort(), ['a', 'b', 'c']);
});

test('manual order is independent of priority', () => {
  const tasks = [
    task('low', { priority: 4, manualOrder: 0 }),
    task('critical', { priority: 1, manualOrder: 1 }),
  ];
  assert.deepEqual(containerTasks(tasks, [], '2026-11-10', null).map((t) => t.id), ['low', 'critical']);
});

test('overdue tasks are open, top-level and scheduled before today', () => {
  const tasks = [
    task('old', { scheduledDate: '2026-11-08' }),
    task('older', { scheduledDate: '2026-11-01' }),
    task('done', { scheduledDate: '2026-11-08', status: 'done' }),
    task('cancelled', { scheduledDate: '2026-11-08', status: 'cancelled' }),
    task('sub', { scheduledDate: null, parentTaskId: 'old' }),
    task('habit', { scheduledDate: '2026-11-08', recurrenceRuleId: 'r1', occurrenceDate: '2026-11-08' }),
    task('today'),
  ];
  assert.deepEqual(overdueTasks(tasks, '2026-11-10').map((t) => t.id), ['older', 'old']);
});

test('day progress ignores cancelled tasks and subtasks', () => {
  const tasks = [
    task('a', { status: 'done' }),
    task('b'),
    task('c', { status: 'cancelled' }),
    task('k', { status: 'skipped', recurrenceRuleId: 'r1' }),
    task('s', { parentTaskId: 'a', scheduledDate: null, status: 'done' }),
  ];
  assert.deepEqual(dayProgress(tasks, '2026-11-10'), { done: 1, total: 2 });
});

test('subtasks are returned in their own manual order', () => {
  const tasks = [
    task('s2', { parentTaskId: 'p', manualOrder: 1 }),
    task('s1', { parentTaskId: 'p', manualOrder: 0 }),
    task('other', { parentTaskId: 'x' }),
  ];
  assert.deepEqual(subtasksOf(tasks, 'p').map((t) => t.id), ['s1', 's2']);
});

test('execution-time sort puts timed tasks first and keeps manual order for the rest', () => {
  const tasks = [
    task('untimed2', { manualOrder: 3 }),
    task('late', { executionTime: '15:00', manualOrder: 0 }),
    task('untimed1', { manualOrder: 1 }),
    task('early', { executionTime: '08:30', manualOrder: 2 }),
  ];
  assert.deepEqual([...tasks].sort(byExecutionTime).map((t) => t.id), ['early', 'late', 'untimed1', 'untimed2']);
});

test('insertAt and shiftId reorder ids', () => {
  assert.deepEqual(insertAt(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(insertAt(['a', 'b'], 'x', 99), ['a', 'b', 'x']);
  assert.deepEqual(shiftId(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.equal(shiftId(['a', 'b'], 'a', -1), null);
});

test('reassignSlots keeps a subset inside its existing slots', () => {
  const visible = [
    { id: 'a', manualOrder: 2 },
    { id: 'b', manualOrder: 5 },
  ];
  const orders = reassignSlots(visible, ['b', 'a']);
  assert.equal(orders.get('b'), 2);
  assert.equal(orders.get('a'), 5);
});

test('sortByOrder breaks ties by creation time', () => {
  const items = [
    { id: 'second', manualOrder: 0, createdAt: '2026-11-10T09:00:00Z' },
    { id: 'first', manualOrder: 0, createdAt: '2026-11-10T08:00:00Z' },
  ];
  assert.deepEqual(sortByOrder(items).map((i) => i.id), ['first', 'second']);
});

test('subtasks inherit priority unless overridden', () => {
  const parent = { priority: 1 };
  assert.equal(effectivePriority({ priority: null }, parent), 1);
  assert.equal(effectivePriority({ priority: 4 }, parent), 4);
  assert.equal(effectivePriority({ priority: null }, null), 3);
});

test('past open occurrences are missed, not overdue', () => {
  const occurrence = task('habit', { scheduledDate: '2026-11-08', recurrenceRuleId: 'r1', occurrenceDate: '2026-11-08' });
  assert.equal(isMissed(occurrence, '2026-11-10'), true);
  assert.equal(isMissed({ ...occurrence, status: 'done' }, '2026-11-10'), false);
  assert.equal(isMissed(task('plain', { scheduledDate: '2026-11-08' }), '2026-11-10'), false);
});
