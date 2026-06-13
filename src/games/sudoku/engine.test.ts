import { describe, it, expect } from 'vitest';
import { SIZES, DIFFS, generateSudoku, countSolutions, type Grid } from './engine';
import { mulberry32, dateSeed } from '../prng';

function isValidFullGrid(grid: Grid, n: number, boxH: number, boxW: number): boolean {
	const expected = new Set(Array.from({ length: n }, (_, i) => i + 1));
	const eq = (s: Set<number>) => s.size === n && [...expected].every((v) => s.has(v));
	for (let r = 0; r < n; r++) if (!eq(new Set(grid[r]))) return false;
	for (let c = 0; c < n; c++) if (!eq(new Set(grid.map((row) => row[c])))) return false;
	for (let br = 0; br < n; br += boxH) {
		for (let bc = 0; bc < n; bc += boxW) {
			const s = new Set<number>();
			for (let r = 0; r < boxH; r++) for (let c = 0; c < boxW; c++) s.add(grid[br + r][bc + c]);
			if (!eq(s)) return false;
		}
	}
	return true;
}

describe('sudoku engine', () => {
	for (const sizeKey of Object.keys(SIZES) as (keyof typeof SIZES)[]) {
		const variant = SIZES[sizeKey];

		it(`${variant.label}: produces a valid full solution and unique puzzle`, () => {
			const puzzle = generateSudoku(variant, DIFFS.facile, mulberry32(7 + variant.size));
			expect(isValidFullGrid(puzzle.solution, variant.size, variant.boxH, variant.boxW)).toBe(true);
			// Givens are a subset of the solution.
			for (let r = 0; r < variant.size; r++)
				for (let c = 0; c < variant.size; c++)
					if (puzzle.given[r][c]) expect(puzzle.given[r][c]).toBe(puzzle.solution[r][c]);
			// Exactly one solution.
			expect(countSolutions(puzzle.given, variant.size, variant.boxH, variant.boxW, 2)).toBe(1);
		});
	}

	it('removes more cells on harder levels', () => {
		const holes = (key: keyof typeof DIFFS) => {
			const p = generateSudoku(SIZES['6'], DIFFS[key], mulberry32(42));
			return p.given.flat().filter((v) => v === 0).length;
		};
		expect(holes('facile')).toBeLessThanOrEqual(holes('difficile'));
	});

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateSudoku(SIZES['6'], DIFFS.moyen, mulberry32(seed));
		const b = generateSudoku(SIZES['6'], DIFFS.moyen, mulberry32(seed));
		expect(a.given).toEqual(b.given);
		expect(a.solution).toEqual(b.solution);
	});

	it('different seeds usually produce different solutions', () => {
		const a = generateSudoku(SIZES['6'], DIFFS.moyen, mulberry32(1));
		const b = generateSudoku(SIZES['6'], DIFFS.moyen, mulberry32(2));
		expect(JSON.stringify(a.solution)).not.toEqual(JSON.stringify(b.solution));
	});
});
