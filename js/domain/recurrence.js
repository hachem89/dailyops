// Pure recurrence rules. A rule describes when a task repeats; each date it
// occurs on gets its own task record (an occurrence) keyed by rule + date.
import { diffDays, parseDateKey, addDays } from '../utils/dates.js';

export const FREQ = Object.freeze({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' });

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKWEEK = [1, 2, 3, 4, 5];

export const weekdayOf = (key) => parseDateKey(key).getDay();
const mondayOf = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

export const occurrenceKey = (ruleId, date) => `${ruleId}@${date}`;

// Cleans a user-supplied pattern; `startDate` provides sensible defaults.
export function normalizePattern(pattern, startDate) {
  const frequency = Object.values(FREQ).includes(pattern.frequency) ? pattern.frequency : FREQ.DAILY;
  const interval = Math.min(365, Math.max(1, Math.floor(Number(pattern.interval) || 1)));
  const result = { frequency, interval, weekdays: [], monthDay: null };
  if (frequency === FREQ.WEEKLY) {
    const days = [...new Set((pattern.weekdays || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
    result.weekdays = days.length ? days : [weekdayOf(startDate)];
  }
  if (frequency === FREQ.MONTHLY) {
    const day = Math.floor(Number(pattern.monthDay));
    result.monthDay = day >= 1 && day <= 31 ? day : Number(startDate.slice(8, 10));
  }
  return result;
}

export function occursOn(rule, date) {
  if (!rule || date < rule.startDate || (rule.endDate && date > rule.endDate)) return false;
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case FREQ.DAILY:
      return diffDays(rule.startDate, date) % interval === 0;
    case FREQ.WEEKLY: {
      if (!(rule.weekdays || []).includes(weekdayOf(date))) return false;
      const weeks = diffDays(mondayOf(rule.startDate), mondayOf(date)) / 7;
      return weeks % interval === 0;
    }
    case FREQ.MONTHLY: {
      const [y, m, d] = date.split('-').map(Number);
      const [sy, sm] = rule.startDate.split('-').map(Number);
      if (((y - sy) * 12 + (m - sm)) % interval !== 0) return false;
      // Day 31 falls on the last day of shorter months.
      return d === Math.min(rule.monthDay, daysInMonth(y, m - 1));
    }
    default:
      return false;
  }
}

// Which (rule, date) occurrences are missing for the given dates. Existing
// occurrences are matched by rule and occurrence date, never by title, so
// re-running this (e.g. on every refresh) never creates duplicates.
export function plannedOccurrences(rules, tasks, dates) {
  const existing = new Set(
    tasks.filter((t) => t.recurrenceRuleId && t.occurrenceDate).map((t) => occurrenceKey(t.recurrenceRuleId, t.occurrenceDate)),
  );
  const planned = [];
  for (const date of dates) {
    for (const rule of rules) {
      const key = occurrenceKey(rule.id, date);
      if (!existing.has(key) && occursOn(rule, date)) {
        existing.add(key);
        planned.push({ rule, date });
      }
    }
  }
  return planned;
}

const listDays = (days) => days.map((d) => WEEKDAYS_SHORT[d]).join(', ');

export function describeRule(rule) {
  if (!rule) return '';
  const n = rule.interval || 1;
  let text;
  if (rule.frequency === FREQ.DAILY) {
    text = n === 1 ? 'Every day' : `Every ${n} days`;
  } else if (rule.frequency === FREQ.WEEKLY) {
    const days = rule.weekdays || [];
    const workweek = days.length === 5 && WORKWEEK.every((d) => days.includes(d));
    if (n === 1) {
      if (days.length === 7) text = 'Every day';
      else if (workweek) text = 'Every weekday';
      else if (days.length === 1) text = `Every ${WEEKDAYS[days[0]]}`;
      else text = `Every ${listDays(days)}`;
    } else {
      text = `Every ${n} weeks on ${workweek ? 'weekdays' : listDays(days)}`;
    }
  } else if (rule.frequency === FREQ.MONTHLY) {
    text = n === 1 ? `Monthly on day ${rule.monthDay}` : `Every ${n} months on day ${rule.monthDay}`;
  } else {
    return '';
  }
  return rule.untilProjectDone ? `${text} until the project is completed` : text;
}

export function repeatPresets(date) {
  const day = weekdayOf(date);
  const monthDay = Number(date.slice(8, 10));
  return [
    { id: 'daily', label: 'Every day', pattern: { frequency: FREQ.DAILY, interval: 1 } },
    { id: 'weekdays', label: 'Every weekday (Mon–Fri)', pattern: { frequency: FREQ.WEEKLY, interval: 1, weekdays: WORKWEEK } },
    { id: 'weekly', label: `Every ${WEEKDAYS[day]}`, pattern: { frequency: FREQ.WEEKLY, interval: 1, weekdays: [day] } },
    { id: 'monthly', label: `Monthly on day ${monthDay}`, pattern: { frequency: FREQ.MONTHLY, interval: 1, monthDay } },
  ];
}

export function samePattern(rule, pattern) {
  if (!rule || rule.frequency !== pattern.frequency || (rule.interval || 1) !== (pattern.interval || 1)) return false;
  if (pattern.frequency === FREQ.WEEKLY) return (rule.weekdays || []).join() === (pattern.weekdays || []).join();
  if (pattern.frequency === FREQ.MONTHLY) return rule.monthDay === pattern.monthDay;
  return true;
}
