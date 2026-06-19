import { describe, it, expect } from 'vitest';
import { DIFFS, SIZE, generateRondCarre, countSolutions, findHint, type Cell } from './engine';
import { mulberry32, dateSeed } from '../prng';

function isValidSolution(sol: number[][], n: number): boolean {
	const half = n / 2;
	for (let r = 0; r < n; r++) {
		let a = 0;
		for (let c = 0; c < n; c++) {
			if (sol[r][c] === 1) a++;
			if (c >= 2 && sol[r][c] === sol[r][c - 1] && sol[r][c] === sol[r][c - 2]) return false;
		}
		if (a !== half) return false;
	}
	for (let c = 0; c < n; c++) {
		let a = 0;
		for (let r = 0; r < n; r++) {
			if (sol[r][c] === 1) a++;
			if (r >= 2 && sol[r][c] === sol[r - 1][c] && sol[r][c] === sol[r - 2][c]) return false;
		}
		if (a !== half) return false;
	}
	return true;
}

describe('rond-carre engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: valid solution, givens ⊂ solution, consistent constraints, unique`, () => {
			const p = generateRondCarre(diff, mulberry32(11 + diff.extraGivens));
			const n = p.size;
			expect(n).toBe(SIZE);

			expect(isValidSolution(p.solution, n)).toBe(true);

			// Givens are a subset of the solution.
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++)
					if (p.given[r][c] !== 0) expect(p.given[r][c]).toBe(p.solution[r][c]);

			// Every constraint matches the solution.
			for (const { a, b, eq } of p.constraints) {
				const same = p.solution[a[0]][a[1]] === p.solution[b[0]][b[1]];
				expect(same).toBe(eq);
			}

			// Exactly one solution.
			expect(countSolutions(p.given, p.constraints, n, 2)).toBe(1);
		});
	}

	it('easier levels reveal more givens', () => {
		const count = (k: keyof typeof DIFFS) =>
			generateRondCarre(DIFFS[k], mulberry32(42)).given.flat().filter((v) => v !== 0).length;
		expect(count('facile')).toBeGreaterThanOrEqual(count('difficile'));
	});

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-15T00:00:00Z'));
		const a = generateRondCarre(DIFFS.moyen, mulberry32(seed));
		const b = generateRondCarre(DIFFS.moyen, mulberry32(seed));
		expect(a.given).toEqual(b.given);
		expect(a.solution).toEqual(b.solution);
		expect(a.constraints).toEqual(b.constraints);
	});

	it('findHint solves step by step, always proposing the solution value', () => {
		for (const key of Object.keys(DIFFS)) {
			const p = generateRondCarre(DIFFS[key], mulberry32(300 + DIFFS[key].extraGivens));
			const n = p.size;
			const marks: Cell[][] = Array.from({ length: n }, () => new Array(n).fill(0) as Cell[]);
			for (let step = 0; step < n * n + 1; step++) {
				const h = findHint(marks, p);
				if (!h) break;
				expect(h.value).toBe(p.solution[h.r][h.c]); // never proposes a wrong value
				expect(h.reason.length).toBeGreaterThan(0);
				marks[h.r][h.c] = h.value;
			}
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++)
					expect(p.given[r][c] !== 0 ? p.given[r][c] : marks[r][c]).toBe(p.solution[r][c]);
		}
	});

	it('findHint corrects a wrong mark first', () => {
		const p = generateRondCarre(DIFFS.facile, mulberry32(9));
		const n = p.size;
		const marks: Cell[][] = Array.from({ length: n }, () => new Array(n).fill(0) as Cell[]);
		let placed = false;
		for (let r = 0; r < n && !placed; r++)
			for (let c = 0; c < n && !placed; c++)
				if (p.given[r][c] === 0) {
					marks[r][c] = (p.solution[r][c] === 1 ? 2 : 1) as Cell; // wrong on purpose
					placed = true;
				}
		const h = findHint(marks, p)!;
		expect(h.value).toBe(p.solution[h.r][h.c]);
		expect(p.solution[h.r][h.c]).not.toBe(marks[h.r][h.c]);
	});
});
