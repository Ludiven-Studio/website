import { describe, it, expect } from 'vitest';
import { DIFFS, generateReines, countSolutions } from './engine';
import { mulberry32, dateSeed } from '../prng';

const adjacent = (r1: number, c1: number, r2: number, c2: number) =>
	Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;

describe('reines engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: valid solution, n regions, unique`, () => {
			const p = generateReines(diff, mulberry32(100 + diff.size));
			const n = p.size;

			// One queen per row & column.
			expect(new Set(p.solution).size).toBe(n);
			p.solution.forEach((c) => expect(c).toBeGreaterThanOrEqual(0));

			// No two queens adjacent.
			for (let r = 0; r < n; r++)
				for (let r2 = r + 1; r2 < n; r2++)
					expect(adjacent(r, p.solution[r], r2, p.solution[r2])).toBe(false);

			// One queen per region + regions cover the grid with ids 0..n-1.
			const regionOfQueen = new Set(p.solution.map((c, r) => p.regions[r][c]));
			expect(regionOfQueen.size).toBe(n);
			const ids = new Set<number>();
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++) {
					expect(p.regions[r][c]).toBeGreaterThanOrEqual(0);
					ids.add(p.regions[r][c]);
				}
			expect(ids.size).toBe(n);

			// Exactly one solution.
			expect(countSolutions(p.regions, n, 2)).toBe(1);
		});
	}

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateReines(DIFFS.moyen, mulberry32(seed));
		const b = generateReines(DIFFS.moyen, mulberry32(seed));
		expect(a.regions).toEqual(b.regions);
		expect(a.solution).toEqual(b.solution);
	});
});
