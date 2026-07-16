/**
 * LETTRES CROISÉES — pure engine (no UI). Wordscapes-style: a base word's letters feed a
 * small crossword grid; every grid word is an anagram-subset of the base letters. Valid
 * non-grid subwords count as bonus. Seeded (mulberry32) for the daily.
 */

import { mulberry32, type Rng } from '../prng';
import { COMMON_RAW } from '../words/common';
import { parseWords, byLength, letterCounts, isSubset } from '../words';

export interface PlacedWord { word: string; row: number; col: number; dir: 'h' | 'v'; }
export interface Puzzle {
	base: string;
	letters: string[]; // base letters in seeded display order
	rows: number;
	cols: number;
	words: PlacedWord[];
	bonus: string[]; // valid non-grid subwords, sorted
}

export interface DiffLevel {
	label: string;
	baseLen: number;
	minWords: number;
	maxWords: number;
	minLen: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', baseLen: 6, minWords: 5, maxWords: 6, minLen: 3 },
	moyen: { label: 'Moyen', baseLen: 6, minWords: 6, maxWords: 7, minLen: 4 },
	difficile: { label: 'Difficile', baseLen: 7, minWords: 7, maxWords: 9, minLen: 4 },
};

/** Grid must fit a phone screen above the letter wheel. */
export const MAX_DIM = 9;

const COMMON = parseWords(COMMON_RAW);

const ck = (r: number, c: number): string => `${r},${c}`;

function shuffle<T>(a: T[], rng: Rng): T[] {
	const x = a.slice();
	for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
	return x;
}

/** All COMMON words of length [minLen, base.length] formable from the base letters (incl. the base). */
export function subwordsOf(base: string, minLen: number): string[] {
	const counts = letterCounts(base);
	return byLength(COMMON, minLen, base.length).filter((w) => isSubset(w, counts));
}

/* ---------- Crossword layout ---------- */

interface Layout { cells: Map<string, string>; placed: PlacedWord[]; }

const extent = (placed: PlacedWord[]): { minR: number; minC: number; maxR: number; maxC: number } => {
	let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
	for (const p of placed) {
		const endR = p.row + (p.dir === 'v' ? p.word.length - 1 : 0);
		const endC = p.col + (p.dir === 'h' ? p.word.length - 1 : 0);
		minR = Math.min(minR, p.row); minC = Math.min(minC, p.col);
		maxR = Math.max(maxR, endR); maxC = Math.max(maxC, endC);
	}
	return { minR, minC, maxR, maxC };
};

/** Standard crossword validity: crossings match, no parallel adjacency, end caps empty, box fits. */
function canPlace(lay: Layout, word: string, row: number, col: number, dir: 'h' | 'v'): boolean {
	const dr = dir === 'v' ? 1 : 0, dc = dir === 'h' ? 1 : 0;
	// end caps
	if (lay.cells.has(ck(row - dr, col - dc))) return false;
	if (lay.cells.has(ck(row + dr * word.length, col + dc * word.length))) return false;
	let crosses = 0;
	for (let i = 0; i < word.length; i++) {
		const r = row + dr * i, c = col + dc * i;
		const existing = lay.cells.get(ck(r, c));
		if (existing != null) {
			if (existing !== word[i]) return false;
			crosses++;
		} else {
			// flanking cells (perpendicular) must be empty on non-crossing cells
			if (lay.cells.has(ck(r + dc, c + dr)) || lay.cells.has(ck(r - dc, c - dr))) return false;
		}
	}
	if (crosses === 0) return false;
	const e = extent([...lay.placed, { word, row, col, dir }]);
	return e.maxR - e.minR < MAX_DIM && e.maxC - e.minC < MAX_DIM;
}

function place(lay: Layout, word: string, row: number, col: number, dir: 'h' | 'v'): void {
	const dr = dir === 'v' ? 1 : 0, dc = dir === 'h' ? 1 : 0;
	for (let i = 0; i < word.length; i++) lay.cells.set(ck(row + dr * i, col + dc * i), word[i]);
	lay.placed.push({ word, row, col, dir });
}

/** All valid crossing placements of `word` onto the current layout. */
function placements(lay: Layout, word: string): PlacedWord[] {
	const out: PlacedWord[] = [];
	for (const [k, letter] of lay.cells) {
		const [r, c] = k.split(',').map(Number);
		for (let i = 0; i < word.length; i++) {
			if (word[i] !== letter) continue;
			if (canPlace(lay, word, r - i, c, 'v')) out.push({ word, row: r - i, col: c, dir: 'v' });
			if (canPlace(lay, word, r, c - i, 'h')) out.push({ word, row: r, col: c - i, dir: 'h' });
		}
	}
	return out;
}

/* ---------- Generation ---------- */

/** Pick target-count grid words: the base first, then a length-mixed rng draw. */
function selectWords(candidates: string[], base: string, target: number, rng: Rng): string[] {
	const sel = [base];
	const perLen = new Map<number, number>([[base.length, 1]]);
	const pool = shuffle(candidates.filter((w) => w !== base), rng);
	for (const w of pool) {
		if (sel.length >= target) break;
		if ((perLen.get(w.length) ?? 0) >= 2) continue;
		sel.push(w); perLen.set(w.length, (perLen.get(w.length) ?? 0) + 1);
	}
	for (const w of pool) { // relax the per-length cap if needed
		if (sel.length >= target) break;
		if (!sel.includes(w)) sel.push(w);
	}
	return sel;
}

/** Deterministic puzzle for a seed + difficulty. Never throws (best-effort fallback). */
export function generatePuzzle(seed: number, diff: DiffLevel): Puzzle {
	const basePool = byLength(COMMON, diff.baseLen, diff.baseLen);
	let fallback: Puzzle | null = null;
	for (let attempt = 0; attempt < 150; attempt++) {
		const rng = mulberry32((seed ^ (attempt * 0x9e3779b1)) >>> 0);
		const base = basePool[Math.floor(rng() * basePool.length)];
		const candidates = subwordsOf(base, diff.minLen);
		if (candidates.length < diff.minWords + 2) continue;
		const target = diff.minWords + Math.floor(rng() * (diff.maxWords - diff.minWords + 1));
		const sel = selectWords(candidates, base, target, rng);
		if (sel.length < diff.minWords) continue;

		const lay: Layout = { cells: new Map(), placed: [] };
		place(lay, base, 0, 0, 'h');
		// longest first (rng tiebreak) crosses more easily
		const rest = shuffle(sel.slice(1), rng).sort((a, b) => b.length - a.length);
		const spare = shuffle(candidates.filter((w) => !sel.includes(w)), rng);
		for (const w of rest) {
			const opts = placements(lay, w);
			if (opts.length) { const p = opts[Math.floor(rng() * opts.length)]; place(lay, p.word, p.row, p.col, p.dir); continue; }
			// unplaceable → try a spare of similar length
			for (let s = 0; s < spare.length; s++) {
				const alt = spare[s];
				if (Math.abs(alt.length - w.length) > 1 || lay.placed.some((q) => q.word === alt)) continue;
				const altOpts = placements(lay, alt);
				if (altOpts.length) { const p = altOpts[Math.floor(rng() * altOpts.length)]; place(lay, p.word, p.row, p.col, p.dir); spare.splice(s, 1); break; }
			}
		}

		const e = extent(lay.placed);
		const words = lay.placed.map((p) => ({ ...p, row: p.row - e.minR, col: p.col - e.minC }));
		const placedSet = new Set(words.map((p) => p.word));
		const puzzle: Puzzle = {
			base,
			letters: shuffle(base.split(''), rng),
			rows: e.maxR - e.minR + 1,
			cols: e.maxC - e.minC + 1,
			words,
			bonus: candidates.filter((w) => !placedSet.has(w)).sort(),
		};
		if (words.length >= diff.minWords) return puzzle;
		if (!fallback || words.length > fallback.words.length) fallback = puzzle;
	}
	return fallback ?? {
		base: 'LETTRES', letters: 'LETTRES'.split(''), rows: 1, cols: 7,
		words: [{ word: 'LETTRES', row: 0, col: 0, dir: 'h' }], bonus: [],
	};
}
