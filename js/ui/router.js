// Hash-based routing (works on GitHub Pages without server configuration).
import { isDateKey, todayKey } from '../utils/dates.js';

const SIMPLE_ROUTES = new Set(['today', 'upcoming', 'projects', 'analytics', 'archive', 'settings']);

export function parseHash(hash = location.hash) {
  const [name, param] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'day' && isDateKey(param)) {
    return param === todayKey() ? { name: 'today' } : { name: 'day', date: param };
  }
  if (name === 'projects' && param) return { name: 'project', id: decodeURIComponent(param) };
  return SIMPLE_ROUTES.has(name) ? { name } : { name: 'today' };
}

export function navigate(href) {
  if (location.hash === href) return;
  location.hash = href;
}

// The sidebar entry a route belongs to.
export function navSection(route) {
  if (route.name === 'day') return 'today';
  if (route.name === 'project') return 'projects';
  return route.name;
}
