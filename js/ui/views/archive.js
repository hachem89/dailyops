// Archive: completed and cancelled tasks, searchable. Tasks also remain on
// their original days; this is a cross-day view, not a separate store.
import * as store from '../../core/store.js';
import { h } from '../../utils/dom.js';
import { formatFriendlyDate, formatWeekday, todayKey } from '../../utils/dates.js';
import { categoryMap } from '../../domain/categories.js';
import { getSetting } from '../../domain/settings.js';
import { STATUS, isTaskItem, isTopLevel, matchesQuery, subtasksOf } from '../../domain/taskQueries.js';
import { registerActions, ui } from '../actions.js';
import { renderTaskBlock } from '../components/taskRow.js';
import { icon } from '../icons.js';

const LIMIT = 300;
const state = { status: 'all', query: '' };

const finishedAt = (task) => task.completedAt || task.cancelledAt || task.updatedAt;

export function renderArchive(root) {
  const today = todayKey();
  const tasks = store.all('tasks');
  const matching = tasks
    .filter((t) => isTopLevel(t) && isTaskItem(t))
    .filter((t) => (state.status === 'all' ? t.status !== STATUS.OPEN : t.status === state.status))
    .filter((t) => matchesQuery(t, state.query.trim()))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || finishedAt(b).localeCompare(finishedAt(a)));
  const shown = matching.slice(0, LIMIT);

  const byDate = new Map();
  shown.forEach((task) => {
    if (!byDate.has(task.scheduledDate)) byDate.set(task.scheduledDate, []);
    byDate.get(task.scheduledDate).push(task);
  });

  const ctx = {
    today,
    now: new Date(),
    categories: categoryMap(),
    showTimes: getSetting('showExecutionTimes'),
    draggable: false,
    compact: true,
    subtasksOf: (id) => subtasksOf(tasks, id),
  };

  root.replaceChildren(
    h(
      'div',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', { class: 'view-title' }, 'Archive'),
        h('p', { class: 'view-subtitle' }, 'Completed, cancelled and skipped tasks across all days. They also stay visible on their original day.'),
      ),
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Status' },
          [
            ['all', 'All'],
            [STATUS.DONE, 'Completed'],
            [STATUS.CANCELLED, 'Cancelled'],
            [STATUS.SKIPPED, 'Skipped'],
          ].map(([value, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(state.status === value), dataset: { action: 'archive-status', value } }, label),
          ),
        ),
        h('input', {
          type: 'search',
          class: 'input',
          placeholder: 'Search archived tasks',
          'aria-label': 'Search archived tasks',
          value: state.query,
          dataset: { inputAction: 'archive-search', focusKey: 'archive-search' },
        }),
      ),
      shown.length
        ? [...byDate].map(([date, list]) =>
            h(
              'div',
              null,
              h(
                'div',
                { class: 'date-heading' },
                h('a', { href: date === today ? '#/today' : `#/day/${date}` }, formatFriendlyDate(date, today)),
                h('span', { class: 'faint' }, formatWeekday(date)),
              ),
              h('div', { class: 'task-list' }, list.map((task) => renderTaskBlock(task, ctx))),
            ),
          )
        : h(
            'div',
            { class: 'empty' },
            icon('archive'),
            h('h2', null, state.query ? 'No matches' : 'Nothing here yet'),
            h('p', null, state.query ? 'Try a different search.' : 'Completed and cancelled tasks will be listed here.'),
          ),
      matching.length > LIMIT
        ? h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '13px' } }, `Showing the latest ${LIMIT} of ${matching.length}. Search to narrow down.`)
        : null,
    ),
  );
}

registerActions({
  'archive-status': (el) => {
    state.status = el.dataset.value;
    ui.render();
  },
  'archive-search': (el) => {
    state.query = el.value;
    ui.render();
  },
});
