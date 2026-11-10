// Pure analytics over local data. Nothing here touches storage, so every
// number on the dashboard can be reproduced in unit tests.
import { addDays, diffDays, parseDateKey } from '../utils/dates.js';
import { occurrenceKey, occursOn } from './recurrence.js';
import { STATUS, isTopLevel } from './taskQueries.js';

// ------------------------------------------------------------------ periods

export const PERIODS = { WEEK: 'week', MONTH: 'month' };

const mondayOf = (key) => addDays(key, -((parseDateKey(key).getDay() + 6) % 7));

export function periodRange(kind, anchor) {
  let start;
  let end;
  if (kind === PERIODS.MONTH) {
    start = `${anchor.slice(0, 7)}-01`;
    const [y, m] = anchor.split('-').map(Number);
    end = `${anchor.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  } else {
    start = mondayOf(anchor);
    end = addDays(start, 6);
  }
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { kind, start, end, days };
}

export function shiftPeriod(kind, anchor, delta) {
  if (kind === PERIODS.MONTH) {
    const [y, m] = anchor.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return addDays(anchor, 7 * delta);
}

const inRange = (date, range) => !!date && date >= range.start && date <= range.end;

// Category filter: null = everything, '' = uncategorized only, otherwise an id.
const matchesCategory = (categoryId, filter) => filter == null || (filter === '' ? !categoryId : categoryId === filter);

// ------------------------------------------------------- daily execution (A)

export function statusCounts(tasks) {
  const counts = { done: 0, open: 0, skipped: 0, cancelled: 0 };
  for (const t of tasks) {
    if (t.status === STATUS.DONE) counts.done++;
    else if (t.status === STATUS.SKIPPED) counts.skipped++;
    else if (t.status === STATUS.CANCELLED) counts.cancelled++;
    else counts.open++;
  }
  return counts;
}

// Completion rate = done / (done + incomplete). Cancelled tasks and skipped
// occurrences are reported separately and never count as completed.
export function completionRate({ done, open }) {
  return done + open ? done / (done + open) : null;
}

// Open tasks on future days are "planned", not incomplete. Future recurring
// occurrences are left out entirely: whether they exist yet depends only on
// which days have been viewed (habits are measured under consistency).
export function executionStats(tasks, range, today, { categoryId = null } = {}) {
  const scoped = tasks.filter(
    (t) =>
      isTopLevel(t) &&
      inRange(t.scheduledDate, range) &&
      matchesCategory(t.categoryId, categoryId) &&
      !(t.recurrenceRuleId && t.scheduledDate > today),
  );
  const planned = scoped.filter((t) => t.status === STATUS.OPEN && t.scheduledDate > today).length;
  const counts = statusCounts(scoped.filter((t) => !(t.status === STATUS.OPEN && t.scheduledDate > today)));
  const overdue = scoped.filter((t) => t.status === STATUS.OPEN && !t.recurrenceRuleId && t.scheduledDate < today).length;
  const missed = scoped.filter((t) => t.status === STATUS.OPEN && t.recurrenceRuleId && t.scheduledDate < today).length;
  const perDay = range.days.map((date) => {
    const day = statusCounts(scoped.filter((t) => t.scheduledDate === date));
    return { date, ...day, total: day.done + day.open };
  });
  return { ...counts, planned, overdue, missed, rate: completionRate(counts), perDay };
}

// ------------------------------------------------------- time allocation (B)

export function sessionMs(session, now = Date.now()) {
  if (session.end == null) return Math.max(0, now - session.start);
  return Math.max(0, session.duration ?? session.end - session.start);
}

export function trackedMs(sessions, { taskId, projectId }, now = Date.now()) {
  return sessions
    .filter((s) => (taskId ? s.taskId === taskId : s.projectId === projectId && !s.taskId))
    .reduce((sum, s) => sum + sessionMs(s, now), 0);
}

// What a session is "about": its task's (or parent task's) category and project.
export function sessionContext(session, tasksById) {
  const task = session.taskId ? tasksById.get(session.taskId) : null;
  const owner = task?.parentTaskId ? tasksById.get(task.parentTaskId) || task : task;
  return {
    task,
    categoryId: owner?.categoryId ?? null,
    projectId: session.projectId ?? owner?.projectId ?? null,
  };
}

function sumBy(entries) {
  const totals = new Map();
  for (const [key, ms] of entries) totals.set(key, (totals.get(key) || 0) + ms);
  return [...totals].map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms);
}

export function timeAllocation(sessions, tasksById, range, now = Date.now(), { categoryId = null } = {}) {
  const scoped = sessions
    .filter((s) => inRange(s.date, range))
    .map((s) => ({ s, ctx: sessionContext(s, tasksById), ms: sessionMs(s, now) }))
    .filter(({ ctx }) => matchesCategory(ctx.categoryId, categoryId));
  return {
    total: scoped.reduce((sum, e) => sum + e.ms, 0),
    byCategory: sumBy(scoped.map((e) => [e.ctx.categoryId, e.ms])),
    byProject: sumBy(scoped.filter((e) => e.ctx.projectId).map((e) => [e.ctx.projectId, e.ms])),
    byDay: range.days.map((date) => ({ date, ms: scoped.filter((e) => e.s.date === date).reduce((sum, e) => sum + e.ms, 0) })),
  };
}

// Tasks scheduled in the period that have an estimate, actual time, or both.
// Totals compare only tasks that have both, so the comparison is fair.
export function estimateVsActual(tasks, sessions, range, now = Date.now(), { categoryId = null } = {}) {
  const byTask = new Map();
  for (const s of sessions) if (s.taskId) byTask.set(s.taskId, (byTask.get(s.taskId) || 0) + sessionMs(s, now));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const rows = tasks
    .filter((t) => {
      const owner = t.parentTaskId ? tasksById.get(t.parentTaskId) : t;
      return owner && inRange(owner.scheduledDate, range) && matchesCategory(owner.categoryId, categoryId);
    })
    .map((t) => ({ task: t, estimateMs: t.estimatedDuration ? t.estimatedDuration * 60000 : null, actualMs: byTask.get(t.id) || 0 }))
    .filter((r) => r.estimateMs || r.actualMs);
  const both = rows.filter((r) => r.estimateMs && r.actualMs);
  return {
    rows: rows.sort((a, b) => b.actualMs - (b.estimateMs || 0) - (a.actualMs - (a.estimateMs || 0))),
    estimateMs: both.reduce((sum, r) => sum + r.estimateMs, 0),
    actualMs: both.reduce((sum, r) => sum + r.actualMs, 0),
    compared: both.length,
  };
}

// ----------------------------------------------------------- consistency (C)

// The state of one expected occurrence. Dates that were never opened have no
// record: before today they count as missed, today as pending.
function occurrenceState(record, date, today) {
  if (record?.status === STATUS.DONE) return 'done';
  if (record?.status === STATUS.SKIPPED || record?.status === STATUS.CANCELLED) return 'skipped';
  return date < today ? 'missed' : 'pending';
}

export function habitStats(rule, occurrences, range, today) {
  const records = new Map(occurrences.map((t) => [occurrenceKey(t.recurrenceRuleId, t.occurrenceDate), t]));
  const stateOn = (date) => occurrenceState(records.get(occurrenceKey(rule.id, date)), date, today);

  const history = range.days
    .filter((date) => date <= today && occursOn(rule, date))
    .map((date) => ({ date, state: stateOn(date) }));
  const count = (state) => history.filter((h) => h.state === state).length;
  const done = count('done');
  const missed = count('missed');

  // Streak: consecutive completed occurrences up to today. Skipped ones are
  // neutral and today's pending occurrence does not break it.
  let streak = 0;
  const earliest = rule.startDate;
  for (let date = today, guard = 0; date >= earliest && guard < 3660; date = addDays(date, -1), guard++) {
    if (!occursOn(rule, date)) continue;
    const state = stateOn(date);
    if (state === 'done') streak++;
    else if (state === 'missed') break;
  }

  return {
    rule,
    history,
    expected: history.length,
    done,
    missed,
    skipped: count('skipped'),
    pending: count('pending'),
    rate: done + missed ? done / (done + missed) : null,
    streak,
  };
}

// ---------------------------------------------------------- task insights (D)

export function postponementStats(tasks, { categoryId = null } = {}) {
  return tasks
    .filter((t) => isTopLevel(t) && (t.rescheduleHistory || []).length && matchesCategory(t.categoryId, categoryId))
    .map((t) => {
      const history = t.rescheduleHistory;
      return {
        task: t,
        moves: history.length,
        postponed: history.filter((h) => h.to > h.from).length,
        daysPushed: history.reduce((sum, h) => sum + Math.max(0, diffDays(h.from, h.to)), 0),
        originalDate: history[0].from,
      };
    })
    .sort((a, b) => b.postponed - a.postponed || b.moves - a.moves || b.daysPushed - a.daysPushed);
}

export function overdueWork(tasks, today, { categoryId = null } = {}) {
  return tasks
    .filter((t) => isTopLevel(t) && t.status === STATUS.OPEN && !t.recurrenceRuleId && t.scheduledDate && t.scheduledDate < today)
    .filter((t) => matchesCategory(t.categoryId, categoryId))
    .map((t) => ({ task: t, daysOverdue: diffDays(t.scheduledDate, today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
