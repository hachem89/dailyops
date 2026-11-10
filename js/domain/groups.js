// Groups are organizational containers on a day. Reusable groups appear on
// every date; day-specific groups belong to a single date.
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { nextOrder, reassignSlots } from './ordering.js';
import { forgetCollapsed } from './settings.js';
import { containerTasks } from './taskQueries.js';

export const GROUP_TYPES = { REUSABLE: 'reusable', DAY: 'day' };

export function createGroup({ name, type, date }) {
  const createdAt = nowIso();
  const group = {
    id: createId(),
    name: name.trim(),
    type: type === GROUP_TYPES.DAY ? GROUP_TYPES.DAY : GROUP_TYPES.REUSABLE,
    associatedDate: type === GROUP_TYPES.DAY ? date : null,
    manualOrder: nextOrder(store.all('groups')),
    createdAt,
    updatedAt: createdAt,
  };
  return store.put('groups', group).then(() => group);
}

export function updateGroup(id, patch) {
  const group = store.get('groups', id);
  if (!group) return Promise.resolve();
  return store.put('groups', { ...group, ...patch, updatedAt: nowIso() });
}

// Deleting a group never deletes tasks: they move to the end of the default
// container on their own date, keeping all their information.
export async function deleteGroup(id) {
  const tasks = store.all('tasks');
  const groups = store.all('groups').filter((g) => g.id !== id);
  const updatedAt = nowIso();
  const byDate = new Map();
  tasks
    .filter((t) => t.groupId === id && !t.parentTaskId)
    .forEach((t) => {
      if (!byDate.has(t.scheduledDate)) byDate.set(t.scheduledDate, []);
      byDate.get(t.scheduledDate).push(t);
    });

  const updates = [];
  for (const [date, moved] of byDate) {
    const existing = containerTasks(
      tasks.filter((t) => t.groupId !== id),
      groups,
      date,
      null,
    );
    let order = nextOrder(existing);
    moved
      .sort((a, b) => (a.manualOrder ?? 0) - (b.manualOrder ?? 0))
      .forEach((t) => updates.push({ ...t, groupId: null, manualOrder: order++, updatedAt }));
  }
  await store.put('tasks', updates);
  await store.remove('groups', id);
  await forgetCollapsed([`group:${id}`]);
}

// `orderedIds` are the groups visible on one date, in their new order.
export function arrangeGroups(orderedIds) {
  const groups = orderedIds.map((id) => store.get('groups', id)).filter(Boolean);
  const orders = reassignSlots(groups, orderedIds);
  const updatedAt = nowIso();
  const updates = groups
    .filter((g) => g.manualOrder !== orders.get(g.id))
    .map((g) => ({ ...g, manualOrder: orders.get(g.id), updatedAt }));
  return store.put('groups', updates);
}
