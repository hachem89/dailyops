// Task details panel. Text fields save on change (blur/Enter); the panel does
// not re-render while the user is typing in it, so nothing is interrupted.
import * as store from '../../core/store.js';
import { h, autoGrow, captureFocus, restoreFocus } from '../../utils/dom.js';
import { formatTimestamp, formatFriendlyDate, isDateKey, isTimeValue, todayKey, formatShortDate } from '../../utils/dates.js';
import { deadlineLabel, deadlineStatus } from '../../domain/deadlines.js';
import { PRIORITIES, effectivePriority, priorityInfo } from '../../domain/priorities.js';
import { categoryMap, listCategories } from '../../domain/categories.js';
import { getSetting } from '../../domain/settings.js';
import { STATUS, isOverdue, subtasksOf, visibleGroupsForDate } from '../../domain/taskQueries.js';
import { getTask, moveTaskToGroupEnd, rescheduleTask, updateTask } from '../../domain/tasks.js';
import { FREQ, WEEKDAYS_SHORT, describeRule, normalizePattern, repeatPresets, samePattern } from '../../domain/recurrence.js';
import { getRule, setRepeat } from '../../domain/repeat.js';
import { registerActions, ui } from '../actions.js';
import { formDialog } from './dialog.js';
import { stopRepeatingWithNotice } from './taskActions.js';
import { toast } from './toast.js';
import { enableSortable } from '../dnd.js';
import { icon } from '../icons.js';
import { renderSubtaskList } from './taskRow.js';
import { renderTimeSection } from './timeSection.js';

let currentId = null;
let deferred = false;
let returnFocus = null;

const root = () => document.getElementById('drawer');
const scrim = () => document.getElementById('scrim');

export function currentTaskId() {
  return currentId;
}

function isEditing() {
  const active = document.activeElement;
  // Only the task's own fields defer re-rendering; the subtask composer is
  // restored by focus key like any other input.
  return !!active && root().contains(active) && active.matches('[data-field]');
}

export function openTask(id) {
  if (!getTask(id)) return;
  if (!currentId) returnFocus = document.activeElement;
  currentId = id;
  deferred = false;
  // Visible before rendering so the title can measure its height.
  root().hidden = false;
  render();
  scrim().classList.add('visible');
  root().scrollTop = 0;
  root().focus({ preventScroll: true });
}

export function closeDrawer() {
  if (!currentId) return false;
  // Blurring commits a pending text change before the panel disappears.
  if (root().contains(document.activeElement)) document.activeElement.blur();
  currentId = null;
  root().hidden = true;
  root().replaceChildren();
  scrim().classList.remove('visible');
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
  return true;
}

export function refreshDrawer() {
  if (!currentId) return;
  if (!getTask(currentId)) {
    closeDrawer();
    return;
  }
  if (isEditing()) {
    deferred = true;
    return;
  }
  render();
}

function option(value, label, selected) {
  return h('option', { value, selected }, label);
}

function clearButton(field, label) {
  return h(
    'button',
    { type: 'button', class: 'icon-btn sm', 'aria-label': `Clear ${label}`, title: `Clear ${label}`, dataset: { action: 'clear-field', field } },
    icon('close'),
  );
}

function repeatField(task) {
  const rule = getRule(task.recurrenceRuleId);
  const presets = repeatPresets(rule?.startDate || task.scheduledDate);
  const matched = rule ? presets.find((p) => samePattern(rule, normalizePattern(p.pattern, rule.startDate))) : null;
  const select = h(
    'select',
    { class: 'select', id: 'f-repeat', dataset: { action: 'set-repeat', id: task.id, focusKey: 'd:repeat' } },
    option('none', 'Does not repeat', !rule),
    presets.map((p) => option(p.id, p.label, matched?.id === p.id)),
    rule && !matched ? option('current', describeRule({ ...rule, untilProjectDone: false }), true) : null,
    option('custom', 'Custom…', false),
  );
  const fields = [h('label', { for: 'f-repeat' }, icon('repeat'), 'Repeat'), select];
  if (rule) {
    fields.push(
      h(
        'span',
        { class: 'hint faint' },
        rule.untilProjectDone ? 'Until the project is completed. ' : '',
        'Changes to title, priority, category, time, estimate and description also apply to later occurrences.',
      ),
    );
  }
  return fields;
}

async function customRepeat(task) {
  const rule = getRule(task.recurrenceRuleId);
  const base = rule || normalizePattern({ frequency: FREQ.WEEKLY }, task.scheduledDate);
  const values = await formDialog({
    title: 'Custom repeat',
    submitLabel: 'Save',
    fields: [
      { name: 'interval', type: 'number', label: 'Every', value: base.interval || 1, min: 1, max: 365 },
      {
        name: 'frequency',
        type: 'select',
        label: 'Unit',
        value: base.frequency,
        options: [
          { value: FREQ.DAILY, label: 'Day(s)' },
          { value: FREQ.WEEKLY, label: 'Week(s)' },
          { value: FREQ.MONTHLY, label: 'Month(s)' },
        ],
      },
      {
        name: 'weekdays',
        type: 'checkboxes',
        label: 'On (weekly only)',
        value: (base.weekdays || []).map(String),
        options: [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAYS_SHORT[d] })),
      },
      {
        name: 'monthDay',
        type: 'number',
        label: 'Day of month (monthly only)',
        value: base.monthDay || Number(task.scheduledDate.slice(8, 10)),
        min: 1,
        max: 31,
        hint: 'Days past the end of a month fall on its last day.',
      },
    ],
  });
  if (!values) return false;
  await setRepeat(task.id, {
    frequency: values.frequency,
    interval: Number(values.interval),
    weekdays: values.weekdays.map(Number),
    monthDay: Number(values.monthDay),
  });
  return true;
}

function render() {
  const task = getTask(currentId);
  const el = root();
  const focus = captureFocus(el);
  const scrollTop = el.scrollTop;
  const parent = task.parentTaskId ? getTask(task.parentTaskId) : null;
  const today = todayKey();
  const now = new Date();
  const isSub = !!parent;
  const tasks = store.all('tasks');
  const subtasks = isSub ? [] : subtasksOf(tasks, task.id);
  const done = task.status === STATUS.DONE;
  const cancelled = task.status === STATUS.CANCELLED || task.status === STATUS.SKIPPED;

  const priorityField = h(
    'select',
    { class: 'select', id: 'f-priority', dataset: { field: 'priority', focusKey: 'd:priority' } },
    isSub ? option('', `Inherit (${priorityInfo(effectivePriority({}, parent)).label})`, task.priority == null) : null,
    PRIORITIES.map((p) => option(String(p.value), `${p.label} — ${p.name}`, task.priority === p.value)),
  );

  const props = [
    h('label', { for: 'f-priority' }, icon('flag'), 'Priority'),
    priorityField,
  ];

  if (!isSub) {
    const groups = visibleGroupsForDate(store.all('groups'), task.scheduledDate);
    props.push(
      h('label', { for: 'f-category' }, icon('tag'), 'Category'),
      h(
        'select',
        { class: 'select', id: 'f-category', dataset: { field: 'categoryId', focusKey: 'd:category' } },
        option('', 'None', !task.categoryId),
        listCategories().map((c) => option(c.id, c.name, c.id === task.categoryId)),
      ),
      h('label', { for: 'f-group' }, icon('layers'), 'Group'),
      h(
        'select',
        { class: 'select', id: 'f-group', dataset: { field: 'groupId', focusKey: 'd:group' } },
        option('', 'Tasks (no group)', !groups.some((g) => g.id === task.groupId)),
        groups.map((g) => option(g.id, g.type === 'day' ? `${g.name} (this day only)` : g.name, g.id === task.groupId)),
      ),
      h('label', { for: 'f-date' }, icon('calendar'), 'Scheduled'),
      h('input', {
        class: 'input',
        type: 'date',
        id: 'f-date',
        required: true,
        value: task.scheduledDate || '',
        dataset: { field: 'scheduledDate', focusKey: 'd:date' },
      }),
    );
    if (isOverdue(task, today)) {
      props.push(h('span', { class: 'hint chip-overdue' }, `Overdue since ${formatFriendlyDate(task.scheduledDate, today)}`));
    }
    props.push(...repeatField(task));
    const project = task.projectId ? store.get('projects', task.projectId) : null;
    if (project) {
      props.push(
        h('label', null, icon('projects'), 'Project'),
        h(
          'div',
          { class: 'inline' },
          h('a', { class: 'link', href: `#/projects/${project.id}`, dataset: { action: 'close-drawer' } }, project.name),
          h('span', { class: 'faint', style: { fontSize: '12.5px' } }, task.projectSubtaskId ? '· project subtask' : '· project work'),
        ),
        h(
          'span',
          { class: 'hint faint' },
          task.projectSubtaskId
            ? 'Completing this task completes the project subtask.'
            : 'Completing this task does not complete the project.',
        ),
      );
    }
  }

  props.push(
    h('label', { for: 'f-time' }, icon('clock'), 'Start time'),
    h(
      'div',
      { class: 'inline' },
      h('input', {
        class: 'input',
        type: 'time',
        id: 'f-time',
        value: task.executionTime || '',
        dataset: { field: 'executionTime', focusKey: 'd:time' },
      }),
      task.executionTime ? clearButton('executionTime', 'start time') : null,
    ),
    h('label', { for: 'f-deadline' }, icon('deadline'), 'Deadline'),
    h(
      'div',
      { class: 'inline' },
      h('input', {
        class: 'input',
        type: 'date',
        id: 'f-deadline',
        value: task.deadline || '',
        dataset: { field: 'deadline', focusKey: 'd:deadline' },
      }),
      h('input', {
        class: 'input',
        type: 'time',
        'aria-label': 'Deadline time (optional)',
        value: task.deadlineTime || '',
        disabled: !task.deadline,
        style: { maxWidth: '120px' },
        dataset: { field: 'deadlineTime', focusKey: 'd:deadlineTime' },
      }),
      task.deadline ? clearButton('deadline', 'deadline') : null,
    ),
  );
  if (task.deadline) {
    const status = done || cancelled ? 'normal' : deadlineStatus(task.deadline, task.deadlineTime, now);
    props.push(h('span', { class: `hint chip chip-deadline-${status}` }, deadlineLabel(task.deadline, task.deadlineTime, now)));
  }
  props.push(
    h('label', { for: 'f-estimate' }, icon('timer'), 'Estimate'),
    h(
      'div',
      { class: 'inline' },
      h('input', {
        class: 'input',
        type: 'number',
        id: 'f-estimate',
        min: 1,
        max: 1440,
        step: 5,
        placeholder: 'Minutes',
        value: task.estimatedDuration ?? '',
        style: { maxWidth: '120px' },
        dataset: { field: 'estimatedDuration', focusKey: 'd:estimate' },
      }),
      h('span', { class: 'muted' }, 'min'),
    ),
  );

  const title = h('textarea', {
    class: 'drawer-title',
    rows: 1,
    maxlength: 500,
    'aria-label': 'Title',
    value: task.title,
    dataset: { field: 'title', focusKey: 'd:title' },
  });

  const history = task.rescheduleHistory || [];

  el.replaceChildren(
    h(
      'div',
      { class: 'drawer-head' },
      h(
        'div',
        { class: 'drawer-crumb' },
        isSub
          ? [
              'Subtask of ',
              h('button', { type: 'button', dataset: { action: 'open-task', id: parent.id } }, parent.title),
            ]
          : task.scheduledDate
            ? `Task · ${formatFriendlyDate(task.scheduledDate, today)}`
            : 'Task',
      ),
      h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': 'Close details', title: 'Close (Esc)', dataset: { action: 'close-drawer' } },
        icon('close'),
      ),
    ),
    h(
      'div',
      { class: 'drawer-body' },
      title,
      h(
        'div',
        { class: 'drawer-status' },
        cancelled
          ? h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'restore-task', id: task.id } }, icon('undo'), task.status === STATUS.SKIPPED ? 'Undo skip' : 'Restore')
          : h(
              'button',
              { type: 'button', class: done ? 'btn btn-sm' : 'btn btn-sm btn-primary', dataset: { action: 'toggle-task', id: task.id, focusKey: 'd:toggle' } },
              icon(done ? 'undo' : 'check'),
              done ? 'Mark incomplete' : 'Complete',
            ),
        !isSub && isOverdue(task, today)
          ? h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'move-today', id: task.id } }, icon('arrowRight'), 'Move to today')
          : null,
        task.recurrenceRuleId
          ? task.status === STATUS.OPEN
            ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'skip-task', id: task.id } }, icon('skip'), 'Skip this time')
            : null
          : !cancelled
            ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'cancel-task', id: task.id } }, icon('ban'), 'Cancel task')
            : null,
        task.recurrenceRuleId
          ? null
          : h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', dataset: { action: 'delete-task', id: task.id } }, icon('trash'), 'Delete'),
      ),
      h('div', { class: 'props' }, props),
      renderTimeSection({ type: 'task', id: task.id, estimateMinutes: task.estimatedDuration }, { keyPrefix: 'd:' }),
      h(
        'div',
        { class: 'drawer-section' },
        h('label', { class: 'field-label', for: 'f-description' }, 'Description'),
        h('textarea', {
          class: 'textarea',
          id: 'f-description',
          placeholder: 'What does done look like?',
          value: task.description || '',
          dataset: { field: 'description', focusKey: 'd:description' },
        }),
      ),
      h(
        'div',
        { class: 'drawer-section' },
        h('label', { class: 'field-label', for: 'f-notes' }, 'Notes'),
        h('textarea', {
          class: 'textarea',
          id: 'f-notes',
          placeholder: 'Links, references, thoughts…',
          value: task.notes || '',
          dataset: { field: 'notes', focusKey: 'd:notes' },
        }),
      ),
      !isSub
        ? h(
            'div',
            { class: 'drawer-section' },
            h('h3', null, `Subtasks${subtasks.length ? ` · ${subtasks.filter((s) => s.status === STATUS.DONE).length}/${subtasks.length}` : ''}`),
            done && subtasks.some((s) => s.status === STATUS.OPEN)
              ? h('p', { class: 'muted', style: { fontSize: '12.5px', marginBottom: '4px' } }, 'This task is complete; the open subtasks below are still pending.')
              : null,
            renderSubtaskList(task, subtasks, {
              today,
              now,
              categories: categoryMap(),
              subtasksOf: () => [],
              showTimes: getSetting('showExecutionTimes'),
              keyPrefix: 'd:',
            }),
          )
        : null,
      h(
        'div',
        { class: 'drawer-meta' },
        h('span', null, `Created ${formatTimestamp(task.createdAt)}`),
        h('span', null, `Updated ${formatTimestamp(task.updatedAt)}`),
        task.completedAt ? h('span', null, `Completed ${formatTimestamp(task.completedAt)}`) : null,
        task.cancelledAt ? h('span', null, `Cancelled ${formatTimestamp(task.cancelledAt)}`) : null,
        history.length
          ? h(
              'span',
              null,
              `Rescheduled ${history.length} time${history.length === 1 ? '' : 's'}`,
              h(
                'ul',
                { class: 'history-list' },
                history
                  .slice(-5)
                  .reverse()
                  .map((entry) =>
                    h('li', null, `${formatShortDate(entry.from, today)} → ${formatShortDate(entry.to, today)} (${formatTimestamp(entry.at)})`),
                  ),
              ),
            )
          : null,
      ),
    ),
  );
  autoGrow(title);
  el.scrollTop = scrollTop;
  restoreFocus(el, focus);
}

async function saveField(input) {
  const task = getTask(currentId);
  if (!task) return;
  const field = input.dataset.field;
  const raw = input.value;

  switch (field) {
    case 'title': {
      const value = raw.replace(/\s+/g, ' ').trim();
      if (!value) {
        input.value = task.title;
        return;
      }
      if (value !== task.title) await updateTask(task.id, { title: value });
      return;
    }
    case 'description':
    case 'notes':
      if (raw !== (task[field] || '')) await updateTask(task.id, { [field]: raw });
      return;
    case 'priority':
      await updateTask(task.id, { priority: raw === '' ? null : Number(raw) });
      return;
    case 'categoryId':
      await updateTask(task.id, { categoryId: raw || null });
      return;
    case 'groupId':
      await moveTaskToGroupEnd(task.id, raw || null, { updateSeries: true });
      return;
    case 'scheduledDate':
      if (isDateKey(raw)) await rescheduleTask(task.id, raw);
      else input.value = task.scheduledDate;
      return;
    case 'executionTime':
      await updateTask(task.id, { executionTime: isTimeValue(raw) ? raw : null });
      return;
    case 'deadline':
      await updateTask(task.id, isDateKey(raw) ? { deadline: raw } : { deadline: null, deadlineTime: null });
      return;
    case 'deadlineTime':
      await updateTask(task.id, { deadlineTime: isTimeValue(raw) ? raw : null });
      return;
    case 'estimatedDuration': {
      const minutes = Math.round(Number(raw));
      await updateTask(task.id, { estimatedDuration: raw !== '' && minutes > 0 ? Math.min(minutes, 1440) : null });
      return;
    }
  }
}

registerActions({
  'set-repeat': async (el) => {
    const task = getTask(el.dataset.id);
    if (!task) return;
    const value = el.value;
    el.blur();
    if (value === 'none') {
      if (task.recurrenceRuleId) await stopRepeatingWithNotice(task.id);
    } else if (value === 'custom') {
      if (!(await customRepeat(task))) ui.render();
    } else if (value !== 'current') {
      const base = getRule(task.recurrenceRuleId)?.startDate || task.scheduledDate;
      const preset = repeatPresets(base).find((p) => p.id === value);
      if (preset) {
        await setRepeat(task.id, preset.pattern);
        toast(`Repeats: ${preset.label}`);
      }
    }
  },
  'close-drawer': () => closeDrawer(),
  'clear-field': (el) => {
    const patch = el.dataset.field === 'deadline' ? { deadline: null, deadlineTime: null } : { [el.dataset.field]: null };
    return updateTask(currentId, patch);
  },
});

export function initDrawer({ onDrop }) {
  const el = root();
  el.tabIndex = -1;
  enableSortable(el, { onDrop });

  el.addEventListener('change', (event) => {
    if (event.target.dataset.field) saveField(event.target);
  });
  el.addEventListener('input', (event) => {
    if (event.target.classList.contains('drawer-title')) autoGrow(event.target);
  });
  el.addEventListener('keydown', (event) => {
    if (event.target.classList.contains('drawer-title') && event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  });
  el.addEventListener('focusout', () => {
    setTimeout(() => {
      if (deferred && currentId && !isEditing()) {
        deferred = false;
        render();
      }
    }, 0);
  });
  scrim().addEventListener('click', closeDrawer);
}
