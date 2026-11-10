// Actions available on any task row, wherever it is rendered.
import { addDays, todayKey } from '../../utils/dates.js';
import { STATUS } from '../../domain/taskQueries.js';
import { toggleCollapsed } from '../../domain/settings.js';
import {
  createTask,
  deleteTask,
  getTask,
  rescheduleTask,
  restoreTasks,
  setStatus,
  toggleComplete,
} from '../../domain/tasks.js';
import { stopRepeating } from '../../domain/repeat.js';
import { registerActions, ui } from '../actions.js';
import { navigate } from '../router.js';
import { openMenu } from './menu.js';
import { toast } from './toast.js';
import { composer } from './taskRow.js';

export async function deleteWithUndo(id) {
  const task = getTask(id);
  if (!task) return;
  const removed = await deleteTask(id);
  const extra = removed.length - 1;
  toast(`Deleted “${task.title}”${extra ? ` and ${extra} subtask${extra === 1 ? '' : 's'}` : ''}`, {
    actionLabel: 'Undo',
    onAction: () => restoreTasks(removed),
    duration: 7000,
  });
}

export async function stopRepeatingWithNotice(id) {
  await stopRepeating(id);
  toast('Stopped repeating. Past occurrences are kept as history.');
}

export function startSubtaskComposer(taskId) {
  composer.taskId = taskId;
  ui.render();
  requestAnimationFrame(() => {
    document.querySelector(`#main [data-focus-key="addsub:${CSS.escape(taskId)}"]`)?.focus();
  });
}

function taskMenuItems(task) {
  const today = todayKey();
  const isSub = !!task.parentTaskId;
  const tomorrow = addDays(today, 1);
  return [
    { label: 'Open details', icon: 'edit', onSelect: () => ui.openTask(task.id) },
    !isSub && { label: 'Add subtask', icon: 'subtask', onSelect: () => startSubtaskComposer(task.id) },
    !isSub && { separator: true },
    !isSub &&
      task.scheduledDate !== today && { label: 'Move to today', icon: 'today', onSelect: () => rescheduleTask(task.id, today) },
    !isSub &&
      task.scheduledDate !== tomorrow && {
        label: 'Move to tomorrow',
        icon: 'arrowRight',
        onSelect: () => rescheduleTask(task.id, tomorrow),
      },
    task.projectId && { label: 'Open project', icon: 'projects', onSelect: () => navigate(`#/projects/${task.projectId}`) },
    { separator: true },
    ...(task.recurrenceRuleId
      ? [
          task.status === STATUS.SKIPPED
            ? { label: 'Undo skip', icon: 'undo', onSelect: () => setStatus(task.id, STATUS.OPEN) }
            : task.status === STATUS.OPEN && { label: 'Skip this time', icon: 'skip', onSelect: () => setStatus(task.id, STATUS.SKIPPED) },
          { label: 'Stop repeating', icon: 'repeat', onSelect: () => stopRepeatingWithNotice(task.id) },
        ]
      : [
          task.status === STATUS.CANCELLED
            ? { label: 'Restore task', icon: 'undo', onSelect: () => setStatus(task.id, STATUS.OPEN) }
            : { label: 'Cancel task', icon: 'ban', onSelect: () => setStatus(task.id, STATUS.CANCELLED) },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => deleteWithUndo(task.id) },
        ]),
  ];
}

registerActions({
  'toggle-task': (el) => toggleComplete(el.dataset.id),
  'open-task': (el) => ui.openTask(el.dataset.id),
  'move-today': (el) => rescheduleTask(el.dataset.id, todayKey()),
  'toggle-section': (el) => toggleCollapsed(el.dataset.key),
  'cancel-task': (el) => setStatus(el.dataset.id, STATUS.CANCELLED),
  'restore-task': (el) => setStatus(el.dataset.id, STATUS.OPEN),
  'skip-task': (el) => setStatus(el.dataset.id, STATUS.SKIPPED),
  'delete-task': (el) => deleteWithUndo(el.dataset.id),
  'task-menu': (el) => {
    const task = getTask(el.dataset.id);
    if (task) openMenu(el, taskMenuItems(task));
  },
  'add-subtask': async (form) => {
    const input = form.elements.title;
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    await createTask({ title, parentTaskId: form.dataset.parent });
  },
});

// Close an empty subtask composer once focus leaves it.
document.addEventListener('focusout', (event) => {
  if (!composer.taskId || !event.target.matches?.('[data-focus-key^="addsub:"]')) return;
  setTimeout(() => {
    const active = document.activeElement;
    if (active?.matches?.('[data-focus-key^="addsub:"]')) return;
    if (event.target.value.trim()) return;
    composer.taskId = null;
    ui.render();
  }, 0);
});
