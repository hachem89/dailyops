// Global search (Ctrl/Cmd + K) across tasks, subtasks, projects and project
// subtasks. Arrow keys move, Enter opens, Escape closes.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { formatFriendlyDate, todayKey } from '../../utils/dates.js';
import { PROJECT_STATUS_LABELS } from '../../domain/projectQueries.js';
import { search } from '../../domain/search.js';
import { ui } from '../actions.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';

let current = null;

// Cleans up directly instead of relying on the 'close' event, which is not
// dispatched reliably after a programmatic close() in every browser.
function closeSearch() {
  if (!current) return;
  const { dialog } = current;
  current = null;
  if (dialog.open) dialog.close();
  dialog.remove();
}

const KIND = {
  task: { icon: 'today', label: 'Task' },
  subtask: { icon: 'subtask', label: 'Subtask' },
  project: { icon: 'projects', label: 'Project' },
  projectSubtask: { icon: 'subtask', label: 'Project subtask' },
};

const dayHref = (date) => (date === todayKey() ? '#/today' : `#/day/${date}`);

function describe(result, today) {
  const { kind, item } = result;
  const tasks = (id) => store.get('tasks', id);
  const project = (id) => store.get('projects', id);
  const status = { done: 'Completed', cancelled: 'Cancelled', skipped: 'Skipped' }[item.status];
  if (kind === 'task') return [item.scheduledDate && formatFriendlyDate(item.scheduledDate, today), status, project(item.projectId)?.name];
  if (kind === 'subtask') {
    const parent = tasks(item.parentTaskId);
    return [parent && `in “${parent.title}”`, parent?.scheduledDate && formatFriendlyDate(parent.scheduledDate, today), status];
  }
  if (kind === 'project') return [PROJECT_STATUS_LABELS[item.status]];
  return [project(item.projectId)?.name, item.status === 'done' ? 'Completed' : null];
}

function openResult(result) {
  const { kind, item } = result;
  closeSearch();
  if (kind === 'task' || kind === 'subtask') {
    const owner = kind === 'subtask' ? store.get('tasks', item.parentTaskId) : item;
    if (owner?.scheduledDate) navigate(dayHref(owner.scheduledDate));
    ui.openTask(item.id);
  } else {
    navigate(`#/projects/${kind === 'project' ? item.id : item.projectId}`);
  }
}

export function openSearch() {
  if (current) {
    current.input.focus();
    return;
  }
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search tasks, subtasks and projects…',
    'aria-label': 'Search',
    autocomplete: 'off',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'search-results',
  });
  const list = h('div', { class: 'search-results', id: 'search-results', role: 'listbox' });
  const dialog = h(
    'dialog',
    { class: 'dialog search-dialog', 'aria-label': 'Search' },
    h('div', { class: 'search-head' }, icon('search'), input, h('kbd', null, 'Esc')),
    list,
  );
  const state = { results: [], active: 0 };

  const renderResults = () => {
    const today = todayKey();
    const query = input.value.trim();
    state.results = search(
      { tasks: store.all('tasks'), projects: store.all('projects'), projectSubtasks: store.all('projectSubtasks') },
      query,
      { today },
    );
    state.active = Math.min(state.active, Math.max(0, state.results.length - 1));
    if (!query) {
      list.replaceChildren(h('p', { class: 'search-empty' }, 'Type to search everything stored on this device.'));
      input.removeAttribute('aria-activedescendant');
      return;
    }
    if (!state.results.length) {
      list.replaceChildren(h('p', { class: 'search-empty' }, `No results for “${query}”.`));
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.replaceChildren(
      ...state.results.map((result, index) => {
        const kind = KIND[result.kind];
        const finished = ['done', 'cancelled', 'skipped', 'completed'].includes(result.item.status);
        return h(
          'button',
          {
            type: 'button',
            id: `search-${index}`,
            class: cls('search-result', index === state.active && 'active', finished && 'is-finished'),
            role: 'option',
            'aria-selected': String(index === state.active),
            onmousemove: () => {
              if (state.active !== index) {
                state.active = index;
                renderResults();
              }
            },
            onclick: () => openResult(result),
          },
          icon(kind.icon),
          h('span', { class: 'search-title' }, result.item.title ?? result.item.name),
          h('span', { class: 'search-meta' }, [kind.label, ...describe(result, today)].filter(Boolean).join(' · ')),
        );
      }),
    );
    input.setAttribute('aria-activedescendant', `search-${state.active}`);
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    state.active = 0;
    renderResults();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!state.results.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      state.active = (state.active + delta + state.results.length) % state.results.length;
      renderResults();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = state.results[state.active];
      if (result) openResult(result);
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSearch(); // click on the backdrop
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault(); // Escape
    closeSearch();
  });
  dialog.addEventListener('close', closeSearch);

  document.body.append(dialog);
  current = { dialog, input };
  dialog.showModal();
  renderResults();
  input.focus();
}
