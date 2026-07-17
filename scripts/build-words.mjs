// Builds src/games/words/{common,extended}.ts from Lexique 3.83 (lexique.org, CC BY-SA).
// COMMON = frequency-top content words per length (game solutions / puzzle bases).
// EXTENDED = broader acceptance tier (guess/bonus validation), disjoint from COMMON.
// Usage: node scripts/build-words.mjs   (TSV cached in scripts/.cache/)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CACHE = 'scripts/.cache/lexique383.tsv';
const URL = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv';
const OUT_DIR = 'src/games/words';

const MIN_LEN = 3, MAX_LEN = 8;
// Per-length COMMON quotas (top by frequency). Sized so Motus (6-8) and the
// crossword/boggle short bands (3-5) all have healthy pools.
const COMMON_QUOTA = { 3: 300, 4: 450, 5: 550, 6: 600, 7: 600, 8: 500 };
// Puzzle pool per length — noun/adjective/adverb/infinitive only (Lettres Croisées).
const PUZZLE_QUOTA = { 3: 250, 4: 500, 5: 650, 6: 700, 7: 650, 8: 350 };
const EXTENDED_CAP = 35000;
const EXTENDED_MIN_FREQ = 0.03; // films+books occurrences per million — low floor: accept most real words, drop OCR noise
const CONTENT_POS = new Set(['NOM', 'VER', 'ADJ', 'ADV']);
// Real French words below the frequency cutoff that games still need accepted —
// mots-meles THEMES words in the 3-8 range (kept in sync by mots-meles/themes.test.ts).
const MUST_INCLUDE = [
	'ABRICOT', 'MANGUE', 'POIREAU', 'EPINARD', 'NAVET', 'CELERI', 'POIVRON', 'COURGE',
	'PANDA', 'JUDO', 'ALGUE', 'SARDINE', 'TULIPE', 'PIVOINE', 'OEILLET', 'PERCEUSE',
	'RABOT', 'CRIQUET', 'SCARABEE', 'SORBET', 'MACARON',
];

// Kept out of COMMON (never a solution/base) but still accepted as guesses via EXTENDED.
const NOT_A_SOLUTION = new Set([
	'MERDE', 'MERDES', 'PUTAIN', 'PUTAINS', 'BORDEL', 'CONNARD', 'CONNARDS', 'CONNASSE', 'CONNE', 'CONNES',
	'SALOPE', 'SALOPES', 'SALAUD', 'SALAUDS', 'PUTE', 'PUTES', 'BITE', 'BITES', 'COUILLE', 'COUILLES',
	'CHIER', 'CHIE', 'CHIENT', 'FOUTRE', 'FOUT', 'FOUTU', 'FOUTUE', 'FOUTUS', 'ENCULE', 'ENCULES', 'ENCULER',
	'NIQUER', 'NIQUE', 'CUL', 'CULS', 'PISSE', 'PISSER', 'BAISER', 'BAISE', 'BAISES', 'BAISENT', 'BRANLE', 'BRANLER',
]);

const normalize = (w) =>
	w.toLowerCase().replaceAll('œ', 'oe').replaceAll('æ', 'ae')
		.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();

async function loadTsv() {
	if (!existsSync(CACHE)) {
		console.log(`Downloading ${URL} …`);
		await mkdir(path.dirname(CACHE), { recursive: true });
		const res = await fetch(URL);
		if (!res.ok) throw new Error(`Lexique download failed: HTTP ${res.status}`);
		await writeFile(CACHE, Buffer.from(await res.arrayBuffer()));
	}
	return readFile(CACHE, 'utf8');
}

function collect(tsv) {
	const lines = tsv.split('\n');
	const header = lines[0].trim().split('\t');
	const col = (name) => {
		const i = header.indexOf(name);
		if (i < 0) throw new Error(`Missing column ${name}`);
		return i;
	};
	const iOrtho = col('ortho'), iCgram = col('cgram'), iInfover = col('infover'), iFilms = col('freqfilms2'), iLivres = col('freqlivres');

	// norm word -> { freq, content: NOM/VER/ADJ/ADV reading, puzzle: guessable-word reading }
	const map = new Map();
	for (let l = 1; l < lines.length; l++) {
		const f = lines[l].split('\t');
		if (f.length < 5) continue;
		const norm = normalize(f[iOrtho]);
		if (!/^[A-Z]+$/.test(norm) || norm.length < MIN_LEN || norm.length > MAX_LEN) continue;
		const freq = (parseFloat(f[iFilms]) || 0) + (parseFloat(f[iLivres]) || 0);
		const cgram = f[iCgram];
		const e = map.get(norm) ?? { freq: 0, content: false, puzzle: false };
		e.freq += freq;
		if (CONTENT_POS.has(cgram)) e.content = true;
		// "Puzzle-clean" = a recognizable dictionary word: noun/adjective/adverb, or a verb
		// only in its INFINITIVE form. Excludes conjugated forms (AIMAIS, ALLAIT, ARRIVA…),
		// which read as awkward answers in Lettres Croisées.
		if (cgram === 'NOM' || cgram === 'ADJ' || cgram === 'ADV') e.puzzle = true;
		else if (cgram === 'VER' && (f[iInfover] || '').startsWith('inf')) e.puzzle = true;
		map.set(norm, e);
	}
	return map;
}

function pick(map) {
	const all = [...map.entries()].map(([w, e]) => ({ w, ...e }));
	const common = new Set();
	for (const [len, quota] of Object.entries(COMMON_QUOTA)) {
		const band = all
			.filter((x) => x.w.length === Number(len) && x.content && !NOT_A_SOLUTION.has(x.w))
			.sort((a, b) => b.freq - a.freq)
			.slice(0, quota);
		for (const x of band) common.add(x.w);
	}
	const extended = new Set(all
		.filter((x) => !common.has(x.w) && x.freq >= EXTENDED_MIN_FREQ)
		.sort((a, b) => b.freq - a.freq)
		.slice(0, EXTENDED_CAP)
		.map((x) => x.w));
	for (const w of MUST_INCLUDE) if (!common.has(w)) extended.add(w);

	// Puzzle pool (Lettres Croisées): freq-top guessable words per length — nouns,
	// adjectives, adverbs, infinitives; no conjugations. Bases + grid words draw from here.
	const puzzle = new Set();
	for (const [len, quota] of Object.entries(PUZZLE_QUOTA)) {
		const band = all
			.filter((x) => x.w.length === Number(len) && x.puzzle && !NOT_A_SOLUTION.has(x.w))
			.sort((a, b) => b.freq - a.freq)
			.slice(0, quota);
		for (const x of band) puzzle.add(x.w);
	}
	return { common: [...common].sort(), extended: [...extended].sort(), puzzle: [...puzzle].sort() };
}

// Emit as a template literal wrapped to ~100-char lines (sorted → gzip-friendly).
function emit(name, words) {
	const lines = [];
	let cur = '';
	for (const w of words) {
		if (cur.length + w.length + 1 > 100) { lines.push(cur); cur = w; }
		else cur = cur ? `${cur} ${w}` : w;
	}
	if (cur) lines.push(cur);
	return `// GENERATED by scripts/build-words.mjs (source: Lexique 3.83, lexique.org) — do not edit by hand.
// ${words.length} words, ${MIN_LEN}-${MAX_LEN} letters, uppercase, diacritics stripped, sorted.
export const ${name} = \`${lines.join('\n')}\`;
`;
}

const map = collect(await loadTsv());
const { common, extended, puzzle } = pick(map);
const byLen = (list) => Object.fromEntries(
	Array.from({ length: MAX_LEN - MIN_LEN + 1 }, (_, i) => [MIN_LEN + i, list.filter((w) => w.length === MIN_LEN + i).length]),
);
console.log('COMMON:', common.length, byLen(common));
console.log('EXTENDED:', extended.length, byLen(extended));
console.log('PUZZLE:', puzzle.length, byLen(puzzle));
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'common.ts'), emit('COMMON_RAW', common));
await writeFile(path.join(OUT_DIR, 'extended.ts'), emit('EXTENDED_RAW', extended));
await writeFile(path.join(OUT_DIR, 'puzzle.ts'), emit('PUZZLE_RAW', puzzle));
console.log(`Wrote ${OUT_DIR}/common.ts + extended.ts + puzzle.ts`);
