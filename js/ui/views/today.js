// The day view: what matters on one date, in the user's own order.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { addDays, formatLongDate, isDateKey, relativeDayLabel, todayKey } from '../../utils/dates.js';
import { categoryMap } from '../../domain/categories.js';
import { GROUP_TYPES, createGroup, deleteGroup, updateGroup } from '../../domain/groups.js';
import { sortByOrder } from '../../domain/ordering.js';
import { getSetting, isCollapsed, setSetting } from '../../domain/settings.js';
import {
  byExecutionTime,
  containerOf,
  dayProgress,
  overdueTasks,
  subtasksOf,
  topLevelForDate,
  visibleGroupsForDate,
} from '../../domain/taskQueries.js';
import { createTask, rescheduleMany } from '../../domain/tasks.js';
import { registerActions } from '../actions.js';
import { confirmDialog, formDialog } from '../components/dialog.js';
import { openMenu } from '../components/menu.js';
import { toast } from '../components/toast.js';
import { renderTaskBlock } from '../components/taskRow.js';
import { renderReminder } from '../components/reminderCard.js';
import { dailyReminder } from '../../domain/reminders.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';

const dayHref = (date) => (date === todayKey() ? '#/today' : `#/day/${date}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function isMobileContext() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function renderHeader(date, today, progress, sortMode) {
  const relative = relativeDayLabel(date, today);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return h(
    'header',
    { class: 'view-header' },
    h(
      'div',
      { class: 'day-nav' },
      h('a', { class: 'icon-btn', href: dayHref(addDays(date, -1)), 'aria-label': 'Previous day', title: 'Previous day' }, icon('chevronLeft')),
      h('a', { class: 'icon-btn', href: dayHref(addDays(date, 1)), 'aria-label': 'Next day', title: 'Next day' }, icon('chevronRight')),
      date !== today ? h('a', { class: 'btn btn-sm', href: '#/today' }, 'Today') : null,
      date !== addDays(today, 1) ? h('a', { class: 'btn btn-sm btn-ghost', href: dayHref(addDays(today, 1)) }, 'Tomorrow') : null,
      h('input', {
        type: 'date',
        class: 'input date-picker',
        value: date,
        'aria-label': 'Go to date',
        dataset: { action: 'pick-date', focusKey: 'pick-date' },
      }),
      h('span', { class: 'spacer' }),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Task order' },
        h(
          'button',
          { type: 'button', 'aria-pressed': String(sortMode === 'manual'), dataset: { action: 'set-sort', value: 'manual' }, title: 'Your own drag-and-drop order' },
          'Manual',
        ),
        h(
          'button',
          { type: 'button', 'aria-pressed': String(sortMode === 'time'), dataset: { action: 'set-sort', value: 'time' }, title: 'Tasks with a start time first, by time' },
          'By time',
        ),
      ),
    ),
    h(
      'div',
      { class: 'day-title-row' },
      h('h1', { class: 'view-title' }, relative ?? formatLongDate(date, today)),
      relative ? h('span', { class: 'view-subtitle' }, formatLongDate(date, today)) : null,
    ),
    progress.total
      ? h(
          'div',
          { class: 'day-progress' },
          h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, 'aria-label': 'Day progress' }, h('span', { style: { width: `${percent}%` } })),
          h('span', null, `${progress.done} of ${progress.total} done`),
        )
      : null,
  );
}

function renderDailyReminder() {
  const daily = dailyReminder();
  if (!daily) return null;
  return renderReminder(daily.item, { checked: !!daily.checked, target: { daily: true }, label: 'Today', compact: true });
}

function renderMobileNotice() {
  if (getSetting('mobileNoticeDismissed') || !isMobileContext()) return null;
  return h(
    'div',
    { class: 'notice', role: 'note' },
    icon('device'),
    h(
      'div',
      { class: 'notice-body' },
      h('strong', null, 'Your data stays on this device. '),
      'DailyOps stores tasks only in this browser. They are not synced to your other phones or computers, and clearing this browser’s data erases them.',
    ),
    h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'dismiss-mobile-notice' } }, 'Got it'),
  );
}

function sectionHead({ id, name, count, collapsed, dropZoneId, dragHandle, extra, actions }) {
  return h(
    'div',
    {
      class: 'section-head',
      dataset: dropZoneId !== undefined ? { dropZone: 'task', zoneId: dropZoneId, dropPosition: collapsed ? 'end' : 'start' } : {},
    },
    dragHandle,
    h(
      'button',
      {
        type: 'button',
        class: 'section-toggle',
        'aria-expanded': String(!collapsed),
        dataset: { action: 'toggle-section', key: id, focusKey: `toggle:${id}` },
      },
      icon('chevronDown', 'chev'),
      h('span', { class: 'section-name' }, name),
      extra,
      h('span', { class: 'section-count' }, String(count)),
    ),
    actions ? h('div', { class: 'section-actions' }, actions) : null,
  );
}

function renderTaskList(zoneId, tasks, ctx, emptyText) {
  return h(
    'div',
    { class: 'task-list', dataset: { dropZone: 'task', zoneId: zoneId ?? '' } },
    tasks.map((task) => renderTaskBlock(task, ctx)),
    !tasks.length && emptyText ? h('p', { class: 'faint', style: { fontSize: '13.5px', padding: '6px 4px 6px 46px' } }, emptyText) : null,
  );
}

function addRow(groupId, date, label) {
  return h(
    'form',
    { class: 'add-row', dataset: { action: 'add-task', group: groupId ?? '', date } },
    icon('plus'),
    h('input', {
      name: 'title',
      type: 'text',
      placeholder: 'Add task',
      autocomplete: 'off',
      maxlength: 500,
      'aria-label': `Add task to ${label}`,
      dataset: { focusKey: `add:${groupId ?? ''}` },
    }),
  );
}

export function renderToday(root, { date }) {
  const today = todayKey();
  const viewDate = isDateKey(date) ? date : today;
  const tasks = store.all('tasks');
  const sortMode = getSetting('todaySort');
  const manual = sortMode === 'manual';
  const visibleGroups = visibleGroupsForDate(store.all('groups'), viewDate);
  const visibleIds = new Set(visibleGroups.map((g) => g.id));

  const containers = new Map([[null, []], ...visibleGroups.map((g) => [g.id, []])]);
  topLevelForDate(tasks, viewDate).forEach((task) => containers.get(containerOf(task, visibleIds)).push(task));
  for (const [key, list] of containers) {
    containers.set(key, manual ? sortByOrder(list) : [...list].sort(byExecutionTime));
  }

  const subtaskCache = new Map();
  const ctx = {
    today,
    now: new Date(),
    categories: categoryMap(),
    showTimes: getSetting('showExecutionTimes'),
    draggable: manual,
    showReminders: true,
    subtasksOf: (id) => {
      if (!subtaskCache.has(id)) subtaskCache.set(id, subtasksOf(tasks, id));
      return subtaskCache.get(id);
    },
  };

  const overdue = viewDate === today ? overdueTasks(tasks, today) : [];
  const relative = relativeDayLabel(viewDate, today);
  const dayLabel = relative ? relative.toLowerCase() : formatLongDate(viewDate, today);
  const defaultTasks = containers.get(null);
  const hasGroups = visibleGroups.length > 0;
  const nothingPlanned = !hasGroups && !defaultTasks.length;

  root.replaceChildren(
    h(
      'div',
      { class: cls('view', !manual && 'no-drag') },
      renderHeader(viewDate, today, dayProgress(tasks, viewDate), sortMode),
      renderMobileNotice(),
      viewDate === today ? renderDailyReminder() : null,

      overdue.length
        ? h(
            'section',
            { class: cls('section overdue', isCollapsed('overdue') && 'collapsed'), 'aria-label': 'Overdue tasks' },
            sectionHead({
              id: 'overdue',
              name: 'Overdue',
              count: overdue.length,
              collapsed: isCollapsed('overdue'),
              actions: h(
                'button',
                { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'move-all-overdue' }, title: 'Reschedule every overdue task to today' },
                'Move all to today',
              ),
            }),
            h('div', { class: 'task-list' }, overdue.map((task) => renderTaskBlock(task, { ...ctx, draggable: false, showOriginalDate: true }))),
          )
        : null,

      h(
        'form',
        { class: 'quick-add', dataset: { action: 'add-task', group: '', date: viewDate } },
        icon('plus'),
        h('input', {
          name: 'title',
          type: 'text',
          placeholder: `Add a task for ${dayLabel}…`,
          autocomplete: 'off',
          maxlength: 500,
          'aria-label': 'Add a task',
          dataset: { focusKey: 'quick-add' },
        }),
        h('span', { class: 'hint' }, 'Enter ↵'),
      ),

      nothingPlanned
        ? h(
            'div',
            { class: 'empty' },
            icon('today'),
            h('h2', null, viewDate < today ? 'Nothing was planned for this day' : 'Nothing planned yet'),
            h('p', null, 'Add what matters, put the most important first, and start whenever you can.'),
          )
        : null,

      !nothingPlanned
        ? hasGroups
          ? h(
              'section',
              { class: cls('section', isCollapsed('container:default') && 'collapsed') },
              sectionHead({
                id: 'container:default',
                name: 'Tasks',
                count: defaultTasks.length,
                collapsed: isCollapsed('container:default'),
                dropZoneId: '',
              }),
              renderTaskList(null, defaultTasks, ctx, 'No ungrouped tasks.'),
            )
          : h('section', { class: 'section' }, renderTaskList(null, defaultTasks, ctx))
        : null,

      h(
        'div',
        { class: 'groups', dataset: { dropZone: 'group', zoneId: 'groups' } },
        visibleGroups.map((group) => {
          const collapsed = isCollapsed(`group:${group.id}`);
          const list = containers.get(group.id);
          return h(
            'section',
            { class: cls('section', collapsed && 'collapsed'), dataset: { dragItem: manual ? 'group' : null, id: group.id }, 'aria-label': group.name },
            sectionHead({
              id: `group:${group.id}`,
              name: group.name,
              count: list.length,
              collapsed,
              dropZoneId: group.id,
              dragHandle: manual
                ? h(
                    'button',
                    { type: 'button', class: 'grip', style: { opacity: 1 }, 'data-drag-handle': true, 'aria-label': `Reorder group ${group.name}`, dataset: { focusKey: `ggrip:${group.id}` } },
                    icon('grip'),
                  )
                : null,
              extra: group.type === GROUP_TYPES.DAY ? h('span', { class: 'chip chip-day' }, 'This day only') : null,
              actions: h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn sm',
                  'aria-label': `Group actions for ${group.name}`,
                  'aria-haspopup': 'menu',
                  dataset: { action: 'group-menu', id: group.id },
                },
                icon('more'),
              ),
            }),
            renderTaskList(group.id, list, ctx, collapsed ? null : 'Drop tasks here or add one below.'),
            addRow(group.id, viewDate, group.name),
          );
        }),
      ),

      h(
        'div',
        { class: 'groups-actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'new-group', date: viewDate } }, icon('plus'), 'New group'),
        !manual ? h('span', { class: 'faint', style: { fontSize: '12.5px', marginLeft: '8px' } }, 'Sorted by start time. Switch to Manual to drag and reorder.') : null,
      ),
    ),
  );
}

async function promptNewGroup(date) {
  const values = await formDialog({
    title: 'New group',
    description: 'Groups organize tasks on a day. They are not categories.',
    submitLabel: 'Create group',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'e.g. Study, Career, Friday presentation', required: true },
      {
        name: 'type',
        type: 'radio',
        label: 'Appears on',
        value: GROUP_TYPES.REUSABLE,
        options: [
          { value: GROUP_TYPES.REUSABLE, label: 'Every day', hint: 'A reusable group available on all dates.' },
          { value: GROUP_TYPES.DAY, label: 'This day only', hint: 'Only shown on the date you are viewing.' },
        ],
      },
    ],
  });
  if (!values) return;
  await createGroup({ name: values.name, type: values.type, date });
}

registerActions({
  'add-task': async (form) => {
    const input = form.elements.title;
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    await createTask({ title, scheduledDate: form.dataset.date, groupId: form.dataset.group || null });
  },
  'pick-date': (input) => {
    if (isDateKey(input.value)) navigate(dayHref(input.value));
  },
  'set-sort': (el) => setSetting('todaySort', el.dataset.value),
  'dismiss-mobile-notice': () => setSetting('mobileNoticeDismissed', true),
  'move-all-overdue': async () => {
    const ids = overdueTasks(store.all('tasks'), todayKey()).map((t) => t.id);
    await rescheduleMany(ids, todayKey());
    toast(`Moved ${plural(ids.length, 'task')} to today`);
  },
  'new-group': (el) => promptNewGroup(el.dataset.date),
  'group-menu': (el) => {
    const group = store.get('groups', el.dataset.id);
    if (!group) return;
    openMenu(el, [
      {
        label: 'Rename',
        icon: 'edit',
        onSelect: async () => {
          const values = await formDialog({
            title: 'Rename group',
            submitLabel: 'Rename',
            fields: [{ name: 'name', label: 'Name', value: group.name, required: true }],
          });
          if (values) await updateGroup(group.id, { name: values.name.trim() });
        },
      },
      { separator: true },
      {
        label: 'Delete group',
        icon: 'trash',
        danger: true,
        onSelect: async () => {
          const ok = await confirmDialog({
            title: `Delete “${group.name}”?`,
            message:
              group.type === GROUP_TYPES.REUSABLE
                ? 'This group is removed from every date. Its tasks are kept and move to Tasks on their own dates.'
                : 'Its tasks are kept and move to Tasks on this date.',
            confirmLabel: 'Delete group',
            danger: true,
          });
          if (ok) await deleteGroup(group.id);
        },
      },
    ]);
  },
});
