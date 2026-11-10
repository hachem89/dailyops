import * as store from '../core/store.js';
import { h } from '../utils/dom.js';
import { todayKey } from '../utils/dates.js';
import { getSetting, setSetting } from '../domain/settings.js';
import { overdueTasks } from '../domain/taskQueries.js';
import { registerActions } from './actions.js';
import { icon } from './icons.js';
import { resolveTheme } from './theme.js';
import { navSection } from './router.js';
import { openSearch } from './components/searchDialog.js';

const NAV = [
  { id: 'today', label: 'Today', icon: 'today', href: '#/today' },
  { id: 'upcoming', label: 'Upcoming', icon: 'upcoming', href: '#/upcoming' },
  { id: 'projects', label: 'Projects', icon: 'projects', href: '#/projects' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics', href: '#/analytics' },
  { id: 'archive', label: 'Archive', icon: 'archive', href: '#/archive' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '#/settings' },
];

export function renderSidebar(root, route) {
  const active = navSection(route);
  const overdue = overdueTasks(store.all('tasks'), todayKey()).length;
  const collapsed = getSetting('sidebarCollapsed');
  const dark = resolveTheme() === 'dark';

  root.replaceChildren(
    h(
      'div',
      { class: 'sidebar-head' },
      h('a', { class: 'brand', href: '#/today', 'aria-label': 'DailyOps, go to Today' }, h('img', { src: 'assets/icon.svg', alt: '' }), h('span', null, 'DailyOps')),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn sidebar-collapse-btn',
          'aria-label': collapsed ? 'Expand sidebar' : 'Collapse sidebar',
          title: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
          'aria-expanded': String(!collapsed),
          dataset: { action: 'toggle-sidebar' },
        },
        icon('sidebar'),
      ),
    ),
    h(
      'div',
      { class: 'nav' },
      h(
        'button',
        { type: 'button', class: 'nav-link search-link', dataset: { action: 'open-search' }, title: 'Search (Ctrl+K)' },
        icon('search'),
        h('span', { class: 'label' }, 'Search'),
        h('kbd', { class: 'label' }, /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K'),
      ),
    ),
    h(
      'nav',
      { class: 'nav', 'aria-label': 'Main' },
      NAV.map((item) =>
        h(
          'a',
          {
            class: 'nav-link',
            href: item.href,
            'aria-current': item.id === active ? 'page' : null,
            title: collapsed ? item.label : null,
            dataset:
              item.id === 'today'
                ? { action: 'nav-link', dropZone: 'task', zoneId: 'date:today', dropPosition: 'date', dropDate: todayKey() }
                : { action: 'nav-link' },
          },
          icon(item.icon),
          h('span', { class: 'label' }, item.label),
          item.id === 'today' && overdue
            ? h('span', { class: 'nav-badge', title: `${overdue} overdue`, 'aria-label': `${overdue} overdue` }, String(overdue))
            : null,
        ),
      ),
    ),
    h(
      'div',
      { class: 'sidebar-foot' },
      h(
        'button',
        {
          type: 'button',
          class: 'nav-link',
          'aria-label': dark ? 'Switch to light theme' : 'Switch to dark theme',
          title: dark ? 'Light theme' : 'Dark theme',
          dataset: { action: 'toggle-theme' },
        },
        icon(dark ? 'sun' : 'moon'),
        h('span', { class: 'label' }, dark ? 'Light theme' : 'Dark theme'),
      ),
      h('p', { class: 'sidebar-note' }, 'Stored only in this browser. No account, no cloud.'),
    ),
  );
}

registerActions({
  'open-search': () => {
    document.getElementById('app').classList.remove('sidebar-open');
    openSearch();
  },
  'toggle-sidebar': () => setSetting('sidebarCollapsed', !getSetting('sidebarCollapsed')),
  'toggle-theme': () => setSetting('theme', resolveTheme() === 'dark' ? 'light' : 'dark'),
  // Closes the off-canvas sidebar on mobile after navigating.
  'nav-link': () => document.getElementById('app').classList.remove('sidebar-open'),
  'open-sidebar': () => document.getElementById('app').classList.add('sidebar-open'),
  'close-sidebar': () => document.getElementById('app').classList.remove('sidebar-open'),
});
