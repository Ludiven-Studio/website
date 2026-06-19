/**
 * BATAILLE NAVALE LOGIQUE (Bimaru / Solitaire Battleships) — pure engine (no UI).
 * Find a hidden fleet. Cells are water or ship; ships never touch (8-neighbourhood).
 * Row/column clues give the number of ship cells; a few cells are revealed.
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export type Given = 'ship' | 'water' | null;
export type SegType =
	| 'single'
	| 'left'
	| 'right'
	| 'top'
	| 'bottom'
	| 'mid-h'
	| 'mid-v'
	| null;

export interface DiffLevel {
	label: string;
	size: number;
	fleet: number[]; // ship lengths, sorted desc
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 6, fleet: [3, 2, 2, 1, 1] },
	moyen: { label: 'Moyen', size: 7, fleet: [3, 3, 2, 2, 1, 1] },
	difficile: { label: 'Difficile', size: 8, fleet: [4, 3, 2, 2, 1, 1] },
};

export interface BataillePuzzle {
	size: number;
	fleet: number[];
	solution: boolean[][]; // true = ship
	rowCounts: number[];
	colCounts: number[];
	given: Given[][];
}

interface Placement {
	cells: [number, number][];
	idx: number; // canonical order key
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Segment shape of a ship cell, from its ship neighbours (for rendering). */
export function segType(grid: boolean[][], r: number, c: number): SegType {
	if (!grid[r][c]) return null;
	const n = grid.length;
	const up = r > 0 && grid[r - 1][c];
	const down = r < n - 1 && grid[r + 1][c];
	const left = c > 0 && grid[r][c - 1];
	const right = c < n - 1 && grid[r][c + 1];
	if (!up && !down && !left && !right) return 'single';
	if (left && right) return 'mid-h';
	if (up && down) return 'mid-v';
	if (right) return 'left';
	if (left) return 'right';
	if (down) return 'top';
	return 'bottom';
}

function allPlacements(n: number, L: number): Placement[] {
	const out: Placement[] = [];
	if (L === 1) {
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) out.push({ cells: [[r, c]], idx: (r * n + c) * 2 });
		return out;
	}
	// horizontal
	for (let r = 0; r < n; r++)
		for (let c = 0; c + L <= n; c++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r, c + k]);
			out.push({ cells, idx: (r * n + c) * 2 });
		}
	// vertical
	for (let c = 0; c < n; c++)
		for (let r = 0; r + L <= n; r++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r + k, c]);
			out.push({ cells, idx: (r * n + c) * 2 + 1 });
		}
	return out;
}

function fits(grid: number[][], cells: [number, number][], n: number): boolean {
	for (const [r, c] of cells) {
		if (grid[r][c] !== 0) return false;
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
				// neighbour occupied by a ship not part of this placement
				if (grid[nr][nc] === 1 && !cells.some(([cr, cc]) => cr === nr && cc === nc)) return false;
			}
	}
	return true;
}

/** Ship segment lengths (orthogonal components) match the fleet, and all are straight. */
function fleetMatches(grid: number[][], fleetSorted: number[], n: number): boolean {
	const seen: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
	const lengths: number[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (grid[r][c] !== 1 || seen[r][c]) continue;
			const comp: [number, number][] = [[r, c]];
			seen[r][c] = true;
			for (let h = 0; h < comp.length; h++) {
				const [cr, cc] = comp[h];
				for (const [nr, nc] of [
					[cr - 1, cc],
					[cr + 1, cc],
					[cr, cc - 1],
					[cr, cc + 1],
				] as [number, number][]) {
					if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] === 1 && !seen[nr][nc]) {
						seen[nr][nc] = true;
						comp.push([nr, nc]);
					}
				}
			}
			const rows = new Set(comp.map(([cr]) => cr));
			const cols = new Set(comp.map(([, cc]) => cc));
			if (rows.size > 1 && cols.size > 1) return false; // not a straight ship
			lengths.push(comp.length);
		}
	if (lengths.length !== fleetSorted.length) return false;
	lengths.sort((a, b) => b - a);
	return lengths.every((v, i) => v === fleetSorted[i]);
}

/**
 * Cell-by-cell solver. Each cell is ship(1) or water(0); forced by revealed clues and
 * by row/column counts; pruned by the local ship rules (no ship cell has a diagonal
 * ship neighbour, no ship cell bends). Fleet composition checked at the end. Fast even
 * near uniqueness. Stops at `limit`.
 */
export function countSolutions(
	size: number,
	fleet: number[],
	rowCounts: number[],
	colCounts: number[],
	given: Given[][],
	limit = 2,
): number {
	const n = size;
	const fleetSorted = [...fleet].sort((a, b) => b - a);
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1)); // -1 undecided
	const rowLeft = [...rowCounts];
	const colLeft = [...colCounts];
	let count = 0;

	const canShip = (r: number, c: number): boolean => {
		if (rowLeft[r] <= 0 || colLeft[c] <= 0) return false;
		if (grid[r - 1]?.[c - 1] === 1) return false; // diagonal ship neighbours
		if (grid[r - 1]?.[c + 1] === 1) return false;
		if (grid[r][c - 1] === 1 && grid[r - 1]?.[c] === 1) return false; // L-bend
		return true;
	};

	const dfs = (idx: number) => {
		if (count >= limit) return;
		if (idx === n * n) {
			if (fleetMatches(grid, fleetSorted, n)) count++;
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;

		const setShip = () => {
			grid[r][c] = 1;
			rowLeft[r]--;
			colLeft[c]--;
			dfs(idx + 1);
			grid[r][c] = -1;
			rowLeft[r]++;
			colLeft[c]++;
		};
		const setWater = () => {
			grid[r][c] = 0;
			dfs(idx + 1);
			grid[r][c] = -1;
		};

		const g = given[r][c];
		if (g === 'ship') {
			if (canShip(r, c)) setShip();
			return;
		}
		if (g === 'water') {
			setWater();
			return;
		}
		// Forcing by counts.
		const remRow = n - c; // undecided cells left in this row (c..n-1)
		const remCol = n - r; // undecided cells left in this column (r..n-1)
		if (rowLeft[r] > remRow || colLeft[c] > remCol) return; // impossible
		if (rowLeft[r] === 0 || colLeft[c] === 0) {
			setWater();
			return;
		}
		if (rowLeft[r] === remRow || colLeft[c] === remCol) {
			if (canShip(r, c)) setShip();
			return;
		}
		// Branch: ship first (more constrained), then water.
		if (canShip(r, c)) setShip();
		if (count >= limit) return;
		setWater();
	};

	dfs(0);
	return count;
}

function placeFleet(n: number, fleet: number[], rng: Rng): boolean[][] | null {
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const place = (i: number): boolean => {
		if (i === fleet.length) return true;
		const cands = shuffle(allPlacements(n, fleet[i]), rng);
		for (const p of cands) {
			if (!fits(grid, p.cells, n)) continue;
			for (const [r, c] of p.cells) grid[r][c] = 1;
			if (place(i + 1)) return true;
			for (const [r, c] of p.cells) grid[r][c] = 0;
		}
		return false;
	};
	if (!place(0)) return null;
	return grid.map((row) => row.map((v) => v === 1));
}

export function generateBataille(diff: DiffLevel, rng: Rng = Math.random): BataillePuzzle {
	const n = diff.size;
	const fleet = [...diff.fleet].sort((a, b) => b - a);

	for (let attempt = 0; attempt < 200; attempt++) {
		const solution = placeFleet(n, fleet, rng);
		if (!solution) continue;

		const rowCounts = new Array(n).fill(0);
		const colCounts = new Array(n).fill(0);
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (solution[r][c]) {
					rowCounts[r]++;
					colCounts[c]++;
				}

		const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
		if (countSolutions(n, fleet, rowCounts, colCounts, given, 2) === 1) {
			return { size: n, fleet, solution, rowCounts, colCounts, given };
		}

		// Reveal cells (ship cells first, they disambiguate most) until unique.
		const cells = shuffle(
			Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
			rng,
		).sort((a, b) => Number(solution[b[0]][b[1]]) - Number(solution[a[0]][a[1]]));
		let unique = false;
		for (const [r, c] of cells) {
			given[r][c] = solution[r][c] ? 'ship' : 'water';
			if (countSolutions(n, fleet, rowCounts, colCounts, given, 2) === 1) {
				unique = true;
				break;
			}
		}
		if (unique) return { size: n, fleet, solution, rowCounts, colCounts, given };
	}

	// Fallback: tiny unique puzzle (single 1-cell ship in the corner).
	const solution = Array.from({ length: n }, () => new Array(n).fill(false));
	solution[0][0] = true;
	const rowCounts = new Array(n).fill(0);
	const colCounts = new Array(n).fill(0);
	rowCounts[0] = 1;
	colCounts[0] = 1;
	const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
	return { size: n, fleet: [1], solution, rowCounts, colCounts, given };
}
