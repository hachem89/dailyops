// Task and subtask rows, shared by every view and the details drawer.
import { h, cls } from '../../utils/dom.js';
import { formatDuration, formatFriendlyDate, formatMs } from '../../utils/dates.js';
import { trackingIndex } from '../../domain/timer.js';
import { liveElapsed } from '../live.js';
import { deadlineLabel, deadlineStatus } from '../../domain/deadlines.js';
import { effectivePriority, priorityInfo } from '../../domain/priorities.js';
import { isCollapsed } from '../../domain/settings.js';
import { STATUS, isMissed, isOverdue } from '../../domain/taskQueries.js';
import { describeRule } from '../../domain/recurrence.js';
import { getRule } from '../../domain/repeat.js';
import * as store from '../../core/store.js';
import { icon } from '../icons.js';

// A task whose subtask composer is open even though it has no subtasks yet.
export const composer = { taskId: null };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function chip(className, iconName, text, title) {
  return h('span', { class: cls('chip', className), title }, iconName ? icon(iconName) : null, text);
}

function categoryChip(category) {
  if (!category) return null;
  return h('span', { class: 'chip', title: 'Category' }, h('span', { class: `cat-dot cat-${category.color}` }), category.name);
}

function deadlineChip(task, now) {
  if (!task.deadline) return null;
  const finished = task.status !== STATUS.OPEN;
  const status = finished ? 'normal' : deadlineStatus(task.deadline, task.deadlineTime, now);
  return chip(
    `chip-deadline-${status}`,
    'deadline',
    deadlineLabel(task.deadline, task.deadlineTime, now).replace(/^Overdue/, finished ? 'Was due' : 'Overdue'),
    'Deadline',
  );
}

// Tracked time against the estimate: "25m / 45m", live while the timer runs.
function timeChip(task) {
  const { finished, open } = trackingIndex();
  const done = finished.get(task.id) || 0;
  const estimate = task.estimatedDuration;
  const estimateText = estimate ? ` / ${formatDuration(estimate)}` : '';
  if (open?.taskId === task.id) {
    return h('span', { class: 'chip chip-running', title: 'Timer running' }, icon('timer'), liveElapsed(open.start, done, 'short'), estimateText);
  }
  if (done) {
    const over = estimate && done > estimate * 60000;
    return chip(over ? 'chip-deadline-approaching' : '', 'timer', `${formatMs(done)}${estimateText}`, over ? 'Tracked time is over the estimate' : 'Tracked time / estimate');
  }
  return estimate ? chip('', 'timer', `~${formatDuration(estimate)}`, 'Estimated duration') : null;
}

function metaChips(task, ctx, { parent, subtasks }) {
  const chips = [];
  const isSub = !!parent;

  if (task.status === STATUS.CANCELLED) chips.push(chip('chip-cancelled', 'ban', 'Cancelled'));
  if (task.status === STATUS.SKIPPED) chips.push(chip('chip-cancelled', 'skip', 'Skipped'));
  if (!isSub && isMissed(task, ctx.today)) chips.push(chip('chip-missed', null, 'Missed', 'This occurrence was not completed. Later occurrences are unaffected.'));

  const rule = !isSub && task.recurrenceRuleId ? getRule(task.recurrenceRuleId) : null;
  if (rule) chips.push(chip('', 'repeat', describeRule({ ...rule, untilProjectDone: false }), describeRule(rule)));

  const project = !isSub && task.projectId ? store.get('projects', task.projectId) : null;
  if (project) {
    chips.push(chip('chip-project', 'projects', project.name, task.projectSubtaskId ? 'Project subtask' : 'Project work (completing this does not complete the project)'));
  }

  if (!isSub && isOverdue(task, ctx.today)) {
    chips.push(
      chip('chip-overdue', 'calendar', ctx.showOriginalDate ? `From ${formatFriendlyDate(task.scheduledDate, ctx.today)}` : 'Overdue'),
    );
  } else if (ctx.showDate && task.scheduledDate) {
    chips.push(chip('', 'calendar', formatFriendlyDate(task.scheduledDate, ctx.today), 'Scheduled date'));
  }

  if (ctx.showParent && parent) chips.push(chip('', 'subtask', parent.title, 'Subtask of'));

  const priority = effectivePriority(task, parent);
  const overridden = isSub && task.priority != null && task.priority !== parent?.priority;
  if ((!isSub && priority <= 2) || overridden) {
    const info = priorityInfo(priority);
    chips.push(chip(`chip-prio-${priority}`, 'flag', info.label, `Priority: ${info.name}`));
  }

  if (ctx.showTimes && task.executionTime) chips.push(chip('', 'clock', task.executionTime, 'Execution time'));
  chips.push(deadlineChip(task, ctx.now));
  chips.push(timeChip(task));
  if (!isSub) chips.push(categoryChip(ctx.categories.get(task.categoryId)));

  if (subtasks?.length) {
    const done = subtasks.filter((s) => s.status === STATUS.DONE).length;
    const open = subtasks.filter((s) => s.status === STATUS.OPEN).length;
    if (task.status === STATUS.DONE && open > 0) {
      chips.push(chip('chip-deadline-approaching', 'subtask', `${plural(open, 'subtask')} still open`, 'Subtasks'));
    } else {
      chips.push(chip('', 'subtask', `${done}/${subtasks.length}`, 'Subtasks completed'));
    }
  }
  return chips.filter(Boolean);
}

function timerButton(task, ctx) {
  const running = trackingIndex().open?.taskId === task.id;
  if (!running && task.status !== STATUS.OPEN) return null;
  return h(
    'button',
    {
      type: 'button',
      class: running ? 'icon-btn sm timer-btn is-running' : 'icon-btn sm timer-btn',
      'aria-label': running ? `Pause timer for ${task.title}` : `Start timer for ${task.title}`,
      title: running ? 'Pause timer' : 'Start timer',
      dataset: { action: 'timer-toggle', type: 'task', id: task.id, focusKey: `${ctx.keyPrefix || ''}timer:${task.id}` },
    },
    icon(running ? 'pause' : 'play'),
  );
}

function renderRow(task, ctx, { parent = null, subtasks = null, expanded = false, draggable }) {
  const isSub = !!parent;
  const priority = effectivePriority(task, parent);
  const done = task.status === STATUS.DONE;
  const cancelled = task.status === STATUS.CANCELLED || task.status === STATUS.SKIPPED;
  const overdue = !isSub && isOverdue(task, ctx.today);
  const description = (task.description || '').split('\n').find((line) => line.trim());

  return h(
    'div',
    {
      class: cls('task-row', `prio-${priority}`, done && 'is-done', cancelled && 'is-cancelled'),
    },
    draggable
      ? h(
          'button',
          {
            type: 'button',
            class: 'grip',
            'data-drag-handle': true,
            'aria-label': 'Drag to reorder. Alt plus arrow keys also reorder.',
            title: 'Drag to reorder',
            dataset: { focusKey: `grip:${task.id}` },
          },
          icon('grip'),
        )
      : null,
    !isSub
      ? subtasks?.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'expand',
              'aria-expanded': String(expanded),
              'aria-label': expanded ? 'Collapse subtasks' : 'Expand subtasks',
              dataset: { action: 'toggle-section', key: `task:${task.id}`, focusKey: `expand:${task.id}` },
            },
            icon('chevronRight'),
          )
        : h('span', { class: 'expand-spacer' })
      : null,
    h('input', {
      type: 'checkbox',
      class: 'check',
      checked: done,
      disabled: cancelled,
      'aria-label': `${done ? 'Mark incomplete' : 'Complete'}: ${task.title}`,
      dataset: { action: 'toggle-task', id: task.id, focusKey: `${ctx.keyPrefix || ''}check:${task.id}` },
    }),
    h(
      'button',
      {
        type: 'button',
        class: 'task-main',
        dataset: { action: 'open-task', id: task.id, focusKey: `${ctx.keyPrefix || ''}open:${task.id}` },
      },
      h('span', { class: 'task-title' }, task.title),
      description && !ctx.compact ? h('span', { class: 'task-desc' }, description) : null,
      h('span', { class: 'task-meta' }, metaChips(task, ctx, { parent, subtasks })),
    ),
    h(
      'div',
      { class: 'task-actions' },
      overdue
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-sm btn-move-today',
              dataset: { action: 'move-today', id: task.id, focusKey: `move:${task.id}` },
              title: 'Reschedule this task to today (no duplicate is created)',
            },
            icon('arrowRight'),
            'Move to today',
          )
        : null,
      timerButton(task, ctx),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn sm',
          'aria-label': `More actions for ${task.title}`,
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          dataset: { action: 'task-menu', id: task.id, focusKey: `${ctx.keyPrefix || ''}menu:${task.id}` },
        },
        icon('more'),
      ),
    ),
  );
}

export function renderSubtaskList(parent, subtasks, ctx) {
  return h(
    'div',
    {
      class: 'subtask-list',
      dataset: { dropZone: 'subtask', zoneId: parent.id, dropScope: parent.id },
    },
    subtasks.map((sub) =>
      h(
        'div',
        { class: 'task-block', dataset: { dragItem: 'subtask', dragScope: parent.id, id: sub.id } },
        renderRow(sub, ctx, { parent, draggable: ctx.draggableSubtasks !== false }),
      ),
    ),
    h(
      'form',
      { class: 'add-row', dataset: { action: 'add-subtask', parent: parent.id } },
      icon('plus'),
      h('input', {
        name: 'title',
        type: 'text',
        placeholder: 'Add subtask',
        autocomplete: 'off',
        maxlength: 500,
        'aria-label': `Add subtask to ${parent.title}`,
        dataset: { focusKey: `${ctx.keyPrefix || ''}addsub:${parent.id}` },
      }),
    ),
  );
}

// ctx: { today, now, categories, subtasksOf, showTimes, draggable, showDate,
//        showOriginalDate, showParent, compact, keyPrefix, parentOf }
export function renderTaskBlock(task, ctx) {
  if (task.parentTaskId) {
    // Subtasks listed on their own (e.g. Upcoming deadlines).
    const parent = ctx.parentOf?.(task);
    return h(
      'div',
      { class: 'task-block', dataset: { id: task.id } },
      renderRow(task, ctx, { parent: parent || { priority: null }, draggable: false }),
    );
  }
  const subtasks = ctx.subtasksOf(task.id);
  const composing = composer.taskId === task.id;
  const expanded = !ctx.compact && ((subtasks.length > 0 && !isCollapsed(`task:${task.id}`)) || composing);
  return h(
    'div',
    { class: 'task-block', dataset: { dragItem: ctx.draggable ? 'task' : null, id: task.id } },
    renderRow(task, ctx, { subtasks, expanded, draggable: ctx.draggable }),
    expanded ? renderSubtaskList(task, subtasks, ctx) : null,
  );
}
