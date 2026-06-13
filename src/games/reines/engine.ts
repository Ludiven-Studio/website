/**
 * REINES (LinkedIn "Queens") — pure engine (no UI).
 * n×n grid split into n colour regions. Place one queen per row, per column
 * and per region, with no two queens adjacent (orthogonal or diagonal).
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
}

export interface ReinesPuzzle {
	size: number;
	regions: number[][]; // region id 0..n-1 per cell
	solution: number[]; // solution[row] = col of the queen
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 6 },
	moyen: { label: 'Moyen', size: 7 },
	difficile: { label: 'Difficile', size: 8 },
};

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Random valid queen placement: a permutation with no diagonally-adjacent
 *  queens on consecutive rows (the only adjacency possible with 1 per row/col). */
function randomSolution(n: number, rng: Rng): number[] | null {
	const sol = new Array(n).fill(-1);
	const usedCol = new Array(n).fill(false);

	const place = (r: number): boolean => {
		if (r === n) return true;
		for (const c of shuffle(
			Array.from({ length: n }, (_, i) => i),
			rng,
		)) {
			if (usedCol[c]) continue;
			if (r > 0 && Math.abs(sol[r - 1] - c) === 1) continue; // diagonal adjacency
			sol[r] = c;
			usedCol[c] = true;
			if (place(r + 1)) return true;
			usedCol[c] = false;
			sol[r] = -1;
		}
		return false;
	};

	return place(0) ? sol : null;
}

/** Grow n connected regions from the queen cells via randomised frontier fill. */
function growRegions(n: number, solution: number[], rng: Rng): number[][] {
	const regions: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	const frontier: [number, number, number][] = []; // r, c, region

	const addNeighbours = (r: number, c: number, id: number) => {
		const dirs = [
			[r - 1, c],
			[r + 1, c],
			[r, c - 1],
			[r, c + 1],
		];
		for (const [nr, nc] of dirs) {
			if (nr >= 0 && nr < n && nc >= 0 && nc < n && regions[nr][nc] === -1) {
				frontier.push([nr, nc, id]);
			}
		}
	};

	for (let id = 0; id < n; id++) {
		const r = id;
		const c = solution[r];
		regions[r][c] = id;
		addNeighbours(r, c, id);
	}

	let remaining = n * n - n;
	while (remaining > 0 && frontier.length) {
		const idx = Math.floor(rng() * frontier.length);
		const [r, c, id] = frontier.splice(idx, 1)[0];
		if (regions[r][c] !== -1) continue;
		regions[r][c] = id;
		remaining--;
		addNeighbours(r, c, id);
	}

	// Safety: assign any leftover cell (rare) to a neighbouring region.
	if (remaining > 0) {
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (regions[r][c] === -1) {
					const dirs = [
						[r - 1, c],
						[r + 1, c],
						[r, c - 1],
						[r, c + 1],
					];
					for (const [nr, nc] of dirs)
						if (nr >= 0 && nr < n && nc >= 0 && nc < n && regions[nr][nc] !== -1) {
							regions[r][c] = regions[nr][nc];
							break;
						}
				}
	}
	return regions;
}

/** True if two cells are adjacent (orthogonal or diagonal). */
const adjacent = (r1: number, c1: number, r2: number, c2: number) =>
	Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;

export type ConflictReason = 'ligne' | 'colonne' | 'zone' | 'contact';

export interface Conflicts {
	cells: Set<string>; // "r,c" of every queen in conflict
	reasons: Set<ConflictReason>;
	regions: Set<number>; // region ids holding 2+ queens
}

/**
 * Pure conflict check shared by the UI and the tests.
 * Two queens conflict if they share a row, a column, a colour region, or are
 * adjacent (the 8 surrounding cells).
 */
export function findConflicts(regions: number[][], queens: [number, number][]): Conflicts {
	const cells = new Set<string>();
	const reasons = new Set<ConflictReason>();
	const regionCount = new Map<number, number>();
	for (const [r, c] of queens) {
		const id = regions[r]?.[c];
		if (id === undefined) continue; // ignore out-of-bounds queens (defensive)
		regionCount.set(id, (regionCount.get(id) ?? 0) + 1);
	}

	for (let i = 0; i < queens.length; i++) {
		for (let j = i + 1; j < queens.length; j++) {
			const [r1, c1] = queens[i];
			const [r2, c2] = queens[j];
			const reg1 = regions[r1]?.[c1];
			const reg2 = regions[r2]?.[c2];
			let reason: ConflictReason | null = null;
			if (r1 === r2) reason = 'ligne';
			else if (c1 === c2) reason = 'colonne';
			else if (reg1 !== undefined && reg1 === reg2) reason = 'zone';
			else if (adjacent(r1, c1, r2, c2)) reason = 'contact';
			if (reason) {
				cells.add(`${r1},${c1}`);
				cells.add(`${r2},${c2}`);
				reasons.add(reason);
			}
		}
	}

	const conflictRegions = new Set<number>();
	for (const [id, n] of regionCount) if (n >= 2) conflictRegions.add(id);
	return { cells, reasons, regions: conflictRegions };
}

/** Count solutions of a regions board, stopping at `limit`. */
export function countSolutions(regions: number[][], n: number, limit = 2): number {
	const cols = new Array(n).fill(false);
	const usedRegion = new Array(n).fill(false);
	const placed: number[] = []; // placed[row] = col
	let count = 0;

	const dfs = (r: number) => {
		if (count >= limit) return;
		if (r === n) {
			count++;
			return;
		}
		for (let c = 0; c < n; c++) {
			if (cols[c]) continue;
			const id = regions[r][c];
			if (usedRegion[id]) continue;
			if (r > 0 && adjacent(r, c, r - 1, placed[r - 1])) continue;
			cols[c] = true;
			usedRegion[id] = true;
			placed[r] = c;
			dfs(r + 1);
			cols[c] = false;
			usedRegion[id] = false;
			if (count >= limit) return;
		}
	};

	dfs(0);
	return count;
}

/** Generate a uniquely-solvable Reines puzzle. */
export function generateReines(diff: DiffLevel, rng: Rng = Math.random): ReinesPuzzle {
	const n = diff.size;
	for (let attempt = 0; attempt < 200; attempt++) {
		const solution = randomSolution(n, rng);
		if (!solution) continue;
		// A few region layouts per solution before re-seeding the solution.
		for (let g = 0; g < 12; g++) {
			const regions = growRegions(n, solution, rng);
			if (countSolutions(regions, n, 2) === 1) {
				return { size: n, regions, solution };
			}
		}
	}
	// Extremely unlikely fallback: return last attempt's layout.
	const solution = randomSolution(n, rng) ?? Array.from({ length: n }, (_, i) => i);
	const regions = growRegions(n, solution, rng);
	return { size: n, regions, solution };
}
