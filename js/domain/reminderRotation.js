// Pure rotation logic for Islamic reminders.
//
// Items are grouped into pools by moment and context. Each pool is walked in a
// fixed order, one item at a time, so nothing repeats until the whole pool has
// been shown; then it starts again. Only the next index per pool is stored.

export const MOMENTS = { BEFORE: 'before', AFTER: 'after' };

// Context of a task, from its category name or project link.
export function themeForTask(task, category) {
  const name = (category?.name || '').toLowerCase();
  if (/study|learn|knowledge|course|exam|read|research|lesson/.test(name)) return 'knowledge';
  if (/career|work|job|application|project|business|client/.test(name) || task?.projectId) return 'work';
  return 'general';
}

export function poolKey(moment, theme = 'general') {
  return moment === MOMENTS.AFTER ? 'after' : `before:${theme}`;
}

export function poolItems(content, key) {
  if (key === 'after') return content.filter((i) => i.moment === MOMENTS.AFTER);
  if (key === 'daily') return content.filter((i) => i.moment === MOMENTS.BEFORE && i.type === 'quran');
  const before = content.filter((i) => i.moment === MOMENTS.BEFORE);
  if (key === 'before:knowledge') return before.filter((i) => i.themes.includes('knowledge'));
  if (key === 'before:work') return before.filter((i) => i.themes.includes('work') || i.themes.includes('rizq'));
  return before;
}

// Returns the next item of a pool and the updated rotation state.
export function takeNext(state, key, content) {
  const items = poolItems(content, key);
  if (!items.length) return { item: null, state };
  const index = Number.isInteger(state?.[key]) && state[key] >= 0 ? state[key] : 0;
  return { item: items[index % items.length], state: { ...state, [key]: (index + 1) % items.length } };
}
