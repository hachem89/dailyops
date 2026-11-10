import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolItems, poolKey, takeNext, themeForTask } from '../js/domain/reminderRotation.js';
import { ISLAMIC_CONTENT } from '../js/content/islamic.js';

test('rotation walks a pool without repetition until it is exhausted', () => {
  const key = poolKey('after');
  const size = poolItems(ISLAMIC_CONTENT, key).length;
  let state = {};
  const seen = [];
  for (let i = 0; i < size; i++) {
    const next = takeNext(state, key, ISLAMIC_CONTENT);
    seen.push(next.item.id);
    state = next.state;
  }
  assert.equal(new Set(seen).size, size, 'no item repeats within one cycle');
  // The next cycle starts again from the first item.
  assert.equal(takeNext(state, key, ISLAMIC_CONTENT).item.id, seen[0]);
});

test('rotation state is plain data that survives serialization (refresh)', () => {
  const key = poolKey('before', 'knowledge');
  let state = {};
  const first = takeNext(state, key, ISLAMIC_CONTENT);
  state = JSON.parse(JSON.stringify(first.state));
  const second = takeNext(state, key, ISLAMIC_CONTENT);
  assert.notEqual(second.item.id, first.item.id);
});

test('pools are independent', () => {
  let state = {};
  state = takeNext(state, 'after', ISLAMIC_CONTENT).state;
  state = takeNext(state, 'after', ISLAMIC_CONTENT).state;
  const before = takeNext(state, 'before:work', ISLAMIC_CONTENT);
  assert.equal(before.item.id, poolItems(ISLAMIC_CONTENT, 'before:work')[0].id);
});

test('contextual pools match their themes', () => {
  assert.ok(poolItems(ISLAMIC_CONTENT, 'before:knowledge').every((i) => i.themes.includes('knowledge')));
  assert.ok(poolItems(ISLAMIC_CONTENT, 'before:work').every((i) => i.themes.includes('work') || i.themes.includes('rizq')));
  assert.ok(poolItems(ISLAMIC_CONTENT, 'after').every((i) => i.moment === 'after'));
  assert.ok(poolItems(ISLAMIC_CONTENT, 'daily').every((i) => i.type === 'quran'));
});

test('task context comes from its category or project', () => {
  assert.equal(themeForTask({}, { name: 'Study & Learning' }), 'knowledge');
  assert.equal(themeForTask({}, { name: 'Career & Applications' }), 'work');
  assert.equal(themeForTask({ projectId: 'p' }, null), 'work');
  assert.equal(themeForTask({}, { name: 'Sports & Health' }), 'general');
  assert.equal(themeForTask({}, null), 'general');
});

test('a corrupted index falls back to the start of the pool', () => {
  const { item } = takeNext({ after: -3 }, 'after', ISLAMIC_CONTENT);
  assert.equal(item.id, poolItems(ISLAMIC_CONTENT, 'after')[0].id);
});
