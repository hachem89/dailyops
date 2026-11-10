import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeRule,
  normalizePattern,
  occursOn,
  plannedOccurrences,
  repeatPresets,
  samePattern,
} from '../js/domain/recurrence.js';
import { projectProgress, projectSubtaskPriority } from '../js/domain/projectQueries.js';

const rule = (pattern, extra = {}) => ({ id: 'r1', startDate: '2026-11-10', endDate: null, ...pattern, ...extra });

test('daily rules occur every n days from the start date', () => {
  const daily = rule({ frequency: 'daily', interval: 1 });
  assert.ok(occursOn(daily, '2026-11-10'));
  assert.ok(occursOn(daily, '2026-11-11'));
  assert.ok(!occursOn(daily, '2026-11-09'), 'never before the start date');

  const everyThird = rule({ frequency: 'daily', interval: 3 });
  assert.ok(occursOn(everyThird, '2026-11-13'));
  assert.ok(!occursOn(everyThird, '2026-11-12'));
});

test('end date stops a rule', () => {
  const daily = rule({ frequency: 'daily', interval: 1 }, { endDate: '2026-11-12' });
  assert.ok(occursOn(daily, '2026-11-12'));
  assert.ok(!occursOn(daily, '2026-11-13'));
});

test('weekly rules respect selected weekdays and week intervals', () => {
  // 2026-11-10 is a Tuesday.
  const weekdays = rule({ frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] });
  assert.ok(occursOn(weekdays, '2026-11-13')); // Friday
  assert.ok(!occursOn(weekdays, '2026-11-14')); // Saturday
  assert.ok(occursOn(weekdays, '2026-11-16')); // Monday

  const biweekly = rule({ frequency: 'weekly', interval: 2, weekdays: [2] });
  assert.ok(occursOn(biweekly, '2026-11-10'));
  assert.ok(!occursOn(biweekly, '2026-11-17'));
  assert.ok(occursOn(biweekly, '2026-11-24'));
});

test('monthly rules clamp to the end of short months', () => {
  const monthly = rule({ frequency: 'monthly', interval: 1, monthDay: 31 }, { startDate: '2026-10-31' });
  assert.ok(occursOn(monthly, '2026-11-30'));
  assert.ok(!occursOn(monthly, '2026-11-29'));
  assert.ok(occursOn(monthly, '2027-02-28'));

  const quarterly = rule({ frequency: 'monthly', interval: 3, monthDay: 10 });
  assert.ok(!occursOn(quarterly, '2026-12-10'));
  assert.ok(occursOn(quarterly, '2027-02-10'));
});

test('planned occurrences never duplicate existing ones', () => {
  const daily = rule({ frequency: 'daily', interval: 1 });
  const tasks = [{ id: 'x', recurrenceRuleId: 'r1', occurrenceDate: '2026-11-10' }];
  const dates = ['2026-11-10', '2026-11-11', '2026-11-11'];
  const planned = plannedOccurrences([daily], tasks, dates);
  assert.deepEqual(
    planned.map((p) => p.date),
    ['2026-11-11'],
  );
});

test('a rescheduled occurrence still counts for its original occurrence date', () => {
  const daily = rule({ frequency: 'daily', interval: 1 });
  const moved = [{ id: 'x', recurrenceRuleId: 'r1', occurrenceDate: '2026-11-10', scheduledDate: '2026-11-11' }];
  assert.deepEqual(
    plannedOccurrences([daily], moved, ['2026-11-10']),
    [],
  );
});

test('normalizePattern fills sensible defaults', () => {
  assert.deepEqual(normalizePattern({ frequency: 'weekly' }, '2026-11-10'), {
    frequency: 'weekly',
    interval: 1,
    weekdays: [2],
    monthDay: null,
  });
  assert.equal(normalizePattern({ frequency: 'monthly', interval: 0 }, '2026-11-10').monthDay, 10);
  assert.equal(normalizePattern({ frequency: 'bogus', interval: -4 }, '2026-11-10').frequency, 'daily');
});

test('rules are described in plain language', () => {
  assert.equal(describeRule(rule({ frequency: 'daily', interval: 1 })), 'Every day');
  assert.equal(describeRule(rule({ frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] })), 'Every weekday');
  assert.equal(describeRule(rule({ frequency: 'weekly', interval: 1, weekdays: [2] })), 'Every Tuesday');
  assert.equal(describeRule(rule({ frequency: 'weekly', interval: 2, weekdays: [1, 3] })), 'Every 2 weeks on Mon, Wed');
  assert.equal(describeRule(rule({ frequency: 'monthly', interval: 1, monthDay: 10 })), 'Monthly on day 10');
  assert.equal(
    describeRule(rule({ frequency: 'daily', interval: 1 }, { untilProjectDone: true })),
    'Every day until the project is completed',
  );
});

test('presets match their own rules', () => {
  const presets = repeatPresets('2026-11-10');
  assert.deepEqual(presets.map((p) => p.label), ['Every day', 'Every weekday (Mon–Fri)', 'Every Tuesday', 'Monthly on day 10']);
  const weekly = normalizePattern(presets[2].pattern, '2026-11-10');
  assert.ok(samePattern(weekly, presets[2].pattern));
  assert.ok(!samePattern(weekly, presets[1].pattern));
});

test('project progress counts only project subtasks', () => {
  const project = { status: 'active', priority: 2 };
  assert.deepEqual(projectProgress(project, []), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(projectProgress({ status: 'completed' }, []).percent, 100);
  const subtasks = [{ status: 'done' }, { status: 'open' }, { status: 'done' }];
  assert.deepEqual(projectProgress(project, subtasks), { done: 2, total: 3, percent: 67 });
  assert.equal(projectSubtaskPriority({ priority: null }, project), 2);
  assert.equal(projectSubtaskPriority({ priority: 4 }, project), 4);
});
