// Upcoming: the next week's scheduled tasks and every open deadline.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { addDays, formatFriendlyDate, formatWeekday, todayKey } from '../../utils/dates.js';
import { categoryMap } from '../../domain/categories.js';
import { deadlineLabel, deadlineMoment, deadlineStatus } from '../../domain/deadlines.js';
import { sortByOrder } from '../../domain/ordering.js';
import { effectivePriority, priorityInfo } from '../../domain/priorities.js';
import { PROJECT_STATUS_LABELS, SUBTASK_STATUS, isProjectOpen, projectSubtaskPriority } from '../../domain/projectQueries.js';
import { getSetting } from '../../domain/settings.js';
import { STATUS, subtasksOf, topLevelForDate } from '../../domain/taskQueries.js';
import { registerActions, ui } from '../actions.js';
import { renderTaskBlock } from '../components/taskRow.js';
import { icon } from '../icons.js';

const DAYS_AHEAD = 7;
const filters = { type: 'all', priority: 'all', status: 'open' };

function segmented(label, key, options) {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([value, text]) =>
      h(
        'button',
        { type: 'button', 'aria-pressed': String(filters[key] === value), dataset: { action: 'upcoming-filter', key, value } },
        text,
      ),
    ),
  );
}

function deadlineChip(item, finished, now) {
  const status = finished ? 'normal' : deadlineStatus(item.deadline, item.deadlineTime, now);
  return h('span', { class: `chip chip-deadline-${status}` }, icon('deadline'), deadlineLabel(item.deadline, item.deadlineTime, now));
}

function priorityChip(priority) {
  const info = priorityInfo(priority);
  return h('span', { class: `chip chip-prio-${priority}`, title: `Priority: ${info.name}` }, icon('flag'), info.label);
}

function projectDeadlineRow(project, now) {
  const finished = !isProjectOpen(project);
  return h(
    'div',
    { class: cls('deadline-row', finished && 'is-done') },
    h('span', { class: 'kind', title: 'Project' }, icon('projects')),
    h(
      'a',
      { class: 'grow', href: `#/projects/${project.id}` },
      h('span', { class: 'task-title' }, project.name),
      h(
        'span',
        { class: 'task-meta' },
        h('span', { class: 'chip' }, 'Project'),
        finished ? h('span', { class: 'chip chip-cancelled' }, PROJECT_STATUS_LABELS[project.status]) : null,
        priorityChip(project.priority),
        deadlineChip(project, finished, now),
      ),
    ),
  );
}

function projectSubtaskDeadlineRow(subtask, project, now) {
  const done = subtask.status === SUBTASK_STATUS.DONE;
  const priority = projectSubtaskPriority(subtask, project);
  return h(
    'div',
    { class: cls('deadline-row task-row', `prio-${priority}`, done && 'is-done') },
    h('input', {
      type: 'checkbox',
      class: 'check',
      checked: done,
      'aria-label': `${done ? 'Mark incomplete' : 'Complete'}: ${subtask.title}`,
      dataset: { action: 'psub-toggle', id: subtask.id, focusKey: `up-pscheck:${subtask.id}` },
    }),
    h(
      'a',
      { class: 'grow', href: `#/projects/${project.id}` },
      h('span', { class: 'task-title' }, subtask.title),
      h(
        'span',
        { class: 'task-meta' },
        h('span', { class: 'chip chip-project' }, icon('projects'), project.name),
        priority <= 2 ? priorityChip(priority) : null,
        deadlineChip(subtask, done, now),
      ),
    ),
  );
}

export function renderUpcoming(root) {
  const today = todayKey();
  const tasks = store.all('tasks');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ctx = {
    today,
    now: new Date(),
    categories: categoryMap(),
    showTimes: getSetting('showExecutionTimes'),
    draggable: false,
    compact: true,
    subtasksOf: (id) => subtasksOf(tasks, id),
    parentOf: (task) => byId.get(task.parentTaskId),
  };

  const days = [];
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const list = sortByOrder(topLevelForDate(tasks, date).filter((t) => t.status === STATUS.OPEN));
    if (list.length) days.push({ date, list });
  }

  const projects = new Map(store.all('projects').map((p) => [p.id, p]));
  const wantPriority = (p) => filters.priority === 'all' || p === Number(filters.priority);
  const wantType = (type) => filters.type === 'all' || filters.type === type;
  const items = [];

  tasks
    .filter((t) => t.deadline)
    .filter((t) => (filters.status === 'open' ? t.status === STATUS.OPEN : t.status !== STATUS.CANCELLED && t.status !== STATUS.SKIPPED))
    .filter((t) => wantType(t.parentTaskId ? 'subtask' : 'task'))
    .filter((t) => wantPriority(effectivePriority(t, byId.get(t.parentTaskId))))
    .forEach((t) => items.push({ item: t, render: () => renderTaskBlock(t, { ...ctx, showDate: true, showParent: true }) }));

  if (wantType('project')) {
    [...projects.values()]
      .filter((p) => p.deadline)
      .filter((p) => (filters.status === 'open' ? isProjectOpen(p) : p.status !== 'cancelled'))
      .filter((p) => wantPriority(p.priority))
      .forEach((p) => items.push({ item: p, render: () => projectDeadlineRow(p, ctx.now) }));
  }

  if (wantType('subtask')) {
    store
      .all('projectSubtasks')
      .filter((s) => s.deadline && projects.has(s.projectId))
      .filter((s) => filters.status !== 'open' || (s.status === SUBTASK_STATUS.OPEN && isProjectOpen(projects.get(s.projectId))))
      .filter((s) => wantPriority(projectSubtaskPriority(s, projects.get(s.projectId))))
      .forEach((s) => items.push({ item: s, render: () => projectSubtaskDeadlineRow(s, projects.get(s.projectId), ctx.now) }));
  }

  const deadlines = items.sort(
    (a, b) => deadlineMoment(a.item.deadline, a.item.deadlineTime) - deadlineMoment(b.item.deadline, b.item.deadlineTime),
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', { class: 'view-title' }, 'Upcoming'),
        h('p', { class: 'view-subtitle' }, 'What is scheduled next, and what is due. Scheduled dates and deadlines are kept separate.'),
      ),
      h(
        'section',
        { class: 'list-section' },
        h('h2', null, icon('upcoming'), 'Deadlines'),
        h(
          'div',
          { class: 'filters' },
          segmented('Type', 'type', [
            ['all', 'All'],
            ['task', 'Tasks'],
            ['subtask', 'Subtasks'],
            ['project', 'Projects'],
          ]),
          segmented('Priority', 'priority', [
            ['all', 'Any priority'],
            ['1', 'P1'],
            ['2', 'P2'],
            ['3', 'P3'],
            ['4', 'P4'],
          ]),
          segmented('Status', 'status', [
            ['open', 'Open'],
            ['all', 'Include completed'],
          ]),
        ),
        deadlines.length
          ? h('div', { class: 'task-list' }, deadlines.map((entry) => entry.render()))
          : h('p', { class: 'faint' }, 'No deadlines match these filters.'),
      ),
      h(
        'section',
        { class: 'list-section' },
        h('h2', null, icon('calendar'), `Next ${DAYS_AHEAD} days`),
        days.length
          ? days.map(({ date, list }) =>
              h(
                'div',
                null,
                h(
                  'div',
                  { class: 'date-heading' },
                  h('a', { href: `#/day/${date}` }, formatFriendlyDate(date, today)),
                  h('span', { class: 'faint' }, formatWeekday(date)),
                ),
                h('div', { class: 'task-list' }, list.map((task) => renderTaskBlock(task, ctx))),
              ),
            )
          : h('p', { class: 'faint' }, 'Nothing scheduled for the coming week.'),
      ),
    ),
  );
}

registerActions({
  'upcoming-filter': (el) => {
    filters[el.dataset.key] = el.dataset.value;
    ui.render();
  },
});
