// Projects list and project detail.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { formatFriendlyDate, formatLongDate, todayKey } from '../../utils/dates.js';
import { deadlineLabel, deadlineStatus } from '../../domain/deadlines.js';
import { sortByOrder } from '../../domain/ordering.js';
import { PRIORITIES, priorityInfo } from '../../domain/priorities.js';
import {
  PROJECT_STATUS,
  PROJECT_STATUS_LABELS,
  SUBTASK_STATUS,
  isProjectOpen,
  projectProgress,
  projectSubtaskPriority,
  subtasksOfProject,
} from '../../domain/projectQueries.js';
import {
  addProjectToDay,
  addSubtaskToDay,
  createProject,
  createProjectSubtask,
  deleteProject,
  deleteProjectSubtask,
  getProject,
  getProjectSubtask,
  setProjectStatus,
  toggleProjectSubtask,
  updateProject,
  updateProjectSubtask,
} from '../../domain/projects.js';
import { describeRule } from '../../domain/recurrence.js';
import { isDateKey, isTimeValue } from '../../utils/dates.js';
import { registerActions, ui } from '../actions.js';
import { confirmDialog, formDialog } from '../components/dialog.js';
import { toast } from '../components/toast.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { renderTimeSection } from '../components/timeSection.js';
import { trackingIndex } from '../../domain/timer.js';
import { sessionMs } from '../../domain/analytics.js';

const listState = { filter: 'open' };

function progressBar(progress, label) {
  return h(
    'div',
    { class: 'project-progress' },
    h(
      'div',
      { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress.percent, 'aria-label': label },
      h('span', { style: { width: `${progress.percent}%` } }),
    ),
    h('span', { class: 'faint' }, progress.total ? `${progress.done}/${progress.total}` : 'No subtasks'),
  );
}

function deadlineChip(item, finished, now) {
  if (!item.deadline) return null;
  const status = finished ? 'normal' : deadlineStatus(item.deadline, item.deadlineTime, now);
  return h('span', { class: `chip chip-deadline-${status}`, title: 'Deadline' }, icon('deadline'), deadlineLabel(item.deadline, item.deadlineTime, now));
}

function priorityChip(priority) {
  const info = priorityInfo(priority);
  return h('span', { class: `chip chip-prio-${priority}`, title: `Priority: ${info.name}` }, icon('flag'), info.label);
}

// ---------------------------------------------------------------- list view

export function renderProjects(root) {
  const subtasks = store.all('projectSubtasks');
  const now = new Date();
  const all = sortByOrder(store.all('projects'));
  const visible = all.filter((p) =>
    listState.filter === 'all' ? true : listState.filter === 'open' ? isProjectOpen(p) : !isProjectOpen(p),
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header view-header-row' },
        h(
          'div',
          null,
          h('h1', { class: 'view-title' }, 'Projects'),
          h('p', { class: 'view-subtitle' }, 'Long-term work with its own subtasks and progress. Add a project or one of its subtasks to any day.'),
        ),
        h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'new-project' } }, icon('plus'), 'New project'),
      ),
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Project status' },
          [
            ['open', 'Active'],
            ['closed', 'Completed & cancelled'],
            ['all', 'All'],
          ].map(([value, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(listState.filter === value), dataset: { action: 'project-filter', value } }, label),
          ),
        ),
      ),
      visible.length
        ? h(
            'div',
            { class: 'project-list', dataset: { dropZone: 'project', zoneId: 'projects' } },
            visible.map((project) => {
              const progress = projectProgress(project, subtasksOfProject(subtasks, project.id));
              const finished = !isProjectOpen(project);
              return h(
                'div',
                { class: cls('project-row', finished && 'is-finished'), dataset: { dragItem: 'project', id: project.id } },
                h(
                  'button',
                  { type: 'button', class: 'grip', 'data-drag-handle': true, 'aria-label': `Reorder ${project.name}`, dataset: { focusKey: `pgrip:${project.id}` } },
                  icon('grip'),
                ),
                h(
                  'a',
                  { class: 'project-main', href: `#/projects/${project.id}`, dataset: { focusKey: `plink:${project.id}` } },
                  h('span', { class: 'project-name' }, project.name),
                  h(
                    'span',
                    { class: 'task-meta' },
                    project.status !== PROJECT_STATUS.ACTIVE ? h('span', { class: 'chip chip-cancelled' }, PROJECT_STATUS_LABELS[project.status]) : null,
                    project.priority <= 2 ? priorityChip(project.priority) : null,
                    deadlineChip(project, finished, now),
                  ),
                ),
                progressBar(progress, `${project.name} progress`),
              );
            }),
          )
        : h(
            'div',
            { class: 'empty' },
            icon('projects'),
            h('h2', null, all.length ? 'No projects here' : 'No projects yet'),
            h('p', null, all.length ? 'Try another filter.' : 'Create a project for longer work, break it into subtasks, and pull pieces into your days.'),
          ),
    ),
  );
}

// -------------------------------------------------------------- detail view

// Time tracked on the project's daily tasks (and their subtasks).
function linkedTaskMs(linkedTasks) {
  const { finished, open } = trackingIndex();
  const ids = new Set(linkedTasks.map((t) => t.id));
  store.all('tasks').forEach((t) => ids.has(t.parentTaskId) && ids.add(t.id));
  let total = 0;
  ids.forEach((id) => (total += finished.get(id) || 0));
  if (open && ids.has(open.taskId)) total += sessionMs(open);
  return total;
}

function subtaskRow(subtask, project, now) {
  const done = subtask.status === SUBTASK_STATUS.DONE;
  const priority = projectSubtaskPriority(subtask, project);
  return h(
    'div',
    { class: 'task-block', dataset: { dragItem: 'psub', dragScope: project.id, id: subtask.id } },
    h(
      'div',
      { class: cls('task-row psub-row', `prio-${priority}`, done && 'is-done') },
      h(
        'button',
        { type: 'button', class: 'grip', 'data-drag-handle': true, 'aria-label': `Reorder ${subtask.title}`, dataset: { focusKey: `psgrip:${subtask.id}` } },
        icon('grip'),
      ),
      h('input', {
        type: 'checkbox',
        class: 'check',
        checked: done,
        'aria-label': `${done ? 'Mark incomplete' : 'Complete'}: ${subtask.title}`,
        dataset: { action: 'psub-toggle', id: subtask.id, focusKey: `pscheck:${subtask.id}` },
      }),
      h('input', {
        type: 'text',
        class: 'inline-input psub-title',
        value: subtask.title,
        maxlength: 500,
        'aria-label': 'Subtask title',
        dataset: { action: 'psub-field', field: 'title', id: subtask.id, focusKey: `pstitle:${subtask.id}` },
      }),
      h(
        'div',
        { class: 'psub-props' },
        deadlineChip(subtask, done, now),
        h('input', {
          type: 'date',
          class: 'input input-compact',
          value: subtask.deadline || '',
          'aria-label': `Deadline for ${subtask.title}`,
          title: 'Deadline',
          dataset: { action: 'psub-field', field: 'deadline', id: subtask.id, focusKey: `psdeadline:${subtask.id}` },
        }),
        h(
          'select',
          {
            class: 'select input-compact',
            'aria-label': `Priority for ${subtask.title}`,
            title: 'Priority',
            dataset: { action: 'psub-field', field: 'priority', id: subtask.id, focusKey: `psprio:${subtask.id}` },
          },
          h('option', { value: '', selected: subtask.priority == null }, `Inherit (${priorityInfo(project.priority).label})`),
          PRIORITIES.map((p) => h('option', { value: String(p.value), selected: subtask.priority === p.value }, p.label)),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn sm',
            'aria-label': `Add ${subtask.title} to today`,
            title: 'Add to today',
            disabled: done,
            dataset: { action: 'psub-today', id: subtask.id },
          },
          icon('today'),
        ),
        h(
          'button',
          { type: 'button', class: 'icon-btn sm', 'aria-label': `Delete ${subtask.title}`, title: 'Delete subtask', dataset: { action: 'psub-delete', id: subtask.id } },
          icon('trash'),
        ),
      ),
    ),
  );
}

export function renderProject(root, { id }) {
  const project = getProject(id);
  if (!project) {
    root.replaceChildren(
      h(
        'div',
        { class: 'view' },
        h('a', { class: 'btn btn-sm btn-ghost back-link', href: '#/projects' }, icon('back'), 'Projects'),
        h('div', { class: 'empty' }, icon('projects'), h('h2', null, 'Project not found'), h('p', null, 'It may have been deleted.')),
      ),
    );
    return;
  }

  const today = todayKey();
  const now = new Date();
  const subtasks = subtasksOfProject(store.all('projectSubtasks'), project.id);
  const progress = projectProgress(project, subtasks);
  const finished = !isProjectOpen(project);
  const linked = store
    .all('tasks')
    .filter((t) => t.projectId === project.id && !t.parentTaskId)
    .sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));
  const upcomingLinked = linked.filter((t) => t.scheduledDate >= today);
  const pastLinked = linked.filter((t) => t.scheduledDate < today);
  const series = store.all('recurrenceRules').filter((r) => r.projectId === project.id && (!r.endDate || r.endDate >= today));

  const linkedRow = (task) =>
    h(
      'li',
      { class: 'linked-row' },
      h('span', { class: cls('status-dot', `status-${task.status}`), title: task.status }),
      h('a', { href: task.scheduledDate === today ? '#/today' : `#/day/${task.scheduledDate}`, class: 'faint linked-date' }, formatFriendlyDate(task.scheduledDate, today)),
      h('button', { type: 'button', class: 'link', dataset: { action: 'open-task', id: task.id } }, task.title),
      task.projectSubtaskId ? h('span', { class: 'faint' }, '· subtask') : null,
    );

  root.replaceChildren(
    h(
      'div',
      { class: 'view project-view' },
      h('a', { class: 'btn btn-sm btn-ghost back-link', href: '#/projects' }, icon('back'), 'Projects'),
      h('input', {
        type: 'text',
        class: 'inline-input project-title',
        value: project.name,
        maxlength: 200,
        'aria-label': 'Project name',
        dataset: { action: 'project-field', field: 'name', id: project.id, focusKey: 'project-name' },
      }),
      h(
        'div',
        { class: 'project-props' },
        h(
          'label',
          null,
          h('span', { class: 'field-label' }, 'Status'),
          h(
            'select',
            { class: 'select', dataset: { action: 'project-field', field: 'status', id: project.id, focusKey: 'project-status' } },
            Object.values(PROJECT_STATUS).map((value) => h('option', { value, selected: project.status === value }, PROJECT_STATUS_LABELS[value])),
          ),
        ),
        h(
          'label',
          null,
          h('span', { class: 'field-label' }, 'Priority'),
          h(
            'select',
            { class: 'select', dataset: { action: 'project-field', field: 'priority', id: project.id, focusKey: 'project-priority' } },
            PRIORITIES.map((p) => h('option', { value: String(p.value), selected: project.priority === p.value }, `${p.label} — ${p.name}`)),
          ),
        ),
        h(
          'label',
          null,
          h('span', { class: 'field-label' }, 'Deadline'),
          h(
            'span',
            { class: 'inline' },
            h('input', {
              type: 'date',
              class: 'input',
              value: project.deadline || '',
              dataset: { action: 'project-field', field: 'deadline', id: project.id, focusKey: 'project-deadline' },
            }),
            h('input', {
              type: 'time',
              class: 'input',
              value: project.deadlineTime || '',
              disabled: !project.deadline,
              'aria-label': 'Deadline time (optional)',
              dataset: { action: 'project-field', field: 'deadlineTime', id: project.id, focusKey: 'project-deadline-time' },
            }),
          ),
        ),
        h(
          'div',
          null,
          h('span', { class: 'field-label' }, 'Created'),
          h('span', { class: 'faint' }, formatLongDate(project.createdAt.slice(0, 10), today)),
        ),
      ),
      project.deadline ? h('div', { class: 'task-meta', style: { marginLeft: 0, marginBottom: '10px' } }, deadlineChip(project, finished, now)) : null,
      h(
        'div',
        { class: 'project-progress-large' },
        progressBar(progress, 'Project progress'),
        h('span', { class: 'faint' }, progress.total ? `${progress.percent}% of subtasks done` : 'Add subtasks to track progress'),
      ),
      progress.total && progress.done === progress.total && !finished
        ? h(
            'div',
            { class: 'notice' },
            icon('check'),
            h('div', { class: 'notice-body' }, 'All subtasks are done.'),
            h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'project-complete', id: project.id } }, 'Mark project completed'),
          )
        : null,
      h(
        'div',
        { class: 'project-actions' },
        h(
          'button',
          { type: 'button', class: 'btn btn-primary', disabled: finished, dataset: { action: 'project-add-today', id: project.id } },
          icon('today'),
          'Add to today',
        ),
        h('span', { class: 'faint', style: { fontSize: '12.5px' } }, 'Completing the daily task does not complete the project.'),
      ),
      renderTimeSection({
        type: 'project',
        id: project.id,
        extraMs: linkedTaskMs(linked),
        extraLabel: 'Plus time on linked daily tasks',
      }),
      h(
        'section',
        { class: 'drawer-section' },
        h('label', { class: 'field-label', for: 'p-description' }, 'Description'),
        h('textarea', {
          class: 'textarea',
          id: 'p-description',
          placeholder: 'Goal, scope, links…',
          value: project.description || '',
          dataset: { action: 'project-field', field: 'description', id: project.id, focusKey: 'project-description' },
        }),
      ),
      h(
        'section',
        { class: 'list-section' },
        h('h2', null, 'Subtasks', h('span', { class: 'section-count' }, String(subtasks.length))),
        h(
          'div',
          { class: 'task-list', dataset: { dropZone: 'psub', zoneId: project.id, dropScope: project.id } },
          subtasks.map((subtask) => subtaskRow(subtask, project, now)),
        ),
        h(
          'form',
          { class: 'add-row', dataset: { action: 'psub-add', id: project.id } },
          icon('plus'),
          h('input', {
            name: 'title',
            type: 'text',
            placeholder: 'Add subtask',
            autocomplete: 'off',
            maxlength: 500,
            'aria-label': 'Add project subtask',
            dataset: { focusKey: 'psub-add' },
          }),
        ),
      ),
      series.length || linked.length
        ? h(
            'section',
            { class: 'list-section' },
            h('h2', null, 'Scheduled work'),
            series.map((rule) => h('p', { class: 'faint', style: { fontSize: '13.5px', marginBottom: '6px' } }, icon('repeat'), ` “${rule.title}” · ${describeRule(rule)}`)),
            upcomingLinked.length ? h('ul', { class: 'linked-list' }, upcomingLinked.slice().reverse().map(linkedRow)) : null,
            pastLinked.length
              ? h(
                  'details',
                  { class: 'linked-past' },
                  h('summary', null, `Past days (${pastLinked.length})`),
                  h('ul', { class: 'linked-list' }, pastLinked.slice(0, 100).map(linkedRow)),
                )
              : null,
          )
        : null,
      h(
        'div',
        { class: 'project-danger' },
        h('button', { type: 'button', class: 'btn btn-danger', dataset: { action: 'project-delete', id: project.id } }, icon('trash'), 'Delete project'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ actions

registerActions({
  'project-filter': (el) => {
    listState.filter = el.dataset.value;
    ui.render();
  },
  'new-project': async () => {
    const values = await formDialog({
      title: 'New project',
      submitLabel: 'Create project',
      fields: [{ name: 'name', label: 'Name', placeholder: 'e.g. Quran memorization extension', required: true }],
    });
    if (!values) return;
    const project = await createProject(values.name);
    if (project) navigate(`#/projects/${project.id}`);
  },
  'project-field': async (el) => {
    const { id, field } = el.dataset;
    const project = getProject(id);
    if (!project) return;
    const value = el.value;
    switch (field) {
      case 'name':
        if (value.trim()) await updateProject(id, { name: value.trim() });
        else ui.render();
        return;
      case 'description':
        return updateProject(id, { description: value });
      case 'priority':
        return updateProject(id, { priority: Number(value) });
      case 'status':
        return setProjectStatus(id, value);
      case 'deadline':
        return updateProject(id, isDateKey(value) ? { deadline: value } : { deadline: null, deadlineTime: null });
      case 'deadlineTime':
        return updateProject(id, { deadlineTime: isTimeValue(value) ? value : null });
    }
  },
  'project-complete': (el) => setProjectStatus(el.dataset.id, PROJECT_STATUS.COMPLETED),
  'project-add-today': async (el) => {
    const project = getProject(el.dataset.id);
    if (!project) return;
    const values = await formDialog({
      title: 'Add project to today',
      description: 'Creates a daily task that refers to this project. Completing it does not complete the project.',
      submitLabel: 'Add to today',
      fields: [
        { name: 'title', label: 'Task title', value: `Work on ${project.name}`, required: true },
        {
          name: 'repeat',
          type: 'radio',
          label: 'How often',
          value: 'once',
          options: [
            { value: 'once', label: 'Just today' },
            { value: 'daily', label: 'Every day until the project is completed', hint: 'One task per day; missing a day never affects the others.' },
          ],
        },
      ],
    });
    if (!values) return;
    await addProjectToDay(project.id, todayKey(), { title: values.title, repeatUntilDone: values.repeat === 'daily' });
    toast(values.repeat === 'daily' ? 'Added to today, repeating daily until the project is completed' : 'Added to today', {
      actionLabel: 'View',
      onAction: () => navigate('#/today'),
    });
  },
  'project-delete': async (el) => {
    const project = getProject(el.dataset.id);
    if (!project) return;
    const ok = await confirmDialog({
      title: `Delete “${project.name}”?`,
      message: 'The project and its subtasks are permanently deleted. Daily tasks that referred to it are kept as ordinary tasks, and any repeating project work stops today.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    await deleteProject(project.id);
    navigate('#/projects');
  },
  'psub-add': async (form) => {
    const input = form.elements.title;
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    await createProjectSubtask(form.dataset.id, title);
  },
  'psub-toggle': (el) => toggleProjectSubtask(el.dataset.id),
  'psub-field': async (el) => {
    const { id, field } = el.dataset;
    if (!getProjectSubtask(id)) return;
    if (field === 'title') {
      if (el.value.trim()) await updateProjectSubtask(id, { title: el.value });
      else ui.render();
    } else if (field === 'deadline') {
      await updateProjectSubtask(id, { deadline: isDateKey(el.value) ? el.value : null });
    } else if (field === 'priority') {
      await updateProjectSubtask(id, { priority: el.value === '' ? null : Number(el.value) });
    }
  },
  'psub-today': async (el) => {
    const { existing } = await addSubtaskToDay(el.dataset.id, todayKey());
    toast(existing ? 'Already on today’s list' : 'Added to today', { actionLabel: 'View', onAction: () => navigate('#/today') });
  },
  'psub-delete': async (el) => {
    const subtask = getProjectSubtask(el.dataset.id);
    if (!subtask) return;
    const linkedCount = store.all('tasks').filter((t) => t.projectSubtaskId === subtask.id).length;
    const ok = await confirmDialog({
      title: `Delete “${subtask.title}”?`,
      message: linkedCount
        ? `${linkedCount} daily task${linkedCount === 1 ? '' : 's'} refer to it and will be kept as project work.`
        : 'This removes the subtask from the project.',
      confirmLabel: 'Delete subtask',
      danger: true,
    });
    if (ok) await deleteProjectSubtask(subtask.id);
  },
});

