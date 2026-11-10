// Upcoming: the next week's scheduled tasks and every open deadline.
import * as store from '../../core/store.js';
import { h } from '../../utils/dom.js';
import { addDays, formatFriendlyDate, formatWeekday, todayKey } from '../../utils/dates.js';
import { categoryMap } from '../../domain/categories.js';
import { deadlineMoment } from '../../domain/deadlines.js';
import { sortByOrder } from '../../domain/ordering.js';
import { effectivePriority } from '../../domain/priorities.js';
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

  const deadlines = tasks
    .filter((t) => t.deadline)
    .filter((t) => (filters.status === 'open' ? t.status === STATUS.OPEN : t.status !== STATUS.CANCELLED))
    .filter((t) => filters.type === 'all' || (filters.type === 'subtask') === !!t.parentTaskId)
    .filter((t) => filters.priority === 'all' || effectivePriority(t, byId.get(t.parentTaskId)) === Number(filters.priority))
    .sort((a, b) => deadlineMoment(a.deadline, a.deadlineTime) - deadlineMoment(b.deadline, b.deadlineTime));

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
          ? h('div', { class: 'task-list' }, deadlines.map((task) => renderTaskBlock(task, { ...ctx, showDate: true, showParent: true })))
          : h('p', { class: 'faint' }, 'No deadlines match these filters.'),
        h('p', { class: 'faint', style: { fontSize: '12.5px', marginTop: '8px' } }, 'Project deadlines will appear here once projects are available.'),
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
