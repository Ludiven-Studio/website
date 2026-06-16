import { describe, it, expect } from 'vitest';
import { DIFFS, generatePuzzle, countSolutions } from './engine';
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
});
