import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineLabel, deadlineStatus } from '../js/domain/deadlines.js';

const now = new Date(2026, 10, 10, 18, 0); // Nov 10, 18:00 local

test('date-only deadlines use calendar days', () => {
  assert.equal(deadlineStatus('2026-11-09', null, now), 'overdue');
  assert.equal(deadlineStatus('2026-11-10', null, now), 'urgent');
  assert.equal(deadlineStatus('2026-11-11', null, now), 'approaching');
  assert.equal(deadlineStatus('2026-11-13', null, now), 'approaching');
  assert.equal(deadlineStatus('2026-11-14', null, now), 'normal');
});

test('timed deadlines use exact remaining time', () => {
  assert.equal(deadlineStatus('2026-11-10', '17:00', now), 'overdue');
  assert.equal(deadlineStatus('2026-11-11', '17:59', now), 'urgent');
  assert.equal(deadlineStatus('2026-11-11', '18:01', now), 'approaching');
  assert.equal(deadlineStatus('2026-11-13', '18:00', now), 'approaching');
  assert.equal(deadlineStatus('2026-11-13', '18:01', now), 'normal');
});

test('no deadline means no status', () => {
  assert.equal(deadlineStatus(null, null, now), null);
  assert.equal(deadlineLabel(null, null, now), '');
});

test('deadline labels read naturally', () => {
  assert.equal(deadlineLabel('2026-11-10', null, now), 'Due today');
  assert.equal(deadlineLabel('2026-11-11', '09:00', now), 'Due tomorrow 09:00');
  assert.equal(deadlineLabel('2026-11-14', null, now), 'Due in 4 days');
  assert.equal(deadlineLabel('2026-11-08', null, now), 'Overdue by 2 days');
  assert.equal(deadlineLabel('2026-11-10', '12:00', now), 'Overdue · today 12:00');
  assert.equal(deadlineLabel('2026-11-30', null, now), 'Due Nov 30');
});
