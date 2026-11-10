// Live elapsed-time text. Elements declare where their count starts; a single
// one-second ticker rewrites only their text, so typing elsewhere is never
// interrupted by a re-render.
//   data-live-since = running session start (ms), data-live-base = earlier ms,
//   data-live-format = 'clock' (1:05:09) | 'short' (1h 05m)
import { h } from '../utils/dom.js';
import { formatClock, formatMs } from '../utils/dates.js';

let baseTitle = document.title;
let titleClock = null;

const format = (ms, kind) => (kind === 'short' ? formatMs(ms) : formatClock(ms));

export function liveElapsed(sinceMs, baseMs = 0, kind = 'clock') {
  return h(
    'span',
    { class: 'live-elapsed', dataset: { liveSince: String(sinceMs), liveBase: String(baseMs), liveFormat: kind } },
    format(baseMs + Date.now() - sinceMs, kind),
  );
}

// Shows the running timer in the browser tab title.
export function setTitle(title, runningSince = null, runningBase = 0) {
  baseTitle = title;
  titleClock = runningSince == null ? null : { since: runningSince, base: runningBase };
  tick();
}

export function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-live-since]').forEach((el) => {
    const ms = Number(el.dataset.liveBase || 0) + now - Number(el.dataset.liveSince);
    el.textContent = format(ms, el.dataset.liveFormat);
  });
  document.title = titleClock ? `▶ ${formatClock(titleClock.base + now - titleClock.since)} · ${baseTitle}` : baseTitle;
}

export function startLiveClock() {
  setInterval(tick, 1000);
}
