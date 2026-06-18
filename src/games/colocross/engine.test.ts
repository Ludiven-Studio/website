import { describe, it, expect } from 'vitest';
import { DIFFS, generateColocross, lineSolve, countSolutions, lineRuns } from './engine';
import { mulberry32 } from '../prng';

describe('colocross engine', () => {
	it('is solvable by pure deduction and yields exactly the solution', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 10; seed++) {
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

	it('clues match the solution and use only the palette', () => {
		const p = generateColocross(DIFFS.difficile, mulberry32(2026));
		const { size, colors, solution, rowClues, colClues } = p;
		for (let r = 0; r < size; r++) expect(lineRuns(solution[r])).toEqual(rowClues[r]);
		for (let c = 0; c < size; c++)
			expect(lineRuns(solution.map((row) => row[c]))).toEqual(colClues[c]);
		for (const row of solution)
			for (const v of row) {
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(colors);
			}
	});

	it('is deterministic for a given seed', () => {
		const a = generateColocross(DIFFS.moyen, mulberry32(77));
		const b = generateColocross(DIFFS.moyen, mulberry32(77));
		expect(a.solution).toEqual(b.solution);
	});
});
