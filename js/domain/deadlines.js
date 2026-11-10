// Deadline urgency rules. A deadline is a date with an optional time.
//
// With a time, urgency is measured precisely from `now`:
//   passed → overdue, ≤ 24h → urgent, ≤ 3 days → approaching, else normal.
// Without a time, the deadline means "by the end of that day", and urgency is
// measured in calendar days so that "due in 3 days" always reads as approaching:
//   before today → overdue, today → urgent, 1–3 days → approaching, else normal.
import { diffDays, isTimeValue, parseDateKey, toDateKey, formatShortDate } from '../utils/dates.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;

export const DEADLINE_STATUSES = ['overdue', 'urgent', 'approaching', 'normal'];

export function deadlineMoment(date, time) {
  if (!date) return null;
  const moment = parseDateKey(date);
  if (isTimeValue(time)) {
    const [h, m] = time.split(':').map(Number);
    moment.setHours(h, m, 0, 0);
  } else {
    moment.setHours(23, 59, 59, 999);
  }
  return moment;
}

export function deadlineStatus(date, time, now = new Date()) {
  if (!date) return null;
  if (isTimeValue(time)) {
    const remaining = deadlineMoment(date, time) - now;
    if (remaining < 0) return 'overdue';
    if (remaining <= DAY) return 'urgent';
    if (remaining <= 3 * DAY) return 'approaching';
    return 'normal';
  }
  const days = diffDays(toDateKey(now), date);
  if (days < 0) return 'overdue';
  if (days === 0) return 'urgent';
  if (days <= 3) return 'approaching';
  return 'normal';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function deadlineLabel(date, time, now = new Date()) {
  if (!date) return '';
  const today = toDateKey(now);
  const days = diffDays(today, date);
  const timePart = isTimeValue(time) ? ` ${time}` : '';
  const status = deadlineStatus(date, time, now);

  if (status === 'overdue') {
    if (days >= 0) return `Overdue · today${timePart}`;
    return `Overdue by ${plural(-days, 'day')}`;
  }
  if (days === 0) return `Due today${timePart}`;
  if (days === 1) return `Due tomorrow${timePart}`;
  if (days < 7) return `Due in ${plural(days, 'day')}`;
  return `Due ${formatShortDate(date, today)}`;
}
