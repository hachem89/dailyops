// Analytics: one compact dashboard, details on demand. Everything is computed
// locally from tasks, recurrence rules and time sessions.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { formatDuration, formatFriendlyDate, formatMs, formatShortDate, formatWeekday, todayKey } from '../../utils/dates.js';
import {
  PERIODS,
  estimateVsActual,
  executionStats,
  habitStats,
  overdueWork,
  periodRange,
  postponementStats,
  shiftPeriod,
  timeAllocation,
} from '../../domain/analytics.js';
import { listCategories } from '../../domain/categories.js';
import { describeRule } from '../../domain/recurrence.js';
import { registerActions, ui } from '../actions.js';
import { icon } from '../icons.js';

const ALL = '__all';
const NONE = '__none';
const state = { period: PERIODS.WEEK, anchor: null, category: ALL };

const pct = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);

function stat(label, value, hint) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label), hint ? h('span', { class: 'stat-hint' }, hint) : null);
}

function bar(fraction, className = '') {
  const width = Math.max(0, Math.min(1, fraction || 0)) * 100;
  return h('span', { class: cls('bar', className) }, h('span', { style: { width: `${width}%` } }));
}

function table(headers, rows, emptyText) {
  if (!rows.length) return h('p', { class: 'faint table-empty' }, emptyText);
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'data-table' },
      h('thead', null, h('tr', null, headers.map((text, i) => h('th', { class: i ? 'num' : null, scope: 'col' }, text)))),
      h('tbody', null, rows),
    ),
  );
}

function details(summary, ...content) {
  return h('details', { class: 'more' }, h('summary', null, summary), ...content);
}

function section(title, iconName, ...content) {
  return h('section', { class: 'analytics-section' }, h('h2', null, icon(iconName), title), ...content);
}

function periodLabel(range, today) {
  if (range.kind === PERIODS.MONTH) {
    return new Date(`${range.start}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return `${formatShortDate(range.start, today)} – ${formatShortDate(range.end, today)}`;
}

function taskLink(task) {
  return h('button', { type: 'button', class: 'link', dataset: { action: 'open-task', id: task.id } }, task.title);
}

export function renderAnalytics(root) {
  const today = todayKey();
  if (!state.anchor) state.anchor = today;
  const range = periodRange(state.period, state.anchor);
  const isCurrent = today >= range.start && today <= range.end;
  const filter = { categoryId: state.category === ALL ? null : state.category === NONE ? '' : state.category };
  const now = Date.now();

  const tasks = store.all('tasks');
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const sessions = store.all('timeSessions');
  const categories = listCategories();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const projectsById = new Map(store.all('projects').map((p) => [p.id, p]));

  const exec = executionStats(tasks, range, today, filter);
  const time = timeAllocation(sessions, tasksById, range, now, filter);
  const estimates = estimateVsActual(tasks, sessions, range, now, filter);
  const occurrences = tasks.filter((t) => t.recurrenceRuleId);
  const habits = store
    .all('recurrenceRules')
    .filter((r) => r.startDate <= range.end && r.startDate <= today && (!r.endDate || r.endDate >= range.start))
    .filter((r) => filter.categoryId == null || (filter.categoryId === '' ? !r.categoryId : r.categoryId === filter.categoryId))
    .map((r) => habitStats(r, occurrences, range, today))
    .filter((s) => s.expected > 0)
    .sort((a, b) => a.rule.title.localeCompare(b.rule.title));
  const postponed = postponementStats(tasks, filter).filter((p) => p.postponed > 0 || p.moves > 1);
  const overdue = overdueWork(tasks, today, filter);

  const maxDayTotal = Math.max(1, ...exec.perDay.map((d) => d.total));
  const maxCategory = Math.max(1, ...time.byCategory.map((c) => c.ms));
  const maxProject = Math.max(1, ...time.byProject.map((p) => p.ms));
  const estimateDiff = estimates.estimateMs ? (estimates.actualMs - estimates.estimateMs) / estimates.estimateMs : null;

  root.replaceChildren(
    h(
      'div',
      { class: 'view analytics' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', { class: 'view-title' }, 'Analytics'),
        h('p', { class: 'view-subtitle' }, 'Computed on this device from your own data. Nothing is sent anywhere.'),
      ),
      h(
        'div',
        { class: 'filters analytics-filters' },
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Period' },
          [
            [PERIODS.WEEK, 'Week'],
            [PERIODS.MONTH, 'Month'],
          ].map(([value, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(state.period === value), dataset: { action: 'analytics-period', value } }, label),
          ),
        ),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous period', dataset: { action: 'analytics-shift', delta: '-1' } }, icon('chevronLeft')),
        h('strong', { class: 'period-label' }, periodLabel(range, today)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next period', dataset: { action: 'analytics-shift', delta: '1' } }, icon('chevronRight')),
        !isCurrent ? h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'analytics-reset' } }, 'Current') : null,
        h('span', { class: 'spacer' }),
        h(
          'select',
          { class: 'select', style: { width: 'auto' }, 'aria-label': 'Filter by category', dataset: { action: 'analytics-category' } },
          h('option', { value: ALL, selected: state.category === ALL }, 'All categories'),
          h('option', { value: NONE, selected: state.category === NONE }, 'Uncategorized'),
          categories.map((c) => h('option', { value: c.id, selected: state.category === c.id }, c.name)),
        ),
      ),

      // A. Daily execution
      section(
        'Daily execution',
        'today',
        h(
          'div',
          { class: 'stats' },
          stat('Completed', String(exec.done)),
          stat('Incomplete', String(exec.open), [exec.overdue && `${exec.overdue} overdue`, exec.missed && `${exec.missed} missed`].filter(Boolean).join(' · ') || null),
          stat('Completion rate', pct(exec.rate), 'done ÷ (done + incomplete)'),
          stat('Skipped', String(exec.skipped), 'recurring occurrences'),
          stat('Cancelled', String(exec.cancelled), 'never counted as done'),
          exec.planned ? stat('Planned', String(exec.planned), 'later in this period') : null,
        ),
        details(
          'Day by day',
          table(
            ['Day', 'Done', 'Open', 'Skipped', 'Cancelled', ''],
            exec.perDay.map((d) =>
              h(
                'tr',
                { class: d.date === today ? 'is-today' : null },
                h('td', null, h('a', { href: d.date === today ? '#/today' : `#/day/${d.date}` }, `${formatWeekday(d.date)} ${formatShortDate(d.date, today)}`)),
                h('td', { class: 'num' }, String(d.done)),
                h('td', { class: 'num' }, String(d.open)),
                h('td', { class: 'num' }, String(d.skipped)),
                h('td', { class: 'num' }, String(d.cancelled)),
                h('td', { class: 'num bar-cell' }, d.total ? h('span', { class: 'split-bar', style: { width: `${(d.total / maxDayTotal) * 100}%` } }, h('span', { style: { width: `${(d.done / d.total) * 100}%` } })) : null),
              ),
            ),
            'No days in this period.',
          ),
        ),
      ),

      // B. Time allocation
      section(
        'Time allocation',
        'timer',
        h(
          'div',
          { class: 'stats' },
          stat('Tracked', formatMs(time.total)),
          stat(
            'Estimated vs actual',
            estimates.compared ? `${formatMs(estimates.estimateMs)} → ${formatMs(estimates.actualMs)}` : '—',
            estimates.compared
              ? `${estimateDiff >= 0 ? '+' : ''}${Math.round(estimateDiff * 100)}% across ${estimates.compared} task${estimates.compared === 1 ? '' : 's'}`
              : 'needs tasks with an estimate and tracked time',
          ),
        ),
        h(
          'div',
          { class: 'two-col' },
          h(
            'div',
            null,
            h('h3', null, 'By category'),
            table(
              ['Category', 'Time', ''],
              time.byCategory.map((c) => {
                const category = categoryById.get(c.id);
                return h(
                  'tr',
                  null,
                  h('td', null, h('span', { class: `cat-dot cat-${category?.color || 'gray'}` }), ' ', category ? category.name : c.id ? 'Deleted category' : 'Uncategorized'),
                  h('td', { class: 'num' }, formatMs(c.ms)),
                  h('td', { class: 'num bar-cell' }, bar(c.ms / maxCategory)),
                );
              }),
              'No time tracked in this period.',
            ),
          ),
          h(
            'div',
            null,
            h('h3', null, 'By project'),
            table(
              ['Project', 'Time', ''],
              time.byProject.map((p) => {
                const project = projectsById.get(p.id);
                return h(
                  'tr',
                  null,
                  h('td', null, project ? h('a', { class: 'link', href: `#/projects/${project.id}` }, project.name) : 'Deleted project'),
                  h('td', { class: 'num' }, formatMs(p.ms)),
                  h('td', { class: 'num bar-cell' }, bar(p.ms / maxProject)),
                );
              }),
              'No project time in this period.',
            ),
          ),
        ),
        details(
          'Estimated vs actual by task',
          table(
            ['Task', 'Estimate', 'Actual', 'Difference'],
            estimates.rows.slice(0, 50).map((r) => {
              const diff = r.estimateMs ? r.actualMs - r.estimateMs : null;
              return h(
                'tr',
                null,
                h('td', null, taskLink(r.task)),
                h('td', { class: 'num' }, r.estimateMs ? formatDuration(r.task.estimatedDuration) : '—'),
                h('td', { class: 'num' }, r.actualMs ? formatMs(r.actualMs) : '—'),
                h('td', { class: cls('num', diff > 0 && 'over') }, diff == null || !r.actualMs ? '—' : `${diff >= 0 ? '+' : '−'}${formatMs(Math.abs(diff))}`),
              );
            }),
            'Add estimates and track time to compare them.',
          ),
        ),
      ),

      // C. Consistency
      section(
        'Consistency',
        'repeat',
        habits.length
          ? h(
              'div',
              { class: 'habits' },
              habits.map((s) =>
                h(
                  'div',
                  { class: 'habit-row' },
                  h(
                    'div',
                    { class: 'habit-name' },
                    h('span', null, s.rule.title),
                    h('span', { class: 'faint' }, describeRule(s.rule)),
                  ),
                  h(
                    'div',
                    { class: 'habit-history', 'aria-label': `${s.done} of ${s.expected} done` },
                    s.history.map((entry) =>
                      h('span', { class: `dot dot-${entry.state}`, title: `${formatFriendlyDate(entry.date, today)}: ${entry.state}` }),
                    ),
                  ),
                  h('div', { class: 'habit-numbers' }, h('span', null, pct(s.rate)), h('span', { class: 'faint' }, `${s.done}/${s.done + s.missed}`)),
                  h('div', { class: 'habit-numbers' }, h('span', null, String(s.streak)), h('span', { class: 'faint' }, 'streak')),
                ),
              ),
              h(
                'p',
                { class: 'legend faint' },
                h('span', { class: 'dot dot-done' }),
                ' done ',
                h('span', { class: 'dot dot-missed' }),
                ' missed ',
                h('span', { class: 'dot dot-skipped' }),
                ' skipped ',
                h('span', { class: 'dot dot-pending' }),
                ' today. Skipped days do not break a streak.',
              ),
            )
          : h('p', { class: 'faint' }, 'No recurring tasks were scheduled in this period.'),
      ),

      // D. Task insights
      section(
        'Task insights',
        'info',
        h(
          'div',
          { class: 'stats' },
          stat('Overdue now', String(overdue.length)),
          stat('Postponed tasks', String(postponed.length), 'moved to a later date at least once'),
        ),
        details(
          'Overdue work',
          table(
            ['Task', 'Scheduled', 'Days overdue', ''],
            overdue.slice(0, 50).map((o) =>
              h(
                'tr',
                null,
                h('td', null, taskLink(o.task)),
                h('td', { class: 'num' }, formatShortDate(o.task.scheduledDate, today)),
                h('td', { class: 'num' }, String(o.daysOverdue)),
                h('td', { class: 'num' }, h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'move-today', id: o.task.id } }, 'Move to today')),
              ),
            ),
            'Nothing is overdue.',
          ),
        ),
        details(
          'Frequently postponed and moved',
          table(
            ['Task', 'Moves', 'Postponed', 'Days pushed', 'First planned'],
            postponed.slice(0, 50).map((p) =>
              h(
                'tr',
                null,
                h('td', null, taskLink(p.task)),
                h('td', { class: 'num' }, String(p.moves)),
                h('td', { class: 'num' }, String(p.postponed)),
                h('td', { class: 'num' }, String(p.daysPushed)),
                h('td', { class: 'num' }, formatShortDate(p.originalDate, today)),
              ),
            ),
            'No task has been postponed yet.',
          ),
        ),
      ),
    ),
  );
}

registerActions({
  'analytics-period': (el) => {
    state.period = el.dataset.value;
    ui.render();
  },
  'analytics-shift': (el) => {
    state.anchor = shiftPeriod(state.period, state.anchor || todayKey(), Number(el.dataset.delta));
    ui.render();
  },
  'analytics-reset': () => {
    state.anchor = todayKey();
    ui.render();
  },
  'analytics-category': (el) => {
    state.category = el.value;
    ui.render();
  },
});
