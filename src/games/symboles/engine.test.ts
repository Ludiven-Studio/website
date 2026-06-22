import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, cellKey, META, type Cell } from './engine';
import { mulberry32, dateSeed } from '../prng';

const validCell = (c: Cell) => {
	expect(c.count).toBeGreaterThanOrEqual(1);
	expect(c.count).toBeLessThanOrEqual(4);
	expect(c.color).toBeGreaterThanOrEqual(0);
	// Symmetry invariant: rotation only on rotVisible shapes, flip only on chiral.
	if (!META[c.shape].rotVisible) expect(((c.rotation % 360) + 360) % 360).toBe(0);
	if (!META[c.shape].chiral) expect(c.flip).toBe(false);
};

describe('symboles engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: well-formed, visually-distinct QCM`, () => {
			for (let s = 0; s < 60; s++) {
				const q = generateQuestion(diff, mulberry32(s * 31 + 1));
				expect(q.terms.length).toBeGreaterThanOrEqual(4);
				// 4 options, all visually distinct (key == appearance), answer included.
				expect(q.options.length).toBe(4);
				expect(new Set(q.options.map(cellKey)).size).toBe(4);
				expect(q.options.map(cellKey)).toContain(cellKey(q.answer));
				[...q.terms, q.answer, ...q.options].forEach(validCell);
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

	it('mirror rule alternates the flip across consecutive terms (moyen sample)', () => {
		// Find a mirror question and check flip toggles when shape/rotation are constant.
		for (let s = 0; s < 200; s++) {
			const q = generateQuestion(DIFFS.moyen, mulberry32(s * 7 + 5));
			const shapes = new Set(q.terms.map((t) => t.shape));
			const flips = new Set(q.terms.map((t) => t.flip));
			if (shapes.size === 1 && flips.size === 2 && META[q.terms[0].shape].chiral) {
				for (let i = 1; i < q.terms.length; i++) {
					expect(q.terms[i].flip).toBe(!q.terms[i - 1].flip);
				}
				return; // asserted at least one mirror question
			}
		}
		throw new Error('no mirror question sampled');
	});
});
