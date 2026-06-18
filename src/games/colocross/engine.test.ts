import { describe, it, expect } from 'vitest';
import { DIFFS, generateColocross, lineSolve, countSolutions, lineClueOf } from './engine';
import { mulberry32 } from '../prng';

describe('colocross engine', () => {
	it('is solvable by pure deduction and yields exactly the solution', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 8; seed++) {
				const p = generateColocross(diff, mulberry32(5000 + seed * 31 + diff.size));
				const solved = lineSolve(p.rowClues, p.colClues, p.size, p.colors);
				expect(solved, `"${key}" seed ${seed} deducible`).not.toBeNull();
				expect(solved).toEqual(p.solution);
			}
		}
	});

	it('has a unique solution for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateColocross(diff, mulberry32(9100 + diff.size));
			expect(countSolutions(p.rowClues, p.colClues, p.size), `"${key}" unique`).toBe(1);
		}
	});

	it('fills every cell with a palette colour (no empty cell)', () => {
		const p = generateColocross(DIFFS.difficile, mulberry32(2026));
		for (const row of p.solution)
			for (const v of row) {
				expect(v).toBeGreaterThanOrEqual(1);
				expect(v).toBeLessThanOrEqual(p.colors);
			}
		// clues match the solution
		for (let r = 0; r < p.size; r++) expect(lineClueOf(p.solution[r], p.colors)).toEqual(p.rowClues[r]);
	});

	it('is deterministic for a given seed', () => {
		const a = generateColocross(DIFFS.moyen, mulberry32(77));
		const b = generateColocross(DIFFS.moyen, mulberry32(77));
		expect(a.solution).toEqual(b.solution);
	});
});
