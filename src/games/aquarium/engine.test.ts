import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { DIFFS, generateAquarium, countSolutions, findHint } from './engine';

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

	it('findHint solves the grid step by step, always proposing the solution value', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateAquarium(diff, mulberry32(4242 + diff.size));
			const n = p.size;
			const marks: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
			for (let step = 0; step < n * n + 1; step++) {
				const h = findHint(marks, p);
				if (!h) break;
				const expected = p.solution[h.r][h.c] ? 'water' : 'air';
				expect(h.value).toBe(expected); // never proposes a wrong value
				expect(h.reason.length).toBeGreaterThan(0);
				marks[h.r][h.c] = h.value === 'water' ? 1 : 2;
			}
			// effective grid now matches the solution everywhere
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++)
					expect(marks[r][c] === 1).toBe(p.solution[r][c]);
		}
	});

	it('findHint corrects a wrong mark first', () => {
		const p = generateAquarium(DIFFS.facile, mulberry32(7));
		const n = p.size;
		const marks: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
		// mark one cell with the opposite of its solution
		const pr = 0;
		const pc = 0;
		marks[pr][pc] = p.solution[pr][pc] ? 2 : 1; // wrong on purpose
		const h = findHint(marks, p)!;
		expect(h.r).toBe(pr);
		expect(h.c).toBe(pc);
		const expected = p.solution[h.r][h.c] ? 'water' : 'air';
		expect(h.value).toBe(expected);
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateAquarium(DIFFS.moyen, mulberry32(seed));
		const b = generateAquarium(DIFFS.moyen, mulberry32(seed));
		expect(a.regionOf).toEqual(b.regionOf);
		expect(a.solution).toEqual(b.solution);
	});
});
