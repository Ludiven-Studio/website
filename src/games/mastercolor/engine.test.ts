import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { LEVELS, generateCode, score, isWin } from './engine';

describe('master color engine', () => {
	for (const key of Object.keys(LEVELS)) {
		const lvl = LEVELS[key];
		it(`${key}: generateCode has valid length and range`, () => {
			for (let s = 0; s < 5; s++) {
				const code = generateCode(lvl, mulberry32(700 + s * 13 + lvl.slots));
				expect(code).toHaveLength(lvl.slots);
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
		// code has two 1s; guess has three 1s → one exact (pos 0), partial capped by code count.
		expect(score([1, 1, 2, 3], [1, 2, 1, 1])).toEqual({ exact: 1, partial: 2 });
	});

	it('score: a colour absent from the code scores nothing', () => {
		expect(score([0, 0, 1, 2], [3, 3, 3, 3])).toEqual({ exact: 0, partial: 0 });
	});

	it('score: mixed exact + partial', () => {
		// pos0 exact (5). 4 in code but misplaced → 1 partial. 6,7 absent.
		expect(score([5, 4, 0, 0], [5, 6, 7, 4])).toEqual({ exact: 1, partial: 1 });
	});
});
