import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  diffDays,
  isDateKey,
  isTimeValue,
  relativeDayLabel,
  toDateKey,
  formatDuration,
} from '../js/utils/dates.js';

test('toDateKey uses local calendar date, not UTC', () => {
  assert.equal(toDateKey(new Date(2026, 10, 10, 23, 59)), '2026-11-10');
  assert.equal(toDateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('diffDays counts calendar days in both directions', () => {
  assert.equal(diffDays('2026-11-10', '2026-11-14'), 4);
  assert.equal(diffDays('2026-11-14', '2026-11-10'), -4);
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2); // across a DST change in many zones
});

test('isDateKey rejects malformed and impossible dates', () => {
  assert.ok(isDateKey('2026-11-10'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.ok(!isDateKey('2026-1-1'));
  assert.ok(!isDateKey(null));
});

test('isTimeValue accepts HH:mm only', () => {
  assert.ok(isTimeValue('09:30'));
  assert.ok(isTimeValue('23:59'));
  assert.ok(!isTimeValue('24:00'));
  assert.ok(!isTimeValue('9:30'));
});

test('relativeDayLabel names nearby days', () => {
  assert.equal(relativeDayLabel('2026-11-10', '2026-11-10'), 'Today');
  assert.equal(relativeDayLabel('2026-11-11', '2026-11-10'), 'Tomorrow');
  assert.equal(relativeDayLabel('2026-11-09', '2026-11-10'), 'Yesterday');
  assert.equal(relativeDayLabel('2026-11-15', '2026-11-10'), null);
});

test('formatDuration renders hours and minutes', () => {
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(95), '1h 35m');
});
