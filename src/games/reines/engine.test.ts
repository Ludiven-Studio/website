import { describe, it, expect } from 'vitest';
import { DIFFS, generateReines, countSolutions, findConflicts } from './engine';
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

describe('reines conflict detection', () => {
	// Reconstruction of the user's screenshot (6×6).
	// ids: yellow0 pink1 orange2 green3 blue4 teal5. Queens at (4,3) and (5,5).
	const queens: [number, number][] = [
		[4, 3],
		[5, 5],
	];

	it('distinct regions, different row/col, non-adjacent -> NO conflict', () => {
		// Reading A: (5,5) is teal (its own region), (4,3) is blue.
		const regionsA = [
			[0, 1, 1, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 3, 3, 2, 2],
			[3, 3, 3, 4, 4, 5],
			[3, 3, 3, 4, 4, 5],
		];
		expect(findConflicts(regionsA, queens).cells.size).toBe(0);
	});

	it('same (wrapping) region -> conflict, reason "zone"', () => {
		// Reading B: the blue region wraps down to (5,5); teal is only (4,5).
		const regionsB = [
			[0, 1, 1, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 3, 3, 2, 2],
			[3, 3, 3, 4, 4, 5],
			[3, 3, 3, 4, 4, 4],
		];
		const c = findConflicts(regionsB, queens);
		expect(c.cells.has('4,3')).toBe(true);
		expect(c.cells.has('5,5')).toBe(true);
		expect([...c.reasons]).toEqual(['zone']);
		expect(c.regions.has(4)).toBe(true);
	});

	it('flags row, column and adjacency too', () => {
		const reg = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => r));
		// same row
		expect([...findConflicts(reg, [[0, 0], [0, 2]]).reasons]).toEqual(['ligne']);
		// same column (different regions since region = row index)
		expect([...findConflicts(reg, [[0, 1], [2, 1]]).reasons]).toEqual(['colonne']);
		// diagonal contact, different rows/cols/regions
		expect([...findConflicts(reg, [[0, 0], [1, 1]]).reasons]).toEqual(['contact']);
	});

	it('ignores out-of-bounds queens (no undefined-equality false positive)', () => {
		const reg = [
			[0, 1],
			[2, 3],
		];
		// Both out of bounds, not adjacent / same row / col: undefined===undefined must NOT fire "zone".
		expect(findConflicts(reg, [[5, 5], [8, 2]]).cells.size).toBe(0);
		// One valid, one out of bounds, not adjacent -> no conflict.
		expect(findConflicts(reg, [[0, 0], [9, 9]]).cells.size).toBe(0);
	});

	it('a uniquely-placed solution never conflicts', () => {
		for (const key of Object.keys(DIFFS)) {
			const p = generateReines(DIFFS[key], mulberry32(13 + DIFFS[key].size));
			const sol: [number, number][] = p.solution.map((c, r) => [r, c]);
			expect(findConflicts(p.regions, sol).cells.size).toBe(0);
		}
	});
});
