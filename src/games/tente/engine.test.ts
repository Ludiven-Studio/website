import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { DIFFS, generateTente, countSolutions } from './engine';

describe('tente engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 6; s++) {
				const p = generateTente(diff, mulberry32(7000 + s * 31 + diff.size));
				// tents == trees count, counts add up
				expect(p.tents.length).toBe(p.trees.length);
				expect(p.rowCounts.reduce((a, b) => a + b, 0)).toBe(p.tents.length);
				expect(p.colCounts.reduce((a, b) => a + b, 0)).toBe(p.tents.length);
				// unique solution
				expect(countSolutions(p.trees, p.rowCounts, p.colCounts, p.size, 2)).toBe(1);
			}
		});
	}

	it('solution respects the no-touch rule and tents are off trees', () => {
		const p = generateTente(DIFFS.moyen, mulberry32(424242));
		const treeSet = new Set(p.trees.map(([r, c]) => r * 100 + c));
		const tentSet = new Set(p.tents.map(([r, c]) => r * 100 + c));
		for (const [r, c] of p.tents) {
			expect(treeSet.has(r * 100 + c)).toBe(false);
			for (let dr = -1; dr <= 1; dr++)
				for (let dc = -1; dc <= 1; dc++) {
					if (dr === 0 && dc === 0) continue;
					expect(tentSet.has((r + dr) * 100 + (c + dc))).toBe(false);
				}
		}
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateTente(DIFFS.moyen, mulberry32(seed));
		const b = generateTente(DIFFS.moyen, mulberry32(seed));
		expect(a.trees).toEqual(b.trees);
		expect(a.tents).toEqual(b.tents);
	});
});
