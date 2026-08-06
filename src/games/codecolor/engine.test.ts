import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import {
	LEVELS,
	generateCode,
	score,
	isWin,
	findHint,
	consistentCodes,
	type GuessRow,
	type Level,
} from './engine';

describe('codecolor engine', () => {
	for (const key of Object.keys(LEVELS)) {
		const lvl = LEVELS[key];
		it(`${key}: generateCode is distinct, right length and range`, () => {
			for (let s = 0; s < 5; s++) {
				const code = generateCode(lvl, mulberry32(700 + s * 13 + lvl.slots));
				expect(code).toHaveLength(lvl.slots);
				expect(new Set(code).size).toBe(lvl.slots); // all distinct
				for (const v of code) {
					expect(v).toBeGreaterThanOrEqual(0);
					expect(v).toBeLessThan(lvl.colors);
				}
			}
		});
	}

	it('is reproducible from a seed (daily)', () => {
		const seed = dateSeed(new Date('2026-06-23T00:00:00Z'));
		const a = generateCode(LEVELS.moyen, mulberry32(seed));
		const b = generateCode(LEVELS.moyen, mulberry32(seed));
		expect(a).toEqual(b);
	});

	it('score: all exact when guess equals code', () => {
		const code = [0, 1, 2, 3];
		expect(score(code, [0, 1, 2, 3])).toEqual({ exact: 4, partial: 0 });
		expect(isWin(score(code, [0, 1, 2, 3]), 4)).toBe(true);
	});

	it('score: right colours all misplaced → all partial', () => {
		expect(score([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, partial: 4 });
	});

	it('score: handles repeated colours without double counting', () => {
		// Guards the scoring fn even though codes are now distinct: guess may still repeat.
		expect(score([1, 0, 2, 3], [1, 1, 1, 1])).toEqual({ exact: 1, partial: 0 });
	});

	it('score: a colour absent from the code scores nothing', () => {
		expect(score([0, 1, 2, 4], [5, 5, 5, 5])).toEqual({ exact: 0, partial: 0 });
	});

	it('score: mixed exact + partial', () => {
		// pos0 exact (5); 4 in code but misplaced → 1 partial; 6,7 absent.
		expect(score([5, 4, 0, 1], [5, 6, 7, 4])).toEqual({ exact: 1, partial: 1 });
	});
});

/** A few plausible guesses against `code`, each with its real feedback. */
function playGuesses(lvl: Level, code: number[], seed: number, n: number): GuessRow[] {
	const rng = mulberry32(seed);
	const rows: GuessRow[] = [];
	for (let g = 0; g < n; g++) {
		const pool = Array.from({ length: lvl.colors }, (_, i) => i);
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		const guess = pool.slice(0, lvl.slots);
		rows.push({ guess, fb: score(code, guess) });
	}
	return rows;
}

describe('codecolor hints', () => {
	it('no feedback yet → a neutral tip, never a colour', () => {
		const h = findHint(LEVELS.facile.slots, LEVELS.facile.colors, []);
		expect(h.kind).toBe('tip');
		expect(h.color).toBeUndefined();
	});

	it('the secret is always among the consistent codes', () => {
		for (const key of Object.keys(LEVELS)) {
			const lvl = LEVELS[key];
			for (let s = 0; s < 4; s++) {
				const code = generateCode(lvl, mulberry32(9100 + s * 7 + lvl.slots));
				const rows = playGuesses(lvl, code, 4400 + s, 3);
				const codes = consistentCodes(lvl.slots, lvl.colors, rows);
				expect(codes.some((c) => c.join() === code.join())).toBe(true);
			}
		}
		// The Expert tier brute-forces P(8,7) = 40320 codes per call, so these three
		// LEVELS-wide sweeps need room when the suite runs them all in parallel.
	}, 30000);

	it('an eliminated colour is really absent from the secret', () => {
		for (const key of Object.keys(LEVELS)) {
			const lvl = LEVELS[key];
			for (let s = 0; s < 6; s++) {
				const code = generateCode(lvl, mulberry32(2600 + s * 31 + lvl.slots));
				const rows = playGuesses(lvl, code, 8800 + s * 5, 3);
				// Drain every colour fact the engine is willing to state.
				const seen = new Set<string>();
				for (let k = 0; k < lvl.colors; k++) {
					const h = findHint(lvl.slots, lvl.colors, rows, seen);
					if (h.kind !== 'color-out') break;
					expect(code).not.toContain(h.color);
					seen.add(h.key);
				}
			}
		}
	}, 30000);

	it('an eliminated (colour, slot) pair is really wrong in the secret', () => {
		for (const key of Object.keys(LEVELS)) {
			const lvl = LEVELS[key];
			for (let s = 0; s < 6; s++) {
				const code = generateCode(lvl, mulberry32(5300 + s * 17 + lvl.slots));
				const rows = playGuesses(lvl, code, 1200 + s * 11, 3);
				const seen = new Set<string>();
				for (let k = 0; k < 40; k++) {
					const h = findHint(lvl.slots, lvl.colors, rows, seen);
					if (h.kind === 'color-out') expect(code).not.toContain(h.color);
					else if (h.kind === 'slot-out') expect(code[h.slot!]).not.toBe(h.color);
					else break;
					seen.add(h.key);
				}
			}
		}
	}, 30000);

	it('never states a peg of the secret, and the remaining count is exact', () => {
		const lvl = LEVELS.facile;
		const code = generateCode(lvl, mulberry32(777));
		const rows = playGuesses(lvl, code, 424242, 4);
		const seen = new Set<string>();
		let last = findHint(lvl.slots, lvl.colors, rows, seen);
		while (last.kind === 'color-out' || last.kind === 'slot-out') {
			seen.add(last.key);
			last = findHint(lvl.slots, lvl.colors, rows, seen);
		}
		expect(last.kind).toBe('count');
		expect(last.count).toBe(consistentCodes(lvl.slots, lvl.colors, rows).length);
		// A hint only ever names a colour that is excluded — it never asserts one is in the code.
		expect(last.reason).not.toContain('bien placé');
	});

	it('hints get sharper as feedback piles up', () => {
		const lvl = LEVELS.moyen;
		const code = generateCode(lvl, mulberry32(31337));
		const few = consistentCodes(lvl.slots, lvl.colors, playGuesses(lvl, code, 909, 1));
		const many = consistentCodes(lvl.slots, lvl.colors, playGuesses(lvl, code, 909, 4));
		expect(many.length).toBeLessThan(few.length);
	});
});
