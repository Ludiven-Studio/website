import { describe, it, expect } from 'vitest';
import { DIFFS, generateSuguru, countSolutions, findHint } from './engine';
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

	it('findHint solves the grid step by step, always proposing the solution value', () => {
		const p = generateSuguru(DIFFS.moyen, mulberry32(2026));
		const { size } = p;
		const entries: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
		for (let step = 0; step < size * size; step++) {
			const h = findHint(entries, p);
			if (!h) break;
			expect(h.value).toBe(p.solution[h.r][h.c]); // never proposes a wrong value
			expect(h.reason.length).toBeGreaterThan(0);
			entries[h.r][h.c] = h.value;
		}
		// the whole grid (givens + entries) now equals the solution
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++)
				expect(p.given[r][c] != null ? p.given[r][c] : entries[r][c]).toBe(p.solution[r][c]);
	});

	it('findHint corrects a wrong entry first', () => {
		const p = generateSuguru(DIFFS.facile, mulberry32(5));
		const { size, zoneSize, zones } = p;
		const entries: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
		// place a wrong value in an empty editable cell (within its zone range)
		let placed = false;
		for (let r = 0; r < size && !placed; r++)
			for (let c = 0; c < size && !placed; c++)
				if (p.given[r][c] == null) {
					const k = zoneSize[zones[r][c]];
					entries[r][c] = (p.solution[r][c] % k) + 1; // != solution, still in 1..k
					placed = true;
				}
		const h = findHint(entries, p)!;
		expect(h.value).toBe(p.solution[h.r][h.c]);
		expect(p.solution[h.r][h.c]).not.toBe(entries[h.r][h.c]); // it targeted the wrong cell
	});
});
