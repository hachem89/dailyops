// Development tool: downloads the primary-source texts behind every item in
// js/content/islamic.js and writes a small snapshot to data/islamic-sources.json.
// tests/islamicContent.test.js then proves that every displayed Arabic text is
// an exact excerpt of its recorded source. The app itself never fetches this.
//
//   node scripts/fetch-islamic-sources.mjs
//
// Sources:
//   Quran  — Tanzil "Simple" text (quran-simple), via api.alquran.cloud
//   Hadith — Arabic text and grades of the six books as published on sunnah.com,
//            via the open dataset github.com/fawazahmed0/hadith-api (jsDelivr CDN)
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ISLAMIC_CONTENT } from '../js/content/islamic.js';

const CACHE = join(process.cwd(), '.cache', 'islamic-sources');
const OUT = join(process.cwd(), 'data', 'islamic-sources.json');
const QURAN_URL = 'https://api.alquran.cloud/v1/quran/quran-simple';
const HADITH_URL = (edition) => `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${edition}.json`;

async function cached(name, url) {
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(file, await res.text());
  }
  return JSON.parse(await readFile(file, 'utf8'));
}

await mkdir(CACHE, { recursive: true });
await mkdir(join(process.cwd(), 'data'), { recursive: true });

const snapshot = {
  generatedAt: new Date().toISOString(),
  sources: {
    quran: { edition: 'quran-simple', name: 'Tanzil Quran Text (Simple)', via: QURAN_URL },
    hadith: { name: 'sunnah.com texts via fawazahmed0/hadith-api', via: HADITH_URL('<edition>') },
  },
  quran: {},
  hadith: {},
};

const quran = (await cached('quran-simple.json', QURAN_URL)).data;
const editions = {};

for (const item of ISLAMIC_CONTENT) {
  const { source } = item;
  if (source.kind === 'quran') {
    const surah = quran.surahs[source.surah - 1];
    for (let a = source.from; a <= source.to; a++) {
      const ayah = surah.ayahs.find((x) => x.numberInSurah === a);
      if (!ayah) throw new Error(`Missing ${source.surah}:${a}`);
      snapshot.quran[`${source.surah}:${a}`] = ayah.text.replace(/^﻿/, '');
    }
  } else {
    const { collection, number } = source;
    editions[`ara-${collection}`] ??= await cached(`ara-${collection}.json`, HADITH_URL(`ara-${collection}`));
    // Sahih Muslim is numbered by Fuad Abd al-Baqi in `arabicnumber`; the
    // other collections use the common numbering in `hadithnumber`.
    const matches = editions[`ara-${collection}`].hadiths.filter((h) =>
      collection === 'muslim' ? Math.floor(Number(h.arabicnumber)) === number : h.hadithnumber === number,
    );
    if (!matches.length) throw new Error(`Missing ${collection} ${number}`);
    let grades = [];
    if (!['bukhari', 'muslim'].includes(collection)) {
      editions[`eng-${collection}`] ??= await cached(`eng-${collection}.json`, HADITH_URL(`eng-${collection}`));
      grades = editions[`eng-${collection}`].hadiths.find((h) => h.hadithnumber === number)?.grades ?? [];
    }
    snapshot.hadith[`${collection}:${number}`] = { text: matches.map((h) => h.text).join('\n'), grades };
  }
}

await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${Object.keys(snapshot.quran).length} verses and ${Object.keys(snapshot.hadith).length} hadith to ${OUT}`);
