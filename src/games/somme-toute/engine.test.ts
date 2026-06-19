import { describe, it, expect } from 'vitest';
import { DIFFS, generatePuzzle, countSolutions, findHint } from './engine';
import { mulberry32, dateSeed } from '../prng';

describe('somme-toute engine', () => {
	it('generates a uniquely-solvable puzzle for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			// Seed so the test is deterministic across runs.
			const game = generatePuzzle(diff, mulberry32(12345 + diff.size));
			const n = countSolutions(game.puzzle, game.size, game.maxVal, game.rowT, game.colT);
			expect(n, `difficulty "${key}" must have exactly one solution`).toBe(1);
		}
	});

	it('every difficulty stays uniquely solvable across many seeds (no guessing)', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			for (let seed = 1; seed <= 20; seed++) {
				const game = generatePuzzle(diff, mulberry32(seed * 131 + diff.size));
				const n = countSolutions(game.puzzle, game.size, game.maxVal, game.rowT, game.colT);
				expect(n, `difficulty "${key}" seed ${seed} must have exactly one solution`).toBe(1);
			}
		}
	});

	it('removes the requested number of cells (or fewer if uniqueness blocks it)', () => {
		const diff = DIFFS.facile;
		const game = generatePuzzle(diff, mulberry32(999));
		const holes = game.puzzle.flat().filter((v) => v == null).length;
		expect(holes).toBeGreaterThan(0);
		expect(holes).toBeLessThanOrEqual(diff.holes);
	});

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generatePuzzle(DIFFS.moyen, mulberry32(seed));
		const b = generatePuzzle(DIFFS.moyen, mulberry32(seed));
		expect(a.puzzle).toEqual(b.puzzle);
		expect(a.rowT).toEqual(b.rowT);
		expect(a.colT).toEqual(b.colT);
	});

	it('different seeds usually produce different puzzles', () => {
		const a = generatePuzzle(DIFFS.moyen, mulberry32(1));
		const b = generatePuzzle(DIFFS.moyen, mulberry32(2));
		expect(JSON.stringify(a.solution)).not.toEqual(JSON.stringify(b.solution));
	});

	it('findHint solves the grid step by step, always proposing the solution value', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const game = generatePuzzle(diff, mulberry32(2026 + diff.size));
			const entries: (number | null)[][] = Array.from({ length: diff.size }, () =>
				new Array(diff.size).fill(null),
			);
			for (let step = 0; step < diff.size * diff.size + 1; step++) {
				const h = findHint(entries, game);
				if (!h) break;
				expect(h.value, `"${key}" never proposes a wrong value`).toBe(
					game.solution[h.r][h.c],
				);
				expect(h.reason.length).toBeGreaterThan(0);
				entries[h.r][h.c] = h.value;
			}
			// givens + entries now equal the full solution
			for (let r = 0; r < diff.size; r++)
				for (let c = 0; c < diff.size; c++)
					expect(game.puzzle[r][c] != null ? game.puzzle[r][c] : entries[r][c]).toBe(
						game.solution[r][c],
					);
		}
	});

	it('findHint corrects a wrong entry first', () => {
		const game = generatePuzzle(DIFFS.facile, mulberry32(5));
		const { size, maxVal } = game;
		const entries: (number | null)[][] = Array.from({ length: size }, () =>
			new Array(size).fill(null),
		);
		// place a guaranteed-wrong value in an empty editable cell
		let placed = false;
		for (let r = 0; r < size && !placed; r++)
			for (let c = 0; c < size && !placed; c++)
				if (game.puzzle[r][c] == null) {
					entries[r][c] = (game.solution[r][c]! % maxVal) + 1; // != solution
					placed = true;
				}
		const h = findHint(entries, game)!;
		expect(h.value).toBe(game.solution[h.r][h.c]);
		expect(game.solution[h.r][h.c]).not.toBe(entries[h.r][h.c]); // it targeted the wrong cell
		expect(h.reason).toContain('déséquilibre');
	});
});
