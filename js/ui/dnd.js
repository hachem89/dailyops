// Pointer-based drag and drop (works with mouse, pen and touch).
//
// Markup contract:
//   draggable item:  data-drag-item="<type>" data-id="…" [data-drag-scope="…"]
//   its handle:      data-drag-handle
//   drop list:       data-drop-zone="<type>" data-zone-id="…" [data-drop-scope="…"]
//                    (items of that type are its direct children)
//   header target:   data-drop-zone="<type>" data-zone-id="…" data-drop-position="start|end"
//   date target:     data-drop-zone="task" data-drop-position="date" data-drop-date="YYYY-MM-DD"
//
// onDrop receives { type, id, zoneId, orderedIds } where orderedIds is the full
// new order of the target list, or null to append to a list that is not rendered
// (a collapsed group); or { type, id, date } when dropped on a date target.
import { shiftId, insertAt } from '../domain/ordering.js';

const START_DISTANCE = 4;
const EDGE = 56;

export function enableSortable(root, { onDrop, scrollContainer }) {
  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || !root.contains(handle) || event.button !== 0) return;
    const item = handle.closest('[data-drag-item]');
    if (!item) return;
    startTracking(event, handle, item, { onDrop, scrollContainer: scrollContainer || root });
  });
}

function startTracking(downEvent, handle, item, { onDrop, scrollContainer }) {
  const type = item.dataset.dragItem;
  const scope = item.dataset.dragScope || '';
  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let dragging = false;
  let ghost = null;
  let indicator = null;
  let highlighted = null;
  let target = null;
  let pointer = { x: startX, y: startY };
  let scrollFrame = null;
  let offsetY = 0;

  try {
    handle.setPointerCapture?.(downEvent.pointerId);
  } catch {
    /* pointer already released; listeners on the handle still work for mouse */
  }

  const begin = () => {
    dragging = true;
    const rect = item.getBoundingClientRect();
    offsetY = startY - rect.top;
    ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.removeAttribute('data-drag-item');
    ghost.querySelectorAll('[data-focus-key]').forEach((el) => el.removeAttribute('data-focus-key'));
    document.body.append(ghost);
    indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    indicator.hidden = true;
    document.body.append(indicator);
    item.classList.add('dragging');
    document.body.classList.add('is-dragging');
    scrollLoop();
  };

  const clearHighlight = () => {
    highlighted?.classList.remove('drop-target');
    highlighted = null;
  };

  const locate = () => {
    ghost.style.top = `${pointer.y - offsetY}px`;
    const under = document.elementFromPoint(pointer.x, pointer.y);
    const zone = under?.closest(`[data-drop-zone="${type}"]`);
    clearHighlight();
    indicator.hidden = true;
    target = null;
    if (!zone || (zone.dataset.dropScope || '') !== scope) return;

    if (zone.dataset.dropPosition) {
      zone.classList.add('drop-target');
      highlighted = zone;
      target = { zone, position: zone.dataset.dropPosition };
      return;
    }

    const siblings = [...zone.children].filter((child) => child.dataset.dragItem === type && child !== item);
    let index = siblings.findIndex((sibling) => {
      const r = sibling.getBoundingClientRect();
      return pointer.y < r.top + r.height / 2;
    });
    if (index === -1) index = siblings.length;
    target = { zone, index, siblings };

    const zoneRect = zone.getBoundingClientRect();
    let y;
    if (siblings.length === 0) y = zoneRect.top + 2;
    else if (index < siblings.length) y = siblings[index].getBoundingClientRect().top - 1;
    else y = siblings[siblings.length - 1].getBoundingClientRect().bottom;
    indicator.style.left = `${zoneRect.left}px`;
    indicator.style.width = `${zoneRect.width}px`;
    indicator.style.top = `${y}px`;
    indicator.hidden = false;
  };

  const scrollLoop = () => {
    if (!dragging) return;
    const rect = scrollContainer.getBoundingClientRect();
    let delta = 0;
    if (pointer.y < rect.top + EDGE) delta = -Math.ceil((rect.top + EDGE - pointer.y) / 6);
    else if (pointer.y > rect.bottom - EDGE) delta = Math.ceil((pointer.y - (rect.bottom - EDGE)) / 6);
    if (delta) {
      scrollContainer.scrollTop += delta;
      locate();
    }
    scrollFrame = requestAnimationFrame(scrollLoop);
  };

  const onMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!dragging) {
      if (Math.hypot(pointer.x - startX, pointer.y - startY) < START_DISTANCE) return;
      begin();
    }
    event.preventDefault();
    locate();
  };

  const finish = (commit) => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey, true);
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(scrollFrame);
    ghost.remove();
    indicator.remove();
    clearHighlight();
    item.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    if (commit && target) {
      onDrop(resolveDrop(target, item, type));
    }
  };

  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      finish(false);
    }
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey, true);
}

function resolveDrop(target, item, type) {
  const id = item.dataset.id;
  if (target.zone.dataset.dropDate) return { type, id, date: target.zone.dataset.dropDate };
  const zoneId = target.zone.dataset.zoneId || null;
  if (target.position) {
    // Header target: insert at the start of the rendered list, or append if collapsed.
    const list = document.querySelector(
      `[data-drop-zone="${type}"][data-zone-id="${CSS.escape(target.zone.dataset.zoneId || '')}"]:not([data-drop-position])`,
    );
    if (!list || target.position === 'end') return { type, id, zoneId, orderedIds: null };
    const ids = [...list.children].filter((c) => c.dataset.dragItem === type).map((c) => c.dataset.id);
    return { type, id, zoneId, orderedIds: insertAt(ids, id, 0) };
  }
  const ids = target.siblings.map((sibling) => sibling.dataset.id);
  return { type, id, zoneId, orderedIds: insertAt(ids, id, target.index) };
}

// Alt+ArrowUp / Alt+ArrowDown reordering for keyboard users.
export function moveWithKeyboard(item, delta) {
  const zone = item.parentElement;
  if (!zone?.dataset.dropZone) return null;
  const type = item.dataset.dragItem;
  const ids = [...zone.children].filter((c) => c.dataset.dragItem === type).map((c) => c.dataset.id);
  const orderedIds = shiftId(ids, item.dataset.id, delta);
  if (!orderedIds) return null;
  return { type, id: item.dataset.id, zoneId: zone.dataset.zoneId || null, orderedIds };
}
