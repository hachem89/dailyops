// Calendar dates are stored as local "YYYY-MM-DD" keys. Never use toISOString()
// to derive a date key: it converts to UTC and shifts the day near midnight.

const pad = (n) => String(n).padStart(2, '0');
const LOCALE = 'en-US';

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDateKey(value)) === value;
}

export function isTimeValue(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// Whole calendar days from `from` to `to` (positive when `to` is later). DST-safe.
export function diffDays(from, to) {
  const utc = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

export function relativeDayLabel(key, today = todayKey()) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return null;
}

export function formatLongDate(key, today = todayKey()) {
  const date = parseDateKey(key);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatShortDate(key, today = todayKey()) {
  const date = parseDateKey(key);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(LOCALE, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatWeekday(key) {
  return parseDateKey(key).toLocaleDateString(LOCALE, { weekday: 'short' });
}

// "Today", "Tomorrow", "Yesterday" or a short date.
export function formatFriendlyDate(key, today = todayKey()) {
  return relativeDayLabel(key, today) ?? formatShortDate(key, today);
}

export function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "1h 05m", "12m", "<1m" — for tracked time.
export function formatMs(ms) {
  const minutes = Math.floor(ms / 60000);
  if (ms > 0 && minutes === 0) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// "1:05:09" — for a running timer.
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
