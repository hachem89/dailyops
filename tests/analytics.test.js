import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completionRate,
  estimateVsActual,
  executionStats,
  habitStats,
  overdueWork,
  periodRange,
  postponementStats,
  sessionMs,
  shiftPeriod,
  timeAllocation,
  trackedMs,
} from '../js/domain/analytics.js';

const task = (id, extra = {}) => ({
  id,
  title: id,
  parentTaskId: null,
  scheduledDate: '2026-11-10',
  status: 'open',
  categoryId: null,
  rescheduleHistory: [],
  ...extra,
});
const MIN = 60000;

test('week periods run Monday to Sunday; months cover every day', () => {
  const week = periodRange('week', '2026-11-12');
  assert.equal(week.start, '2026-11-09');
  assert.equal(week.end, '2026-11-15');
  assert.equal(week.days.length, 7);
  const month = periodRange('month', '2026-02-14');
  assert.equal(month.start, '2026-02-01');
  assert.equal(month.end, '2026-02-28');
  assert.equal(shiftPeriod('month', '2026-12-20', 1), '2027-01-01');
  assert.equal(shiftPeriod('week', '2026-11-12', -1), '2026-11-05');
});

test('execution stats keep cancelled and skipped apart from completed', () => {
  const range = periodRange('week', '2026-11-10');
  const tasks = [
    task('a', { status: 'done' }),
    task('b'),
    task('c', { status: 'cancelled' }),
    task('d', { status: 'skipped', recurrenceRuleId: 'r' }),
    task('e', { scheduledDate: '2026-11-09' }), // overdue
    task('f', { scheduledDate: '2026-11-09', recurrenceRuleId: 'r' }), // missed, not overdue
    task('sub', { parentTaskId: 'a', status: 'done' }),
    task('out', { scheduledDate: '2026-11-20', status: 'done' }),
  ];
  const stats = executionStats(tasks, range, '2026-11-10');
  assert.deepEqual(
    { done: stats.done, open: stats.open, cancelled: stats.cancelled, skipped: stats.skipped, overdue: stats.overdue, missed: stats.missed },
    { done: 1, open: 3, cancelled: 1, skipped: 1, overdue: 1, missed: 1 },
  );
  assert.equal(stats.rate, 1 / 4);
  assert.equal(completionRate({ done: 0, open: 0 }), null);
});

test('category filter narrows execution stats', () => {
  const range = periodRange('week', '2026-11-10');
  const tasks = [task('a', { categoryId: 'study', status: 'done' }), task('b', { categoryId: 'sport' }), task('c')];
  assert.equal(executionStats(tasks, range, '2026-11-10', { categoryId: 'study' }).done, 1);
  assert.equal(executionStats(tasks, range, '2026-11-10', { categoryId: 'sport' }).open, 1);
  assert.equal(executionStats(tasks, range, '2026-11-10', { categoryId: '' }).open, 1);
});

test('running sessions are measured from their start timestamp', () => {
  const now = 1_000_000;
  assert.equal(sessionMs({ start: now - 5 * MIN, end: null }, now), 5 * MIN);
  assert.equal(sessionMs({ start: 0, end: 10 * MIN, duration: 7 * MIN }, now), 7 * MIN);
  const sessions = [
    { taskId: 't', start: 0, end: 10 * MIN, duration: 10 * MIN },
    { taskId: 't', start: now - MIN, end: null },
    { taskId: 'x', start: 0, end: MIN, duration: MIN },
    { projectId: 'p', taskId: null, start: 0, end: 2 * MIN, duration: 2 * MIN },
  ];
  assert.equal(trackedMs(sessions, { taskId: 't' }, now), 11 * MIN);
  assert.equal(trackedMs(sessions, { projectId: 'p' }, now), 2 * MIN);
});

test('time is allocated by category and project, including via parent tasks', () => {
  const range = periodRange('week', '2026-11-10');
  const tasks = [
    task('parent', { categoryId: 'study', projectId: 'p1' }),
    task('child', { parentTaskId: 'parent', scheduledDate: null }),
    task('other', { categoryId: 'sport' }),
  ];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sessions = [
    { taskId: 'child', date: '2026-11-10', start: 0, end: 30 * MIN, duration: 30 * MIN },
    { taskId: 'other', date: '2026-11-11', start: 0, end: 15 * MIN, duration: 15 * MIN },
    { taskId: null, projectId: 'p2', date: '2026-11-12', start: 0, end: 10 * MIN, duration: 10 * MIN },
    { taskId: 'other', date: '2026-11-30', start: 0, end: 99 * MIN, duration: 99 * MIN },
  ];
  const result = timeAllocation(sessions, byId, range);
  assert.equal(result.total, 55 * MIN);
  assert.deepEqual(result.byCategory, [
    { id: 'study', ms: 30 * MIN },
    { id: 'sport', ms: 15 * MIN },
    { id: null, ms: 10 * MIN },
  ]);
  assert.deepEqual(result.byProject, [
    { id: 'p1', ms: 30 * MIN },
    { id: 'p2', ms: 10 * MIN },
  ]);
});

test('estimate vs actual compares only tasks with both', () => {
  const range = periodRange('week', '2026-11-10');
  const tasks = [task('a', { estimatedDuration: 30 }), task('b', { estimatedDuration: 60 }), task('c')];
  const sessions = [
    { taskId: 'a', start: 0, end: 45 * MIN, duration: 45 * MIN },
    { taskId: 'c', start: 0, end: 20 * MIN, duration: 20 * MIN },
  ];
  const result = estimateVsActual(tasks, sessions, range);
  assert.equal(result.compared, 1);
  assert.equal(result.estimateMs, 30 * MIN);
  assert.equal(result.actualMs, 45 * MIN);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].task.id, 'c');
});

test('habit stats count done, skipped and missed occurrences and streaks', () => {
  const rule = { id: 'r', frequency: 'daily', interval: 1, startDate: '2026-11-05', endDate: null };
  const occ = (date, status) => ({ recurrenceRuleId: 'r', occurrenceDate: date, status });
  const occurrences = [
    occ('2026-11-06', 'done'),
    // 11-07 never opened: missed
    occ('2026-11-08', 'done'),
    occ('2026-11-09', 'skipped'),
    occ('2026-11-10', 'open'), // today: pending
  ];
  const stats = habitStats(rule, occurrences, periodRange('week', '2026-11-10'), '2026-11-10');
  // Week Nov 9–15, only up to today: 9 (skipped), 10 (pending)
  assert.deepEqual([stats.expected, stats.done, stats.skipped, stats.pending, stats.missed], [2, 0, 1, 1, 0]);
  assert.equal(stats.rate, null);
  // Streak back from today: 10 pending (ignored), 9 skipped (neutral), 8 done, 7 missed → 1
  assert.equal(stats.streak, 1);

  const month = habitStats(rule, occurrences, periodRange('month', '2026-11-10'), '2026-11-10');
  assert.deepEqual([month.done, month.missed], [2, 2]); // 5 and 7 missed
  assert.equal(month.rate, 0.5);
});

test('postponement and overdue insights', () => {
  const tasks = [
    task('a', {
      rescheduleHistory: [
        { from: '2026-11-01', to: '2026-11-03' },
        { from: '2026-11-03', to: '2026-11-05' },
      ],
    }),
    task('b', { rescheduleHistory: [{ from: '2026-11-05', to: '2026-11-04' }] }),
    task('c', { scheduledDate: '2026-11-07' }),
    task('habit', { scheduledDate: '2026-11-07', recurrenceRuleId: 'r' }),
  ];
  const stats = postponementStats(tasks);
  assert.deepEqual(
    stats.map((s) => [s.task.id, s.moves, s.postponed, s.daysPushed]),
    [
      ['a', 2, 2, 4],
      ['b', 1, 0, 0],
    ],
  );
  assert.deepEqual(
    overdueWork(tasks, '2026-11-10').map((o) => [o.task.id, o.daysOverdue]),
    [['c', 3]],
  );
});
