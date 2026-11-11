// Application bootstrap: load data, wire up UI services, render on change.
import * as store from './core/store.js';
import { todayKey } from './utils/dates.js';
import { captureFocus, isTypingTarget, restoreFocus } from './utils/dom.js';
import { seedDefaultCategories } from './domain/categories.js';
import { arrangeGroups } from './domain/groups.js';
import { arrangeProjectSubtasks, arrangeProjects } from './domain/projects.js';
import { ensureOccurrences } from './domain/repeat.js';
import { ensureAfterReminders, ensureDailyReminder } from './domain/reminders.js';
import { addDays } from './utils/dates.js';
import { getSetting } from './domain/settings.js';
import { arrangeSubtasks, arrangeTasks, moveTaskToGroupEnd } from './domain/tasks.js';
import { bindActions, ui } from './ui/actions.js';
import { closeDrawer, initDrawer, openTask, refreshDrawer } from './ui/components/drawer.js';
import { closeMenu } from './ui/components/menu.js';
import { toast } from './ui/components/toast.js';
import './ui/components/taskActions.js';
import { enableSortable, moveWithKeyboard } from './ui/dnd.js';
import { parseHash } from './ui/router.js';
import { renderSidebar } from './ui/sidebar.js';
import { renderTimerBar, runningClock } from './ui/components/timerBar.js';
import { setTitle, startLiveClock } from './ui/live.js';
import { closeSlashMenu, initSlashMenu } from './ui/components/slashMenu.js';
import { initShortcuts } from './ui/shortcuts.js';
import { promptNewProject } from './ui/views/projects.js';
import { runSlashCommand } from './ui/views/today.js';
import { rescheduleTask } from './domain/tasks.js';
import { countVisit } from './ui/visits.js';
import './ui/backup.js';
import { formatFriendlyDate } from './utils/dates.js';
import { applyTheme, watchSystemTheme } from './ui/theme.js';
import { renderArchive } from './ui/views/archive.js';
import { renderAnalytics } from './ui/views/analytics.js';
import { renderProject, renderProjects } from './ui/views/projects.js';
import { loadStorageInfo, renderSettings } from './ui/views/settings.js';
import { renderToday } from './ui/views/today.js';
import { renderUpcoming } from './ui/views/upcoming.js';

const VIEWS = {
  today: { render: renderToday, title: 'Today' },
  day: { render: renderToday, title: 'Day' },
  upcoming: { render: renderUpcoming, title: 'Upcoming' },
  projects: { render: renderProjects, title: 'Projects' },
  project: { render: renderProject, title: 'Project' },
  analytics: { render: renderAnalytics, title: 'Analytics' },
  archive: { render: renderArchive, title: 'Archive' },
  settings: { render: renderSettings, title: 'Settings' },
};

const app = document.getElementById('app');
const sidebarEl = document.getElementById('sidebar');
const mainEl = document.getElementById('main');
const viewRoot = document.getElementById('view-root');

let route = parseHash();
let renderedRouteKey = null;
let currentDay = todayKey();

const routeKey = (r) => `${r.name}:${r.date ?? r.id ?? ''}`;

// Dates whose recurring occurrences should exist before the view renders.
function occurrenceDates(r) {
  const today = todayKey();
  if (r.name === 'today') return [today];
  if (r.name === 'day') return [r.date];
  if (r.name === 'upcoming') return Array.from({ length: 8 }, (_, i) => addDays(today, i));
  return [];
}

function render() {
  app.classList.toggle('sidebar-collapsed', !!getSetting('sidebarCollapsed'));
  applyTheme();
  renderSidebar(sidebarEl, route);
  renderTimerBar(document.getElementById('timer-bar'));

  ensureOccurrences(occurrenceDates(route));
  ensureAfterReminders();
  if (route.name === 'today') ensureDailyReminder();

  const focus = captureFocus(viewRoot);
  const scrollTop = mainEl.scrollTop;
  const view = VIEWS[route.name];
  view.render(viewRoot, route);
  restoreFocus(viewRoot, focus);

  const key = routeKey(route);
  mainEl.scrollTop = key === renderedRouteKey ? scrollTop : 0;
  renderedRouteKey = key;
  const clock = runningClock();
  setTitle(`${view.title} · DailyOps`, clock?.since ?? null, clock?.base ?? 0);

  refreshDrawer();
}

function handleDrop({ type, id, zoneId, orderedIds, date }) {
  if (date) {
    if (type !== 'task') return;
    return rescheduleTask(id, date).then(() => toast(`Moved to ${formatFriendlyDate(date)}`));
  }
  if (type === 'task') return orderedIds ? arrangeTasks(zoneId, orderedIds) : moveTaskToGroupEnd(id, zoneId);
  if (type === 'subtask') return arrangeSubtasks(orderedIds);
  if (type === 'group') return arrangeGroups(orderedIds);
  if (type === 'project') return arrangeProjects(orderedIds);
  if (type === 'psub') return arrangeProjectSubtasks(orderedIds);
}

function onKeydown(event) {
  if (document.querySelector('dialog[open]')) return;

  if (event.key === 'Escape') {
    if (closeMenu() || closeSlashMenu()) return;
    if (app.classList.contains('sidebar-open')) {
      app.classList.remove('sidebar-open');
      return;
    }
    if (closeDrawer()) event.preventDefault();
    return;
  }

  // Alt+ArrowUp/Down moves the focused task, subtask or group.
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !isTypingTarget(event.target)) {
    const item = event.target.closest?.('[data-drag-item]');
    if (!item || !app.contains(item)) return;
    const result = moveWithKeyboard(item, event.key === 'ArrowUp' ? -1 : 1);
    if (result) {
      event.preventDefault();
      handleDrop(result);
    }
  }
}

function showFatalError(error) {
  console.error(error);
  viewRoot.replaceChildren();
  const box = document.createElement('div');
  box.className = 'view';
  box.innerHTML = '<div class="empty"><h2>DailyOps could not start</h2><p></p></div>';
  box.querySelector('p').textContent = `${error.message || error}. Your browser may block storage (for example in some private windows).`;
  viewRoot.append(box);
}

async function start() {
  try {
    await store.init();
    await seedDefaultCategories();
  } catch (error) {
    showFatalError(error);
    return;
  }

  ui.render = render;
  ui.openTask = openTask;
  ui.closeDrawer = closeDrawer;

  store.onError((error) => toast(`Could not save: ${error.message || error}`, { type: 'error', duration: 8000 }));
  bindActions(app);
  initDrawer({ onDrop: handleDrop });
  enableSortable(mainEl, { onDrop: handleDrop, scrollContainer: mainEl });
  initSlashMenu(app, {
    onCommand: (command, context) => (command === 'mode-changed' ? render() : runSlashCommand(command, context)),
  });
  initShortcuts({ newProject: () => promptNewProject() });
  document.addEventListener('keydown', onKeydown);
  document.getElementById('scrim-nav').addEventListener('click', () => app.classList.remove('sidebar-open'));

  window.addEventListener('hashchange', () => {
    route = parseHash();
    render();
  });
  store.subscribe(render);
  watchSystemTheme();
  window.matchMedia('(max-width: 768px)').addEventListener('change', render);

  // Re-render when the calendar day changes while the app stays open, so
  // yesterday's unfinished tasks become overdue without a reload.
  setInterval(() => {
    if (todayKey() !== currentDay) {
      currentDay = todayKey();
      route = parseHash();
      render();
    }
  }, 30000);

  render();
  startLiveClock();
  countVisit();
  loadStorageInfo().then(() => route.name === 'settings' && render());
}

start();
