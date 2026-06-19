import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { DIFFS, generateAquarium, countSolutions } from './engine';

describe('aquarium engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 6; s++) {
				const p = generateAquarium(diff, mulberry32(8000 + s * 29 + diff.size));
				// counts match the solution
				const rc = new Array(p.size).fill(0);
				const cc = new Array(p.size).fill(0);
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++)
						if (p.solution[r][c]) {
							rc[r]++;
							cc[c]++;
						}
				expect(rc).toEqual(p.rowCounts);
				expect(cc).toEqual(p.colCounts);
				expect(countSolutions(p.regionOf, p.rowCounts, p.colCounts, p.size, 2)).toBe(1);
			}
		});
	}

	it('water obeys gravity within each region (no water above air in a column of a region)', () => {
		const p = generateAquarium(DIFFS.moyen, mulberry32(13579));
		for (let c = 0; c < p.size; c++)
			for (let r = 1; r < p.size; r++) {
				// same region, same column: if upper cell is water, lower must be water too
				if (p.regionOf[r][c] === p.regionOf[r - 1][c] && p.solution[r - 1][c]) {
					expect(p.solution[r][c]).toBe(true);
				}
			}
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateAquarium(DIFFS.moyen, mulberry32(seed));
		const b = generateAquarium(DIFFS.moyen, mulberry32(seed));
		expect(a.regionOf).toEqual(b.regionOf);
		expect(a.solution).toEqual(b.solution);
	});
});
