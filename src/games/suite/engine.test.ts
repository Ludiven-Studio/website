import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion } from './engine';
import { mulberry32, dateSeed } from '../prng';

describe('suite engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: well-formed QCM questions`, () => {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(diff, mulberry32(s * 31 + 1));
				expect(q.terms.length).toBeGreaterThanOrEqual(4);
				// 4 distinct options containing the answer.
				expect(q.options.length).toBe(4);
				expect(new Set(q.options).size).toBe(4);
				expect(q.options).toContain(q.answer);
				// All integers.
				[...q.terms, q.answer, ...q.options].forEach((v) => expect(Number.isInteger(v)).toBe(true));
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

	it('arithmetic answer follows the rule', () => {
		const q = generateQuestion(DIFFS.facile, mulberry32(12345));
		const d = q.terms[1] - q.terms[0];
		expect(q.answer).toBe(q.terms[q.terms.length - 1] + d);
	});
});
