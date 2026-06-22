import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, cellKey } from './engine';
import { mulberry32, dateSeed } from '../prng';

describe('symboles engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: well-formed QCM questions`, () => {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(diff, mulberry32(s * 31 + 1));
				expect(q.terms.length).toBeGreaterThanOrEqual(4);
				// 4 distinct options (by key) containing the answer.
				expect(q.options.length).toBe(4);
				expect(new Set(q.options.map(cellKey)).size).toBe(4);
				expect(q.options.map(cellKey)).toContain(cellKey(q.answer));
				// Valid cell attributes.
				[...q.terms, q.answer, ...q.options].forEach((c) => {
					expect(c.count).toBeGreaterThanOrEqual(1);
					expect(c.count).toBeLessThanOrEqual(4);
					expect(c.color).toBeGreaterThanOrEqual(0);
				});
				expect(q.rule.length).toBeGreaterThan(0);
			}
		});
	}

	it('is deterministic: same seed -> identical question', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateQuestion(DIFFS.moyen, mulberry32(seed));
		const b = generateQuestion(DIFFS.moyen, mulberry32(seed));
		expect(a).toEqual(b);
	});

	it('facile repeat/alternate: answer matches the term one period back', () => {
		// For period-2 patterns the next term equals terms[length-2].
		for (let s = 0; s < 30; s++) {
			const q = generateQuestion(DIFFS.facile, mulberry32(s * 17 + 3));
			const back2 = q.terms[q.terms.length - 2];
			// answer is always one of the repeating motif cells already shown
			expect(q.terms.map(cellKey).concat(cellKey(back2))).toContain(cellKey(q.answer));
		}
	});
});
