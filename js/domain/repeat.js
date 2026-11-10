// Recurrence commands: turning tasks into series, generating occurrences,
// editing and ending series.
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { addDays, todayKey } from '../utils/dates.js';
import { nextOrder } from './ordering.js';
import { normalizePattern, occurrenceKey, plannedOccurrences } from './recurrence.js';
import { STATUS, containerTasks, isGroupVisibleOn } from './taskQueries.js';
import { taskRecord } from './taskRecord.js';

// Fields copied from a series to each new occurrence. Edits to these fields on
// an occurrence also apply to the series and its later open occurrences.
export const TEMPLATE_FIELDS = ['title', 'description', 'priority', 'categoryId', 'executionTime', 'estimatedDuration'];

export function getRule(id) {
  return id ? store.get('recurrenceRules', id) : null;
}

const pick = (source, fields) => Object.fromEntries(fields.filter((f) => f in source).map((f) => [f, source[f]]));

function reusableGroupId(groupId) {
  const group = groupId ? store.get('groups', groupId) : null;
  return group?.type === 'reusable' ? group.id : null;
}

function buildOccurrence(rule, date, tasks, groups) {
  const group = rule.groupId ? store.get('groups', rule.groupId) : null;
  const groupId = group && isGroupVisibleOn(group, date) ? group.id : null;
  return taskRecord({
    ...pick(rule, TEMPLATE_FIELDS),
    id: occurrenceKey(rule.id, date),
    scheduledDate: date,
    occurrenceDate: date,
    recurrenceRuleId: rule.id,
    projectId: rule.projectId ?? null,
    groupId,
    manualOrder: nextOrder(containerTasks(tasks, groups, date, groupId)),
  });
}

// Creates any missing occurrences for the given dates. Safe to call on every
// render: existing occurrences (matched by rule + date) are never recreated.
export function ensureOccurrences(dates) {
  const rules = store.all('recurrenceRules');
  if (!rules.length) return;
  const tasks = store.all('tasks');
  const groups = store.all('groups');
  const created = [];
  for (const { rule, date } of plannedOccurrences(rules, tasks, dates)) {
    const occurrence = buildOccurrence(rule, date, [...tasks, ...created], groups);
    // A detached former occurrence may still hold this id: never overwrite it.
    if (!store.get('tasks', occurrence.id)) created.push(occurrence);
  }
  if (created.length) store.put('tasks', created).catch(() => {});
}

// Removes open, untouched occurrences after `afterDate` so they can be
// regenerated from the updated series. Completed or skipped ones are history.
async function pruneOccurrences(ruleId, afterDate, keepId = null) {
  const tasks = store.all('tasks');
  const withSubtasks = new Set(tasks.filter((t) => t.parentTaskId).map((t) => t.parentTaskId));
  const doomed = tasks.filter(
    (t) =>
      t.recurrenceRuleId === ruleId &&
      t.occurrenceDate > afterDate &&
      t.status === STATUS.OPEN &&
      t.id !== keepId &&
      !withSubtasks.has(t.id),
  );
  await store.remove(
    'tasks',
    doomed.map((t) => t.id),
  );
}

// Makes `task` repeat, or changes the pattern of the series it belongs to.
export async function setRepeat(taskId, pattern, { untilProjectDone } = {}) {
  const task = store.get('tasks', taskId);
  if (!task || task.parentTaskId || !task.scheduledDate) return;
  const now = nowIso();

  const existing = getRule(task.recurrenceRuleId);
  if (existing) {
    await store.put('recurrenceRules', {
      ...existing,
      ...normalizePattern(pattern, existing.startDate),
      untilProjectDone: untilProjectDone ?? existing.untilProjectDone,
      updatedAt: now,
    });
    const from = task.occurrenceDate > todayKey() ? task.occurrenceDate : todayKey();
    await pruneOccurrences(existing.id, from, task.id);
    return;
  }

  const startDate = task.scheduledDate;
  const rule = {
    id: createId(),
    ...pick(task, TEMPLATE_FIELDS),
    groupId: reusableGroupId(task.groupId),
    projectId: task.projectId ?? null,
    ...normalizePattern(pattern, startDate),
    startDate,
    endDate: null,
    untilProjectDone: !!untilProjectDone && !!task.projectId,
    createdAt: now,
    updatedAt: now,
  };
  // The task itself becomes the first occurrence. Both records are written in
  // the same tick: a render in between would see the rule without its first
  // occurrence and generate a duplicate for that date.
  await Promise.all([
    store.put('tasks', { ...task, recurrenceRuleId: rule.id, occurrenceDate: startDate, updatedAt: now }),
    store.put('recurrenceRules', rule),
  ]);
}

// Ends the series. Past and current occurrences stay as history; `task` itself
// becomes an ordinary one-off task.
export async function stopRepeating(taskId) {
  const task = store.get('tasks', taskId);
  const rule = getRule(task?.recurrenceRuleId);
  if (!task || !rule) return;
  const today = todayKey();
  const endDate = task.occurrenceDate >= today ? addDays(task.occurrenceDate, -1) : today;
  const now = nowIso();
  const stillUsed = store.all('tasks').some((t) => t.recurrenceRuleId === rule.id && t.id !== task.id);
  // Detach the task and end the rule in the same tick, so no render sees an
  // active rule without this date's occurrence and regenerates it.
  await Promise.all([
    store.put('tasks', { ...task, recurrenceRuleId: null, occurrenceDate: null, updatedAt: now }),
    stillUsed ? store.put('recurrenceRules', { ...rule, endDate, updatedAt: now }) : store.remove('recurrenceRules', rule.id),
  ]);
  await pruneOccurrences(rule.id, endDate, task.id);
  // Pruning may have removed the last occurrence; an ended, unused rule is dropped.
  if (stillUsed && !store.all('tasks').some((t) => t.recurrenceRuleId === rule.id)) {
    await store.remove('recurrenceRules', rule.id);
  }
}

// Applies template-field edits made on one occurrence to its series and to the
// series' later open occurrences ("this and following").
export async function applyTemplateChange(task, patch) {
  const rule = getRule(task.recurrenceRuleId);
  const template = pick(patch, TEMPLATE_FIELDS);
  if (!rule || !Object.keys(template).length) return;
  const now = nowIso();
  await store.put('recurrenceRules', { ...rule, ...template, updatedAt: now });
  const later = store
    .all('tasks')
    .filter((t) => t.recurrenceRuleId === rule.id && t.id !== task.id && t.occurrenceDate > task.occurrenceDate && t.status === STATUS.OPEN)
    .map((t) => ({ ...t, ...template, updatedAt: now }));
  await store.put('tasks', later);
}

export async function setRuleGroup(ruleId, groupId) {
  const rule = getRule(ruleId);
  if (!rule) return;
  await store.put('recurrenceRules', { ...rule, groupId: reusableGroupId(groupId), updatedAt: nowIso() });
}

// "Repeat until the project is completed" series end when the project does.
export async function endProjectSeries(projectId, { includeAll = false } = {}) {
  const today = todayKey();
  const now = nowIso();
  for (const rule of store.all('recurrenceRules')) {
    if (rule.projectId !== projectId || (!rule.untilProjectDone && !includeAll)) continue;
    if (rule.endDate && rule.endDate <= today) continue;
    await store.put('recurrenceRules', { ...rule, endDate: today, updatedAt: now });
    await pruneOccurrences(rule.id, today);
  }
}
