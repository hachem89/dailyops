// Proves that every Islamic reminder is an exact excerpt of its recorded primary
// source (data/islamic-sources.json, produced by scripts/fetch-islamic-sources.mjs)
// and that its reference and authenticity grade match that source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ISLAMIC_CONTENT, referenceOf } from '../js/content/islamic.js';

const snapshot = JSON.parse(readFileSync(new URL('../data/islamic-sources.json', import.meta.url), 'utf8'));

// Texts are compared under Unicode canonical equivalence (NFC): the order of
// stacked diacritics such as shadda + fatha may differ in storage but is the
// same text. Otherwise only invisible direction/BOM marks and whitespace runs
// are normalized; every letter, diacritic and punctuation mark must match.
const normalize = (s) =>
  s
    .normalize('NFC')
    .replace(/[‏‎﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function sourceText(source) {
  if (source.kind === 'quran') {
    const verses = [];
    for (let a = source.from; a <= source.to; a++) {
      const verse = snapshot.quran[`${source.surah}:${a}`];
      assert.ok(verse, `snapshot is missing Quran ${source.surah}:${a}`);
      verses.push(verse);
    }
    return verses.join(' ');
  }
  const entry = snapshot.hadith[`${source.collection}:${source.number}`];
  assert.ok(entry, `snapshot is missing ${source.collection} ${source.number}`);
  return entry.text;
}

for (const item of ISLAMIC_CONTENT) {
  test(`${item.id} (${item.reference}) is an exact excerpt of its source`, () => {
    assert.ok(item.text.trim().length > 0);
    assert.ok(/[؀-ۿ]/.test(item.text), 'text must be Arabic');
    assert.ok(
      normalize(sourceText(item.source)).includes(normalize(item.text)),
      `“${item.text}” does not appear verbatim in ${item.reference}`,
    );
    assert.equal(item.reference, referenceOf(item.source));
  });
}

test('hadith grades match the recorded grading and meet the inclusion rule', () => {
  for (const item of ISLAMIC_CONTENT.filter((i) => i.source.kind === 'hadith')) {
    const { collection, number } = item.source;
    assert.ok(item.grade, `${item.id} needs a grade`);
    if (collection === 'bukhari' || collection === 'muslim') {
      assert.match(item.grade, /^Sahih \(in Sahih (al-Bukhari|Muslim)\)$/);
      continue;
    }
    const albani = snapshot.hadith[`${collection}:${number}`].grades.find((g) => g.name === 'Al-Albani');
    assert.ok(albani, `${item.id}: no al-Albani grade recorded`);
    const recorded = albani.grade.toLowerCase();
    assert.ok(/^(sahih|hasan)/.test(recorded), `${item.id}: al-Albani grade "${albani.grade}" is below the inclusion rule`);
    assert.ok(item.grade.toLowerCase().startsWith(recorded.split(' ')[0]), `${item.id}: grade label does not match "${albani.grade}"`);
    assert.equal(/isn?aa?d/.test(recorded), /isnad/.test(item.grade.toLowerCase()), `${item.id}: isnad qualifier mismatch`);
    assert.match(item.grade, /\(al-Albani\)$/);
  }
});

test('collection is well-formed and every rotation pool has content', () => {
  const ids = ISLAMIC_CONTENT.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const item of ISLAMIC_CONTENT) {
    assert.ok(['quran', 'dhikr', 'dua', 'gratitude'].includes(item.type), item.id);
    assert.ok(['before', 'after'].includes(item.moment), item.id);
    assert.ok(item.themes.length > 0, item.id);
  }
  const before = ISLAMIC_CONTENT.filter((i) => i.moment === 'before');
  assert.ok(before.filter((i) => i.themes.includes('knowledge')).length >= 4);
  assert.ok(before.filter((i) => i.themes.some((t) => t === 'work' || t === 'rizq')).length >= 4);
  assert.ok(before.filter((i) => i.themes.includes('tawakkul')).length >= 4);
  assert.ok(ISLAMIC_CONTENT.filter((i) => i.moment === 'after').length >= 8);
  for (const type of ['quran', 'dhikr', 'dua', 'gratitude']) {
    assert.ok(ISLAMIC_CONTENT.some((i) => i.type === type), `no ${type} items`);
  }
});
