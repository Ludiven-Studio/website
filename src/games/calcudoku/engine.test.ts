import { describe, it, expect } from 'vitest';
import { DIFFS, generateCalcudoku, countSolutions, findHint } from './engine';
import { mulberry32, dateSeed } from '../prng';

// Fixed cells = single-cell "=" cages (shown as givens in the UI).
function givenGrid(p: ReturnType<typeof generateCalcudoku>): (number | null)[][] {
	const g: (number | null)[][] = Array.from({ length: p.size }, () =>
		new Array(p.size).fill(null),
	);
	for (const cage of p.cages)
		if (cage.op === '=') {
			const [r, c] = cage.cells[0];
			g[r][c] = cage.target;
		}
	return g;
}

describe('calcudoku engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: valid latin square, consistent cages, unique`, () => {
			const p = generateCalcudoku(diff, mulberry32(50 + diff.size));
			const n = p.size;

			// Latin square.
			const expected = [...Array(n)].map((_, i) => i + 1).join(',');
			for (let r = 0; r < n; r++)
				expect([...p.solution[r]].sort((a, b) => a - b).join(',')).toBe(expected);
			for (let c = 0; c < n; c++)
				expect(p.solution.map((row) => row[c]).sort((a, b) => a - b).join(',')).toBe(expected);

			// Every cell belongs to exactly one cage, cages cover the grid.
			const covered = p.cages.flatMap((cage) => cage.cells);
			expect(covered.length).toBe(n * n);

			// Each cage's solution values satisfy its target/op.
			for (const cage of p.cages) {
				const vals = cage.cells.map(([r, c]) => p.solution[r][c]);
				let ok = false;
				if (cage.op === '=') ok = vals[0] === cage.target;
				else if (cage.op === '+') ok = vals.reduce((a, b) => a + b, 0) === cage.target;
				else if (cage.op === '*') ok = vals.reduce((a, b) => a * b, 1) === cage.target;
				else if (cage.op === '-') ok = Math.abs(vals[0] - vals[1]) === cage.target;
				else if (cage.op === '/') {
					const hi = Math.max(...vals), lo = Math.min(...vals);
					ok = hi / lo === cage.target;
				}
				expect(ok, `cage ${cage.op}${cage.target}`).toBe(true);
			}

			// Exactly one solution.
			expect(countSolutions(p.cages, n, 2)).toBe(1);
		});
	}

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateCalcudoku(DIFFS.moyen, mulberry32(seed));
		const b = generateCalcudoku(DIFFS.moyen, mulberry32(seed));
		expect(a.solution).toEqual(b.solution);
		expect(a.cageOf).toEqual(b.cageOf);
	});

	it('findHint solves the grid step by step, always proposing the solution value', () => {
		const p = generateCalcudoku(DIFFS.moyen, mulberry32(2026));
		const n = p.size;
		const given = givenGrid(p);
		const entries: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
		const val = (r: number, c: number) => (given[r][c] != null ? given[r][c] : entries[r][c]);

		for (let step = 0; step < n * n; step++) {
			const h = findHint(entries, p);
			if (!h) break;
			expect(h.value).toBe(p.solution[h.r][h.c]); // never proposes a wrong value
			expect(h.reason.length).toBeGreaterThan(0);
			entries[h.r][h.c] = h.value;
		}
		// the whole grid (givens + entries) now equals the solution
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) expect(val(r, c)).toBe(p.solution[r][c]);
	});

	it('findHint corrects a wrong entry first', () => {
		const p = generateCalcudoku(DIFFS.facile, mulberry32(5));
		const n = p.size;
		const given = givenGrid(p);
		const entries: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
		// place a wrong value in an empty editable (non-given) cell
		let placed = false;
		for (let r = 0; r < n && !placed; r++)
			for (let c = 0; c < n && !placed; c++)
				if (given[r][c] == null) {
					entries[r][c] = (p.solution[r][c] % n) + 1; // guaranteed != solution
					placed = true;
				}
		const h = findHint(entries, p)!;
		expect(h.value).toBe(p.solution[h.r][h.c]);
		expect(p.solution[h.r][h.c]).not.toBe(entries[h.r][h.c]); // it targeted the wrong cell
	});
});
