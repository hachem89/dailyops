import { getSetting } from '../domain/settings.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(preference = getSetting('theme')) {
  if (preference === 'light' || preference === 'dark') return preference;
  return media.matches ? 'dark' : 'light';
}

export function applyTheme() {
  const preference = getSetting('theme');
  document.documentElement.dataset.theme = resolveTheme(preference);
  // Mirrored in localStorage only so index.html can apply it before first paint.
  try {
    localStorage.setItem('dailyops.theme', preference);
  } catch {
    /* storage unavailable: the theme still applies once the app loads */
  }
}

export function watchSystemTheme() {
  media.addEventListener('change', () => {
    if (getSetting('theme') === 'system') applyTheme();
  });
}
