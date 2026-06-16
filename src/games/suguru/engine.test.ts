import { describe, it, expect } from 'vitest';
import { DIFFS, generateSuguru, countSolutions } from './engine';
import { mulberry32 } from '../prng';

const N8 = [
	[-1, -1], [-1, 0], [-1, 1],
	[0, -1], [0, 1],
	[1, -1], [1, 0], [1, 1],
];

describe('suguru engine', () => {
	it('generates a uniquely-solvable puzzle for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateSuguru(diff, mulberry32(7000 + diff.size));
			expect(countSolutions(p.zones, p.given, p.size), `"${key}" unique`).toBe(1);
		}
	});

	it('solution respects zones (1..k once) and 8-adjacency', () => {
		const p = generateSuguru(DIFFS.moyen, mulberry32(424242));
		const { size, zones, zoneSize, solution } = p;
		// Each zone is a permutation of 1..k.
		const byZone = new Map<number, number[]>();
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				const z = zones[r][c];
				if (!byZone.has(z)) byZone.set(z, []);
				byZone.get(z)!.push(solution[r][c]);
			}
		for (const [z, vals] of byZone) {
			const k = zoneSize[z];
			expect(vals.slice().sort((a, b) => a - b)).toEqual(
				Array.from({ length: k }, (_, i) => i + 1),
			);
		}
		// No two equal digits touch (including diagonally).
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++)
				for (const [dr, dc] of N8) {
					const rr = r + dr, cc = c + dc;
					if (rr >= 0 && rr < size && cc >= 0 && cc < size)
						expect(solution[r][c] === solution[rr][cc]).toBe(false);
				}
	});

	it('givens are a subset of the solution', () => {
		const p = generateSuguru(DIFFS.facile, mulberry32(13));
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++)
				if (p.given[r][c] != null) expect(p.given[r][c]).toBe(p.solution[r][c]);
	});
});
