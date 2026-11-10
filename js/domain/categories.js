// Categories describe what a task is about. They never change task behaviour.
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { nextOrder, sortByOrder } from './ordering.js';
import { getSetting, setSetting } from './settings.js';

export const CATEGORY_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

const DEFAULT_CATEGORIES = [
  ['Study & Learning', 'blue'],
  ['Quran & Spirituality', 'green'],
  ['Sports & Health', 'orange'],
  ['Career & Applications', 'purple'],
  ['Projects', 'brown'],
  ['Personal', 'pink'],
];

export function listCategories() {
  return sortByOrder(store.all('categories'));
}

export function categoryMap() {
  return new Map(store.all('categories').map((c) => [c.id, c]));
}

// Seeds the suggested categories once. Deleting them later never re-seeds.
export async function seedDefaultCategories() {
  if (getSetting('seededDefaults')) return;
  const createdAt = nowIso();
  const records = DEFAULT_CATEGORIES.map(([name, color], index) => ({
    id: createId(),
    name,
    color,
    manualOrder: index,
    createdAt,
    updatedAt: createdAt,
  }));
  await store.put('categories', records);
  await setSetting('seededDefaults', true);
}

export function createCategory(name, color = 'gray') {
  const createdAt = nowIso();
  const category = {
    id: createId(),
    name: name.trim(),
    color: CATEGORY_COLORS.includes(color) ? color : 'gray',
    manualOrder: nextOrder(store.all('categories')),
    createdAt,
    updatedAt: createdAt,
  };
  return store.put('categories', category).then(() => category);
}

export function updateCategory(id, patch) {
  const category = store.get('categories', id);
  if (!category) return Promise.resolve();
  return store.put('categories', { ...category, ...patch, updatedAt: nowIso() });
}

// Tasks keep everything else; they simply become uncategorized.
export async function deleteCategory(id) {
  const updatedAt = nowIso();
  const affected = store
    .all('tasks')
    .filter((t) => t.categoryId === id)
    .map((t) => ({ ...t, categoryId: null, updatedAt }));
  await store.put('tasks', affected);
  await store.remove('categories', id);
}
