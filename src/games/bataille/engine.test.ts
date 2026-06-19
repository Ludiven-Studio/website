import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { DIFFS, generateBataille, countSolutions, segType } from './engine';

const noTouch = (grid: boolean[][]): boolean => {
	const n = grid.length;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (grid[r][c])
				// only diagonal contact is forbidden between distinct ships; here we just
				// assert no diagonal ship neighbour (ships never touch diagonally)
				for (const [dr, dc] of [
					[-1, -1],
					[-1, 1],
					[1, -1],
					[1, 1],
				])
					if (grid[r + dr]?.[c + dc]) return false;
	return true;
};

describe('bataille engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateBataille(diff, mulberry32(9000 + s * 37 + diff.size));
				// counts match
				const rc = new Array(p.size).fill(0);
				const cc = new Array(p.size).fill(0);
				let ships = 0;
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++)
						if (p.solution[r][c]) {
							rc[r]++;
							cc[c]++;
							ships++;
						}
				expect(rc).toEqual(p.rowCounts);
				expect(cc).toEqual(p.colCounts);
				expect(ships).toBe(diff.fleet.reduce((a, b) => a + b, 0));
				expect(noTouch(p.solution)).toBe(true);
				expect(countSolutions(p.size, p.fleet, p.rowCounts, p.colCounts, p.given, 2)).toBe(1);
			}
		}, 20000);
	}

	it('segType reads ship shapes', () => {
		const p = generateBataille(DIFFS.facile, mulberry32(321));
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) {
				const s = segType(p.solution, r, c);
				if (p.solution[r][c]) expect(s).not.toBeNull();
				else expect(s).toBeNull();
			}
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateBataille(DIFFS.moyen, mulberry32(seed));
		const b = generateBataille(DIFFS.moyen, mulberry32(seed));
		expect(a.solution).toEqual(b.solution);
		expect(a.given).toEqual(b.given);
	});
});
