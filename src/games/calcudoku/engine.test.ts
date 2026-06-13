import { describe, it, expect } from 'vitest';
import { DIFFS, generateCalcudoku, countSolutions } from './engine';
import { mulberry32, dateSeed } from '../prng';

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
});
