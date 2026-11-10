// Manual ordering helpers. `manualOrder` is a per-container integer that only
// changes when the user reorders. Priority never influences it.

export function byOrder(a, b) {
  return (
    (a.manualOrder ?? 0) - (b.manualOrder ?? 0) ||
    String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  );
}

export function sortByOrder(items) {
  return [...items].sort(byOrder);
}

export function nextOrder(items) {
  return items.reduce((max, item) => Math.max(max, item.manualOrder ?? 0), -1) + 1;
}

// Returns the ids of `orderedIds` with `id` inserted at `index` (clamped).
export function insertAt(orderedIds, id, index) {
  const ids = orderedIds.filter((existing) => existing !== id);
  const at = Math.max(0, Math.min(index, ids.length));
  ids.splice(at, 0, id);
  return ids;
}

// Moves `id` one step up (-1) or down (+1). Returns null if it cannot move.
export function shiftId(orderedIds, id, delta) {
  const from = orderedIds.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= orderedIds.length) return null;
  return insertAt(orderedIds, id, to);
}

// Assigns orders to a subset of a globally ordered collection while keeping
// the subset's existing order "slots", so items outside the subset keep their
// relative positions. Returns Map<id, newOrder>.
export function reassignSlots(items, orderedIds) {
  const slots = items.map((item) => item.manualOrder ?? 0).sort((a, b) => a - b);
  const unique = slots.every((slot, i) => i === 0 || slot !== slots[i - 1]);
  const result = new Map();
  orderedIds.forEach((id, i) => result.set(id, unique ? slots[i] : i));
  return result;
}
