import * as store from '../core/store.js';

const DEFAULTS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  defaultPriority: 3,
  showExecutionTimes: true,
  todaySort: 'manual', // 'manual' | 'time'
  sidebarCollapsed: false,
  mobileNoticeDismissed: false,
  collapsed: {}, // ui section id → true when collapsed
  seededDefaults: false,
};

export function getSetting(key) {
  const record = store.get('settings', key);
  return record ? record.value : DEFAULTS[key];
}

export function setSetting(key, value) {
  return store.put('settings', { key, value });
}

export function isCollapsed(sectionId) {
  return !!getSetting('collapsed')[sectionId];
}

export function toggleCollapsed(sectionId) {
  const collapsed = { ...getSetting('collapsed') };
  if (collapsed[sectionId]) delete collapsed[sectionId];
  else collapsed[sectionId] = true;
  return setSetting('collapsed', collapsed);
}

export function forgetCollapsed(sectionIds) {
  const collapsed = { ...getSetting('collapsed') };
  let changed = false;
  sectionIds.forEach((id) => {
    if (collapsed[id]) {
      delete collapsed[id];
      changed = true;
    }
  });
  return changed ? setSetting('collapsed', collapsed) : Promise.resolve();
}
