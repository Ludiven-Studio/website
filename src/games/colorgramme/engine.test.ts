import { describe, it, expect } from 'vitest';
import { DIFFS, generateColorgramme, lineSolve, countSolutions, lineClueOf, findHint, easySolve } from './engine';
import { mulberry32 } from '../prng';

describe('colorgramme engine', () => {
	it('is solvable by pure deduction and yields exactly the solution', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 8; seed++) {
				const p = generateColorgramme(diff, mulberry32(5000 + seed * 31 + diff.size));
				const solved = lineSolve(p.rowClues, p.colClues, p.size, p.colors);
				expect(solved, `"${key}" seed ${seed} deducible`).not.toBeNull();
				expect(solved).toEqual(p.solution);
			}
		}
	});

	it('has a unique solution for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateColorgramme(diff, mulberry32(9100 + diff.size));
			expect(countSolutions(p.rowClues, p.colClues, p.size), `"${key}" unique`).toBe(1);
		}
	});

	it('fills every cell with a palette colour (no empty cell)', () => {
		const p = generateColorgramme(DIFFS.difficile, mulberry32(2026));
		for (const row of p.solution)
			for (const v of row) {
				expect(v).toBeGreaterThanOrEqual(1);
				expect(v).toBeLessThanOrEqual(p.colors);
			}
		// clues match the solution
		for (let r = 0; r < p.size; r++) expect(lineClueOf(p.solution[r], p.colors)).toEqual(p.rowClues[r]);
	});

	it('is deterministic for a given seed', () => {
		const a = generateColorgramme(DIFFS.moyen, mulberry32(77));
		const b = generateColorgramme(DIFFS.moyen, mulberry32(77));
		expect(a.solution).toEqual(b.solution);
	});

	it('findHint solves the grid step by step, always proposing the solution colour', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 4; seed++) {
				const p = generateColorgramme(diff, mulberry32(4200 + seed * 17 + diff.size));
				const grid = Array.from({ length: p.size }, () => new Array(p.size).fill(0));
				let steps = 0;
				const cap = p.size * p.size + 5;
				for (;;) {
					const h = findHint(grid, p);
					if (!h) break;
					expect(h.value, `"${key}" seed ${seed} value matches solution`).toBe(
						p.solution[h.r][h.c],
					);
					expect(h.value).toBeGreaterThanOrEqual(1);
					expect(h.value).toBeLessThanOrEqual(p.colors);
					grid[h.r][h.c] = h.value;
					if (++steps > cap) throw new Error('findHint did not converge');
				}
				expect(grid, `"${key}" seed ${seed} fully solved by hints`).toEqual(p.solution);
			}
		}
	});

	it('is fully solvable step-by-step from its given cells (weak single-line solver)', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 8; seed++) {
				const p = generateColorgramme(diff, mulberry32(6300 + seed * 13 + diff.size));
				const seedGrid = Array.from({ length: p.size }, () => new Array(p.size).fill(0));
				for (const [r, c] of p.given) seedGrid[r][c] = p.solution[r][c];
				const solved = easySolve(p.rowClues, p.colClues, p.size, seedGrid);
				expect(solved, `"${key}" seed ${seed} easy-solvable from givens`).toEqual(p.solution);
			}
		}
	});

	it('given cells are correct and stay under the difficulty cap', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const cap = Math.ceil(diff.size * diff.size * 0.2);
			for (let seed = 1; seed <= 6; seed++) {
				const p = generateColorgramme(diff, mulberry32(7700 + seed + diff.size));
				expect(p.given.length, `"${key}" givens within cap`).toBeLessThanOrEqual(cap);
				for (const [r, c] of p.given) expect(p.solution[r][c]).toBeGreaterThanOrEqual(1); // valid cell
			}
		}
	});

	it('is deterministic including the given cells', () => {
		const a = generateColorgramme(DIFFS.difficile, mulberry32(88));
		const b = generateColorgramme(DIFFS.difficile, mulberry32(88));
		expect(a.solution).toEqual(b.solution);
		expect(a.given).toEqual(b.given);
	});

	it('findHint corrects a wrong colour before filling empty cells', () => {
		const p = generateColorgramme(DIFFS.moyen, mulberry32(321));
		// Find a cell and a wrong colour for it.
		const wrong = p.solution[0][0] === 1 ? 2 : 1;
		const grid = Array.from({ length: p.size }, () => new Array(p.size).fill(0));
		grid[0][0] = wrong; // contradicts the picture
		const h = findHint(grid, p);
		expect(h).not.toBeNull();
		expect(h!.r).toBe(0);
		expect(h!.c).toBe(0);
		expect(h!.value).toBe(p.solution[0][0]);
		expect(h!.reason).toContain('impossible');
	});
});
