/**
 * SUGURU (Tectonic) — pure engine (no UI).
 * The grid is split into zones; a zone of k cells holds 1..k once each, and two
 * equal digits may never touch (orthogonally OR diagonally). Generation
 * guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface SuguruPuzzle {
	size: number;
	zones: number[][]; // zone id per cell
	zoneSize: number[]; // cells per zone id
	maxDigit: number; // largest zone size (pad range)
	given: (number | null)[][];
	solution: number[][];
}

export interface DiffLevel {
	label: string;
	size: number;
	givens: number; // target number of revealed cells (more = easier)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, givens: 13 },
	moyen: { label: 'Moyen', size: 6, givens: 17 },
	difficile: { label: 'Difficile', size: 7, givens: 23 },
};

const N8 = [
	[-1, -1], [-1, 0], [-1, 1],
	[0, -1], [0, 1],
	[1, -1], [1, 0], [1, 1],
];

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Partition the grid into connected zones of size 1..5 (mostly 4-5). */
function makePartition(size: number, rng: Rng): number[][] {
	const zones: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
	const inb = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size;
	let id = 0;

	for (let sr = 0; sr < size; sr++) {
		for (let sc = 0; sc < size; sc++) {
			if (zones[sr][sc] !== -1) continue;
			const target = 4 + Math.floor(rng() * 2); // 4 or 5
			const cells: [number, number][] = [[sr, sc]];
			zones[sr][sc] = id;
			while (cells.length < target) {
				// candidate frontier: unassigned orthogonal neighbours of the zone
				const frontier: [number, number][] = [];
				for (const [r, c] of cells)
					for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
						const nr = r + dr, nc = c + dc;
						if (inb(nr, nc) && zones[nr][nc] === -1) frontier.push([nr, nc]);
					}
				if (frontier.length === 0) break;
				const [pr, pc] = frontier[Math.floor(rng() * frontier.length)];
				zones[pr][pc] = id;
				cells.push([pr, pc]);
			}
			id++;
		}
	}

	// Merge any leftover size-1 zone into a neighbour (keeps zones >= 2 where possible).
	const sizeOf = (zid: number) => zones.flat().filter((z) => z === zid).length;
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (sizeOf(zones[r][c]) !== 1) continue;
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nr = r + dr, nc = c + dc;
				if (inb(nr, nc) && zones[nr][nc] !== zones[r][c] && sizeOf(zones[nr][nc]) < 5) {
					zones[r][c] = zones[nr][nc];
					break;
				}
			}
		}

	// Renumber zone ids to a dense 0..m-1 range.
	const remap = new Map<number, number>();
	let next = 0;
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const z = zones[r][c];
			if (!remap.has(z)) remap.set(z, next++);
			zones[r][c] = remap.get(z)!;
		}
	return zones;
}

function zoneSizes(zones: number[][], size: number): number[] {
	const m = Math.max(...zones.flat()) + 1;
	const counts = new Array(m).fill(0);
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) counts[zones[r][c]]++;
	return counts;
}

/** Is `v` a legal placement at (r,c) given current grid (zone + adjacency)? */
function legal(
	grid: (number | null)[][],
	zones: number[][],
	zoneOf: Map<number, [number, number][]>,
	size: number,
	r: number,
	c: number,
	v: number,
): boolean {
	for (const [nr, nc] of N8) {
		const rr = r + nr, cc = c + nc;
		if (rr >= 0 && rr < size && cc >= 0 && cc < size && grid[rr][cc] === v) return false;
	}
	for (const [zr, zc] of zoneOf.get(zones[r][c])!)
		if (grid[zr][zc] === v) return false;
	return true;
}

function zoneCells(zones: number[][], size: number): Map<number, [number, number][]> {
	const map = new Map<number, [number, number][]>();
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const z = zones[r][c];
			if (!map.has(z)) map.set(z, []);
			map.get(z)!.push([r, c]);
		}
	return map;
}

/** Count solutions of a partial grid, stopping at `limit` (uniqueness check). */
export function countSolutions(
	zones: number[][],
	given: (number | null)[][],
	size: number,
	limit = 2,
): number {
	const zSize = zoneSizes(zones, size);
	const zoneOf = zoneCells(zones, size);
	const grid = given.map((row) => [...row]);
	const empties: [number, number][] = [];
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) if (grid[r][c] == null) empties.push([r, c]);

	let count = 0;
	const dfs = (i: number): void => {
		if (count >= limit) return;
		if (i === empties.length) {
			count++;
			return;
		}
		// MRV: pick the remaining empty with the fewest candidates.
		let bestK = i, bestCand: number[] | null = null;
		for (let k = i; k < empties.length; k++) {
			const [r, c] = empties[k];
			const max = zSize[zones[r][c]];
			const cand: number[] = [];
			for (let v = 1; v <= max; v++) if (legal(grid, zones, zoneOf, size, r, c, v)) cand.push(v);
			if (bestCand == null || cand.length < bestCand.length) {
				bestCand = cand;
				bestK = k;
				if (cand.length <= 1) break;
			}
		}
		[empties[i], empties[bestK]] = [empties[bestK], empties[i]];
		const [r, c] = empties[i];
		for (const v of bestCand!) {
			grid[r][c] = v;
			dfs(i + 1);
			grid[r][c] = null;
			if (count >= limit) break;
		}
		[empties[i], empties[bestK]] = [empties[bestK], empties[i]];
	};
	dfs(0);
	return count;
}

/** Fill a partition with one random valid solution, or null if impossible.
    MRV ordering (most-constrained cell first) keeps backtracking cheap. */
function solveOne(zones: number[][], size: number, rng: Rng): number[][] | null {
	const zSize = zoneSizes(zones, size);
	const zoneOf = zoneCells(zones, size);
	const grid: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));

	const solve = (): boolean => {
		let bestR = -1, bestC = -1, bestCand: number[] | null = null;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				if (grid[r][c] != null) continue;
				const max = zSize[zones[r][c]];
				const cand: number[] = [];
				for (let v = 1; v <= max; v++) if (legal(grid, zones, zoneOf, size, r, c, v)) cand.push(v);
				if (cand.length === 0) return false; // dead end
				if (bestCand == null || cand.length < bestCand.length) {
					bestCand = cand;
					bestR = r;
					bestC = c;
				}
			}
		if (bestR === -1) return true; // all filled
		for (const v of shuffle(bestCand!, rng)) {
			grid[bestR][bestC] = v;
			if (solve()) return true;
			grid[bestR][bestC] = null;
		}
		return false;
	};
	return solve() ? (grid as number[][]) : null;
}

export function generateSuguru(diff: DiffLevel, rng: Rng = Math.random): SuguruPuzzle {
	const { size } = diff;

	for (let attempt = 0; attempt < 200; attempt++) {
		const zones = makePartition(size, rng);
		const solution = solveOne(zones, size, rng);
		if (!solution) continue;

		// Strip clues while the solution stays unique, down to the target count.
		const given: (number | null)[][] = solution.map((row) => [...row]);
		let count = size * size;
		for (const [r, c] of shuffle(
			Array.from({ length: size * size }, (_, i): [number, number] => [Math.floor(i / size), i % size]),
			rng,
		)) {
			if (count <= diff.givens) break;
			const keep = given[r][c];
			given[r][c] = null;
			if (countSolutions(zones, given, size) === 1) count--;
			else given[r][c] = keep;
		}

		const zSize = zoneSizes(zones, size);
		return {
			size,
			zones,
			zoneSize: zSize,
			maxDigit: Math.max(...zSize),
			given,
			solution,
		};
	}

	throw new Error('Suguru: failed to generate a puzzle');
}

export interface HintResult {
	r: number;
	c: number;
	value: number;
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * Corrects a wrong entry first; then "last cell of a zone", naked single, hidden
 * single within a zone; finally an honest fallback. The returned value is always
 * the solution.
 */
export function findHint(
	entries: (number | null)[][],
	puzzle: SuguruPuzzle,
): HintResult | null {
	const { size, zones, zoneSize, given, solution } = puzzle;
	const editable = (r: number, c: number) => given[r][c] == null;
	const val = (r: number, c: number): number | null =>
		given[r][c] != null ? given[r][c] : entries[r][c];

	const zoneOf = zoneCells(zones, size);
	const inb = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size;

	// 1) Correction — a wrong filled cell (duplicate in zone or equal neighbour).
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (!editable(r, c) || entries[r][c] == null) continue;
			const x = entries[r][c]!;
			if (x === solution[r][c]) continue;
			const y = solution[r][c];
			let dupInZone = false;
			for (const [zr, zc] of zoneOf.get(zones[r][c])!)
				if ((zr !== r || zc !== c) && val(zr, zc) === x) dupInZone = true;
			let touches = false;
			for (const [dr, dc] of N8) {
				const rr = r + dr, cc = c + dc;
				if (inb(rr, cc) && val(rr, cc) === x) touches = true;
			}
			const reason = dupInZone
				? `Le ${x} ici est en conflit (doublon dans la zone) — la bonne valeur est ${y}.`
				: touches
					? `Le ${x} ici est en conflit (il touche un autre ${x}) — la bonne valeur est ${y}.`
					: `Le ${x} ne convient pas ici — la valeur correcte est ${y}.`;
			return { r, c, value: y, reason };
		}

	// Candidates of an empty cell: (1..zoneSize) minus values in its zone and 8-neighbours.
	const candidates = (r: number, c: number): number[] => {
		const used = new Set<number>();
		for (const [zr, zc] of zoneOf.get(zones[r][c])!) {
			const v = val(zr, zc);
			if (v != null) used.add(v);
		}
		for (const [dr, dc] of N8) {
			const rr = r + dr, cc = c + dc;
			if (inb(rr, cc)) {
				const v = val(rr, cc);
				if (v != null) used.add(v);
			}
		}
		const out: number[] = [];
		for (let v = 1; v <= zoneSize[zones[r][c]]; v++) if (!used.has(v)) out.push(v);
		return out;
	};

	// 2) Last empty cell of a zone.
	for (const cells of zoneOf.values()) {
		const empties = cells.filter(([r, c]) => editable(r, c) && val(r, c) == null);
		if (empties.length !== 1) continue;
		const [r, c] = empties[0];
		const y = solution[r][c];
		return {
			r,
			c,
			value: y,
			reason: `Cette zone n'a plus qu'une case libre : il y manque le ${y}.`,
		};
	}

	// 3) Naked single — zone + 8-neighbour exclusions leave a single candidate.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (!editable(r, c) || val(r, c) != null) continue;
			const cand = candidates(r, c);
			if (cand.length === 1 && cand[0] === solution[r][c])
				return {
					r,
					c,
					value: cand[0],
					reason: `Ici, en comptant la zone et les cases voisines, seul le ${cand[0]} est possible.`,
				};
		}

	// 4) Hidden single — a value fits only one empty cell of a zone.
	for (const cells of zoneOf.values()) {
		const empties = cells.filter(([r, c]) => editable(r, c) && val(r, c) == null);
		if (empties.length === 0) continue;
		const k = zoneSize[zones[empties[0][0]][empties[0][1]]];
		for (let v = 1; v <= k; v++) {
			const fit = empties.filter(([r, c]) => candidates(r, c).includes(v));
			if (fit.length === 1 && solution[fit[0][0]][fit[0][1]] === v)
				return {
					r: fit[0][0],
					c: fit[0][1],
					value: v,
					reason: `Dans cette zone, le ${v} ne peut aller que dans cette case.`,
				};
		}
	}

	// 5) Fallback — first empty cell.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++)
			if (editable(r, c) && val(r, c) == null)
				return {
					r,
					c,
					value: solution[r][c],
					reason: `Par élimination, cette case vaut ${solution[r][c]}.`,
				};

	return null;
}
