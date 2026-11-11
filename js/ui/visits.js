// Optional, anonymous visit counting, kept separate from the personal database.
//
// When the site owner sets CONFIG.goatcounterCode, each page load sends one
// request to GoatCounter containing only a constant path ("/") and title. The
// function takes no arguments and reads no app data, so tasks, projects, notes
// and reminders can never be included. The request is skipped on local
// development hosts, when the browser signals Do Not Track or Global Privacy
// Control, and when the visitor turns counting off in Settings.
import { CONFIG } from '../config.js';
import { getSetting } from '../domain/settings.js';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/;

export function visitCountingStatus() {
  const code = CONFIG.goatcounterCode;
  return {
    configured: !!code,
    provider: code ? `GoatCounter (${code}.goatcounter.com)` : null,
    optedOut: getSetting('countVisits') === false,
    browserSignal: navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true,
    localHost: LOCAL_HOST.test(location.hostname),
  };
}

let counted = false;

export function countVisit() {
  const status = visitCountingStatus();
  if (counted || !status.configured || status.optedOut || status.browserSignal || status.localHost) return false;
  counted = true;
  const params = new URLSearchParams({ p: '/', t: 'DailyOps', rnd: Math.random().toString(36).slice(2) });
  const pixel = new Image();
  pixel.referrerPolicy = 'no-referrer';
  pixel.src = `https://${encodeURIComponent(CONFIG.goatcounterCode)}.goatcounter.com/count?${params}`;
  return true;
}
