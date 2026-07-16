import { describe, it, expect } from 'vitest';
import { generatePuzzle, subwordsOf, DIFFS, MAX_DIM, type Puzzle } from './engine';
import { PUZZLE_RAW } from '../words/puzzle';
import { parseWords, letterCounts, isSubset } from '../words';

const PUZZLE = new Set(parseWords(PUZZLE_RAW));

const cellMap = (p: Puzzle): Map<string, string> => {
	const m = new Map<string, string>();
	for (const w of p.words) {
		for (let i = 0; i < w.word.length; i++) {
			const r = w.row + (w.dir === 'v' ? i : 0), c = w.col + (w.dir === 'h' ? i : 0);
			const k = `${r},${c}`;
			if (m.has(k)) expect(m.get(k), `crossing mismatch at ${k}`).toBe(w.word[i]);
			m.set(k, w.word[i]);
		}
	}
	return m;
};

const validate = (p: Puzzle, minWords: number): void => {
	expect(p.words.length).toBeGreaterThanOrEqual(minWords);
	expect(p.rows).toBeLessThanOrEqual(MAX_DIM);
	expect(p.cols).toBeLessThanOrEqual(MAX_DIM);
	expect(p.letters.slice().sort().join('')).toBe(p.base.split('').sort().join(''));

	const counts = letterCounts(p.base);
	const wordSet = new Set(p.words.map((w) => w.word));
	expect(wordSet.size).toBe(p.words.length); // distinct
	expect(wordSet.has(p.base)).toBe(true);
	for (const w of p.words) {
		expect(PUZZLE.has(w.word), `${w.word} in PUZZLE`).toBe(true);
		expect(isSubset(w.word, counts), `${w.word} subset of ${p.base}`).toBe(true);
	}
	for (const b of p.bonus) {
		expect(wordSet.has(b)).toBe(false);
		expect(isSubset(b, counts), `bonus ${b} subset of ${p.base}`).toBe(true);
	}

	// coordinates normalized + crossings consistent
	const m = cellMap(p);
	let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
	for (const k of m.keys()) {
		const [r, c] = k.split(',').map(Number);
		minR = Math.min(minR, r); minC = Math.min(minC, c);
		maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
	}
	expect(minR).toBe(0); expect(minC).toBe(0);
	expect(maxR).toBe(p.rows - 1); expect(maxC).toBe(p.cols - 1);

	// connectivity: BFS over words sharing a cell
	const owner = new Map<string, number[]>();
	p.words.forEach((w, wi) => {
		for (let i = 0; i < w.word.length; i++) {
			const k = `${w.row + (w.dir === 'v' ? i : 0)},${w.col + (w.dir === 'h' ? i : 0)}`;
			(owner.get(k) ?? owner.set(k, []).get(k)!).push(wi);
		}
	});
	const seen = new Set<number>([0]);
	const queue = [0];
	while (queue.length) {
		const wi = queue.pop()!;
		for (const list of owner.values()) {
			if (!list.includes(wi)) continue;
			for (const other of list) if (!seen.has(other)) { seen.add(other); queue.push(other); }
		}
	}
	expect(seen.size, 'all words connected').toBe(p.words.length);
};

describe('lettres-croisees engine', () => {
	it('is deterministic per seed', () => {
		const a = generatePuzzle(7, DIFFS.moyen);
		const b = generatePuzzle(7, DIFFS.moyen);
		const c = generatePuzzle(8, DIFFS.moyen);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
	});

	it('subwordsOf respects multiset containment', () => {
		const subs = subwordsOf('POMMES', 3);
		expect(subs).toContain('POMME');
		expect(subs.every((w) => isSubset(w, letterCounts('POMMES')))).toBe(true);
	});

	it('generates valid puzzles across 200 seeds × 3 diffs', () => {
		for (const diff of Object.values(DIFFS)) {
			for (let seed = 1; seed <= 200; seed++) {
				validate(generatePuzzle(seed, diff), diff.minWords);
			}
		}
	});

	it('grid words never exceed maxWords by much and base length matches diff', () => {
		for (const diff of Object.values(DIFFS)) {
			for (let seed = 1; seed <= 30; seed++) {
				const p = generatePuzzle(seed, diff);
				expect(p.base.length).toBe(diff.baseLen);
				expect(p.words.length).toBeLessThanOrEqual(diff.maxWords);
			}
		}
	});
});
