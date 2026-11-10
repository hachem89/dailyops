// Islamic reminders bundled with the app (no network request at runtime).
//
// Every Arabic text below is an exact excerpt of its primary source, recorded
// in data/islamic-sources.json by scripts/fetch-islamic-sources.mjs and
// verified by tests/islamicContent.test.js:
//   Quran  — Tanzil Quran Text (Simple)
//   Hadith — the six books as published on sunnah.com (Arabic text and grades)
// Texts are shown in Arabic only and are never machine-translated.
// Sunan items are included only when al-Albani graded them sahih or hasan; all
// recorded grades are shown with the item. `occasion` keeps the original context
// so no item is presented as prescribed specifically for tasks.
//
// Item fields:
//   id, type ('quran' | 'dhikr' | 'dua' | 'gratitude'), moment ('before' | 'after'),
//   themes ('tawakkul' | 'knowledge' | 'work' | 'rizq' | 'gratitude' | 'dhikr'),
//   text, reference, source ({ kind: 'quran', surah, from, to } |
//   { kind: 'hadith', collection, number }), grade?, occasion?

const quran = (surah, from, to = from) => ({ kind: 'quran', surah, from, to });
const hadith = (collection, number) => ({ kind: 'hadith', collection, number });

const COLLECTION_NAMES = {
  bukhari: 'Sahih al-Bukhari',
  muslim: 'Sahih Muslim',
  abudawud: 'Sunan Abi Dawud',
  tirmidhi: "Jami' at-Tirmidhi",
  nasai: "Sunan an-Nasa'i",
  ibnmajah: 'Sunan Ibn Majah',
};

export function referenceOf(source) {
  if (source.kind === 'quran') {
    return source.from === source.to ? `Quran ${source.surah}:${source.from}` : `Quran ${source.surah}:${source.from}–${source.to}`;
  }
  return `${COLLECTION_NAMES[source.collection]} ${source.number}`;
}

export function sourceUrl(source) {
  if (source.kind === 'quran') return `https://quran.com/${source.surah}/${source.from}${source.to !== source.from ? `-${source.to}` : ''}`;
  return `https://sunnah.com/${source.collection}:${source.number}`;
}

const ITEMS = [
  // ------------------------------------------------------------ before a task
  { id: 'q-3-159', type: 'quran', moment: 'before', themes: ['tawakkul'], source: quran(3, 159),
    text: 'فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى اللَّهِ ۚ إِنَّ اللَّهَ يُحِبُّ الْمُتَوَكِّلِينَ' },
  { id: 'q-53-39', type: 'quran', moment: 'before', themes: ['work'], source: quran(53, 39),
    text: 'وَأَنْ لَيْسَ لِلْإِنْسَانِ إِلَّا مَا سَعَىٰ' },
  { id: 'q-20-114', type: 'dua', moment: 'before', themes: ['knowledge'], source: quran(20, 114),
    text: 'وَقُلْ رَبِّ زِدْنِي عِلْمًا' },
  { id: 'h-ibnmajah-925', type: 'dua', moment: 'before', themes: ['knowledge', 'rizq', 'work'], source: hadith('ibnmajah', 925),
    grade: 'Sahih (al-Albani)', occasion: 'Said after the Fajr prayer',
    text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلاً مُتَقَبَّلاً' },
  { id: 'q-11-88', type: 'quran', moment: 'before', themes: ['tawakkul', 'work'], source: quran(11, 88),
    text: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ ۚ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ' },
  { id: 'q-9-105', type: 'quran', moment: 'before', themes: ['work'], source: quran(9, 105),
    text: 'وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ' },
  { id: 'q-20-25-28', type: 'dua', moment: 'before', themes: ['work', 'knowledge'], source: quran(20, 25, 28),
    text: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي يَفْقَهُوا قَوْلِي' },
  { id: 'h-bukhari-4205', type: 'dhikr', moment: 'before', themes: ['tawakkul', 'dhikr'], source: hadith('bukhari', 4205),
    grade: 'Sahih (in Sahih al-Bukhari)',
    text: 'لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ' },
  { id: 'q-96-1', type: 'quran', moment: 'before', themes: ['knowledge'], source: quran(96, 1),
    text: 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ' },
  { id: 'q-65-3', type: 'quran', moment: 'before', themes: ['tawakkul'], source: quran(65, 3),
    text: 'وَمَنْ يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ۚ إِنَّ اللَّهَ بَالِغُ أَمْرِهِ' },
  { id: 'q-67-15', type: 'quran', moment: 'before', themes: ['work', 'rizq'], source: quran(67, 15),
    text: 'هُوَ الَّذِي جَعَلَ لَكُمُ الْأَرْضَ ذَلُولًا فَامْشُوا فِي مَنَاكِبِهَا وَكُلُوا مِنْ رِزْقِهِ ۖ وَإِلَيْهِ النُّشُورُ' },
  { id: 'h-bukhari-6363', type: 'dua', moment: 'before', themes: ['work'], source: hadith('bukhari', 6363),
    grade: 'Sahih (in Sahih al-Bukhari)',
    text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ، وَغَلَبَةِ الرِّجَالِ' },
  { id: 'q-58-11', type: 'quran', moment: 'before', themes: ['knowledge'], source: quran(58, 11),
    text: 'يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنْكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ' },
  { id: 'q-18-23-24', type: 'quran', moment: 'before', themes: ['tawakkul'], source: quran(18, 23, 24),
    text: 'وَلَا تَقُولَنَّ لِشَيْءٍ إِنِّي فَاعِلٌ ذَٰلِكَ غَدًا إِلَّا أَنْ يَشَاءَ اللَّهُ' },
  { id: 'q-18-10', type: 'dua', moment: 'before', themes: ['tawakkul', 'work'], source: quran(18, 10),
    text: 'رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا' },
  { id: 'q-62-10', type: 'quran', moment: 'before', themes: ['work', 'rizq', 'dhikr'], source: quran(62, 10),
    text: 'فَإِذَا قُضِيَتِ الصَّلَاةُ فَانْتَشِرُوا فِي الْأَرْضِ وَابْتَغُوا مِنْ فَضْلِ اللَّهِ وَاذْكُرُوا اللَّهَ كَثِيرًا لَعَلَّكُمْ تُفْلِحُونَ' },
  { id: 'h-muslim-2722', type: 'dua', moment: 'before', themes: ['knowledge'], source: hadith('muslim', 2722),
    grade: 'Sahih (in Sahih Muslim)',
    text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لاَ يَنْفَعُ وَمِنْ قَلْبٍ لاَ يَخْشَعُ وَمِنْ نَفْسٍ لاَ تَشْبَعُ وَمِنْ دَعْوَةٍ لاَ يُسْتَجَابُ لَهَا' },
  { id: 'q-94-5-6', type: 'quran', moment: 'before', themes: ['tawakkul', 'work'], source: quran(94, 5, 6),
    text: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا إِنَّ مَعَ الْعُسْرِ يُسْرًا' },
  { id: 'q-28-24', type: 'dua', moment: 'before', themes: ['rizq', 'work'], source: quran(28, 24),
    text: 'رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ' },
  { id: 'q-39-9', type: 'quran', moment: 'before', themes: ['knowledge'], source: quran(39, 9),
    text: 'قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ' },
  { id: 'h-abudawud-5095', type: 'dhikr', moment: 'before', themes: ['tawakkul'], source: hadith('abudawud', 5095),
    grade: 'Sahih (al-Albani)', occasion: 'Said when leaving home',
    text: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ' },
  { id: 'q-29-69', type: 'quran', moment: 'before', themes: ['work'], source: quran(29, 69),
    text: 'وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا ۚ وَإِنَّ اللَّهَ لَمَعَ الْمُحْسِنِينَ' },
  { id: 'q-2-286', type: 'quran', moment: 'before', themes: ['work', 'tawakkul'], source: quran(2, 286),
    text: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا' },
  { id: 'h-abudawud-5090', type: 'dua', moment: 'before', themes: ['tawakkul'], source: hadith('abudawud', 5090),
    grade: 'Hasan isnad (al-Albani)', occasion: 'Supplication in times of distress',
    text: 'اللَّهُمَّ رَحْمَتَكَ أَرْجُو فَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ وَأَصْلِحْ لِي شَأْنِي كُلَّهُ لاَ إِلَهَ إِلاَّ أَنْتَ' },
  { id: 'q-3-173', type: 'quran', moment: 'before', themes: ['tawakkul', 'dhikr'], source: quran(3, 173),
    text: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ' },
  { id: 'q-13-28', type: 'quran', moment: 'before', themes: ['dhikr'], source: quran(13, 28),
    text: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ' },
  { id: 'q-33-41-42', type: 'quran', moment: 'before', themes: ['dhikr'], source: quran(33, 41, 42),
    text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اذْكُرُوا اللَّهَ ذِكْرًا كَثِيرًا وَسَبِّحُوهُ بُكْرَةً وَأَصِيلًا' },

  // ------------------------------------------------------- after completing
  { id: 'q-94-7-8', type: 'quran', moment: 'after', themes: ['work', 'gratitude'], source: quran(94, 7, 8),
    text: 'فَإِذَا فَرَغْتَ فَانْصَبْ وَإِلَىٰ رَبِّكَ فَارْغَبْ' },
  { id: 'h-ibnmajah-3803', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: hadith('ibnmajah', 3803),
    grade: 'Hasan (al-Albani)', occasion: 'Said on seeing something pleasing',
    text: 'الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ' },
  { id: 'q-14-7', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: quran(14, 7),
    text: 'لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُمْ' },
  { id: 'q-2-127', type: 'dua', moment: 'after', themes: ['work'], source: quran(2, 127),
    text: 'رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ' },
  { id: 'h-muslim-2694', type: 'dhikr', moment: 'after', themes: ['dhikr'], source: hadith('muslim', 2694),
    grade: 'Sahih (in Sahih Muslim)',
    text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ سُبْحَانَ اللَّهِ الْعَظِيمِ' },
  { id: 'q-27-40', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: quran(27, 40),
    text: 'هَٰذَا مِنْ فَضْلِ رَبِّي لِيَبْلُوَنِي أَأَشْكُرُ أَمْ أَكْفُرُ' },
  { id: 'h-abudawud-1522', type: 'dua', moment: 'after', themes: ['gratitude', 'dhikr'], source: hadith('abudawud', 1522),
    grade: 'Sahih (al-Albani)', occasion: 'Advised after every prayer',
    text: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ' },
  { id: 'q-1-2', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: quran(1, 2),
    text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
  { id: 'q-46-15', type: 'dua', moment: 'after', themes: ['gratitude', 'work'], source: quran(46, 15),
    text: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ' },
  { id: 'h-muslim-2999', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: hadith('muslim', 2999),
    grade: 'Sahih (in Sahih Muslim)',
    text: 'عَجَبًا لأَمْرِ الْمُؤْمِنِ إِنَّ أَمْرَهُ كُلَّهُ خَيْرٌ وَلَيْسَ ذَاكَ لأَحَدٍ إِلاَّ لِلْمُؤْمِنِ إِنْ أَصَابَتْهُ سَرَّاءُ شَكَرَ فَكَانَ خَيْرًا لَهُ وَإِنْ أَصَابَتْهُ ضَرَّاءُ صَبَرَ فَكَانَ خَيْرًا لَهُ' },
  { id: 'q-2-152', type: 'gratitude', moment: 'after', themes: ['gratitude', 'dhikr'], source: quran(2, 152),
    text: 'فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ' },
  { id: 'h-muslim-2137', type: 'dhikr', moment: 'after', themes: ['dhikr'], source: hadith('muslim', 2137),
    grade: 'Sahih (in Sahih Muslim)',
    text: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلاَ إِلَهَ إِلاَّ اللَّهُ وَاللَّهُ أَكْبَرُ' },
  { id: 'q-16-18', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: quran(16, 18),
    text: 'وَإِنْ تَعُدُّوا نِعْمَةَ اللَّهِ لَا تُحْصُوهَا' },
  { id: 'h-muslim-2734', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: hadith('muslim', 2734),
    grade: 'Sahih (in Sahih Muslim)',
    text: 'إِنَّ اللَّهَ لَيَرْضَى عَنِ الْعَبْدِ أَنْ يَأْكُلَ الأَكْلَةَ فَيَحْمَدَهُ عَلَيْهَا أَوْ يَشْرَبَ الشَّرْبَةَ فَيَحْمَدَهُ عَلَيْهَا' },
  { id: 'q-10-10', type: 'gratitude', moment: 'after', themes: ['gratitude'], source: quran(10, 10),
    text: 'وَآخِرُ دَعْوَاهُمْ أَنِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
];

export const ISLAMIC_CONTENT = Object.freeze(ITEMS.map((item) => Object.freeze({ ...item, reference: referenceOf(item.source) })));

export const CONTENT_TYPES = { quran: 'Quran', dhikr: 'Dhikr', dua: 'Dua', gratitude: 'Gratitude' };
