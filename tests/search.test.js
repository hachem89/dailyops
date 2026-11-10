import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../js/domain/search.js';
import { matchCommands, parseSlash } from '../js/ui/slashCommands.js';

const data = {
  tasks: [
    { id: 't1', title: 'Review lecture notes', description: '', notes: '', status: 'open', updatedAt: '2026-11-10' },
    { id: 't2', title: 'Write cover letter', description: 'for the lecture position', notes: '', status: 'done', updatedAt: '2026-11-11' },
    { id: 't3', title: 'Lecture prep', parentTaskId: 't1', status: 'open', updatedAt: '2026-11-09' },
    { id: 'h', kind: 'heading', title: 'Lecture block', status: 'open' },
    { id: 't4', title: 'Café meeting', status: 'open' },
  ],
  projects: [{ id: 'p1', name: 'Lecture series', description: '', status: 'active' }],
  projectSubtasks: [{ id: 's1', title: 'Record lecture 1', status: 'open' }],
};

test('search ranks title prefixes first and skips layout blocks', () => {
  const results = search(data, 'lecture');
  const ids = results.map((r) => r.item.id);
  assert.ok(!ids.includes('h'), 'headings are not searchable tasks');
  // Open items whose title starts with the query come first.
  assert.deepEqual(ids.slice(0, 2).sort(), ['p1', 't3']);
  assert.equal(ids.at(-1), 't2', 'a description-only match ranks last');
  assert.ok(ids.includes('t2'), 'description matches are included');
  assert.equal(results.find((r) => r.item.id === 't3').kind, 'subtask');
  assert.equal(results.find((r) => r.item.id === 's1').kind, 'projectSubtask');
});

test('every word must match; accents are ignored; empty query returns nothing', () => {
  assert.deepEqual(search(data, 'review notes').map((r) => r.item.id), ['t1']);
  assert.deepEqual(search(data, 'review cover'), []);
  assert.deepEqual(search(data, 'cafe').map((r) => r.item.id), ['t4']);
  assert.deepEqual(search(data, '   '), []);
});

test('slash input is parsed into a command word and the remaining name', () => {
  assert.deepEqual(parseSlash('/'), { query: '', rest: '' });
  assert.deepEqual(parseSlash('/proj Thesis app'), { query: 'proj', rest: 'Thesis app' });
  assert.equal(parseSlash('Buy milk'), null);
});

test('slash commands match by name, word or keyword', () => {
  assert.equal(matchCommands('').length, 5);
  assert.equal(matchCommands('h')[0].id, 'heading');
  assert.deepEqual(matchCommands('head').map((c) => c.id), ['heading']);
  assert.deepEqual(matchCommands('gr').map((c) => c.id), ['group']);
  assert.deepEqual(matchCommands('line').map((c) => c.id), ['divider']);
  assert.deepEqual(matchCommands('p').map((c) => c.id), ['project']);
  assert.deepEqual(matchCommands('zzz'), []);
});
