// Pure global search over tasks, subtasks, projects and project subtasks.
import { diffDays } from '../utils/dates.js';
import { isTaskItem } from './taskQueries.js';

// Case- and accent-insensitive comparison.
const fold = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, ''); // combining marks: accents and Arabic diacritics

// Every word of the query must appear somewhere in the item. Title matches
// rank above matches in descriptions or notes.
function score(title, extra, query, words) {
  const t = fold(title);
  const all = `${t} ${fold(extra)}`;
  if (!words.every((w) => all.includes(w))) return 0;
  if (t.startsWith(query)) return 40;
  if (t.includes(` ${query}`)) return 30;
  if (t.includes(query)) return 25;
  if (words.every((w) => t.includes(w))) return 15;
  return 5;
}

const isOpenItem = (status) => status === 'open' || status === 'active' || status === 'on_hold';

// A repeating task appears once: the occurrence closest to today.
function oneOccurrencePerSeries(tasks, today) {
  const best = new Map();
  const others = [];
  for (const t of tasks) {
    if (!t.recurrenceRuleId || !t.scheduledDate || !today) {
      others.push(t);
      continue;
    }
    const current = best.get(t.recurrenceRuleId);
    const distance = Math.abs(diffDays(today, t.scheduledDate));
    if (!current || distance < current.distance) best.set(t.recurrenceRuleId, { task: t, distance });
  }
  return [...others, ...[...best.values()].map((b) => b.task)];
}

export function search({ tasks = [], projects = [], projectSubtasks = [] }, query, { limit = 40, today = null } = {}) {
  const q = fold(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const results = [];
  const add = (kind, item, title, extra) => {
    const base = score(title, extra, q, words);
    if (!base) return;
    results.push({ kind, item, score: base + (isOpenItem(item.status) ? 3 : 0), updated: item.updatedAt || '' });
  };

  for (const t of oneOccurrencePerSeries(tasks, today)) {
    if (!isTaskItem(t)) continue;
    add(t.parentTaskId ? 'subtask' : 'task', t, t.title, `${t.description || ''} ${t.notes || ''}`);
  }
  for (const p of projects) add('project', p, p.name, p.description);
  for (const s of projectSubtasks) add('projectSubtask', s, s.title, s.description);

  return results
    .sort((a, b) => b.score - a.score || b.updated.localeCompare(a.updated))
    .slice(0, limit);
}
