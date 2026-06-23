/**
 * BATAILLE NAVALE — chasse à la flotte (pure engine, no UI).
 * A hidden fleet of straight ships that never touch (8-neighbourhood). The player fires at cells
 * (hit/miss) and may spend a few sonars (3×3 ship-cell count) to aim. Goal: sink the whole fleet
 * in as few actions as possible. Fleet placement is deterministic from a seeded Rng (daily).
 */

import type { Rng } from '../prng';

export type Coord = { r: number; c: number };

export type SegType = 'single' | 'left' | 'right' | 'top' | 'bottom' | 'mid-h' | 'mid-v' | null;

export interface SizeLevel {
	label: string;
	size: number;
	fleet: number[]; // ship lengths
	sonars: number; // sonars available this game
}

export const SIZES: Record<string, SizeLevel> = {
	facile: { label: 'Facile', size: 8, fleet: [3, 3, 2, 2], sonars: 8 },
	moyen: { label: 'Moyen', size: 10, fleet: [4, 3, 3, 2, 2], sonars: 7 },
	difficile: { label: 'Difficile', size: 12, fleet: [5, 4, 3, 3, 2], sonars: 6 },
};

export interface HuntPuzzle {
	size: number;
	fleet: number[];
	ships: boolean[][]; // true = ship cell
	shipId: number[][]; // ship index (0..n-1) on its cells, -1 on water (for "sunk" detection)
}

interface Placement {
	cells: [number, number][];
	idx: number;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Segment shape of a ship cell, from its ship neighbours (for rendering sunk ships). */
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
	for (let r = 0; r < n; r++)
		for (let c = 0; c + L <= n; c++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r, c + k]);
			out.push({ cells, idx: (r * n + c) * 2 });
		}
	for (let c = 0; c < n; c++)
		for (let r = 0; r + L <= n; r++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r + k, c]);
			out.push({ cells, idx: (r * n + c) * 2 + 1 });
		}
	return out;
}

/** A placement fits if its cells are free and touch no other ship (8-neighbourhood). */
function fits(grid: number[][], cells: [number, number][], n: number): boolean {
	for (const [r, c] of cells) {
		if (grid[r][c] !== 0) return false;
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
				if (grid[nr][nc] === 1 && !cells.some(([cr, cc]) => cr === nr && cc === nc)) return false;
			}
	}
	return true;
}

/** Randomly place the fleet (no-touch), backtracking. Deterministic from `rng`. */
function placeFleet(n: number, fleet: number[], rng: Rng): boolean[][] | null {
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const place = (i: number): boolean => {
		if (i === fleet.length) return true;
		for (const p of shuffle(allPlacements(n, fleet[i]), rng)) {
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

/** Label connected (orthogonal) ship components → ship ids, -1 on water. */
function labelShips(ships: boolean[][], n: number): number[][] {
	const id: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	let next = 0;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!ships[r][c] || id[r][c] !== -1) continue;
			const stack: Coord[] = [{ r, c }];
			id[r][c] = next;
			while (stack.length) {
				const cur = stack.pop()!;
				for (const [dr, dc] of [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
				] as const) {
					const nr = cur.r + dr;
					const nc = cur.c + dc;
					if (nr >= 0 && nr < n && nc >= 0 && nc < n && ships[nr][nc] && id[nr][nc] === -1) {
						id[nr][nc] = next;
						stack.push({ r: nr, c: nc });
					}
				}
			}
			next++;
		}
	return id;
}

export function generateHunt(sizeLvl: SizeLevel, rng: Rng = Math.random): HuntPuzzle {
	const n = sizeLvl.size;
	const fleet = [...sizeLvl.fleet].sort((a, b) => b - a);
	let ships = placeFleet(n, fleet, rng);
	// placeFleet backtracks exhaustively; null is not expected for these fleets/boards.
	if (!ships) ships = Array.from({ length: n }, () => new Array(n).fill(false));
	return { size: n, fleet, ships, shipId: labelShips(ships, n) };
}

/** Ship cells a sonar reveals: the (2*radius+1)² area centred on (r,c). Default radius 1 → 3×3. */
export function sonarCount(ships: boolean[][], r: number, c: number, size: number, radius = 1): number {
	let k = 0;
	for (let dr = -radius; dr <= radius; dr++)
		for (let dc = -radius; dc <= radius; dc++) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr >= 0 && nr < size && nc >= 0 && nc < size && ships[nr][nc]) k++;
		}
	return k;
}

export function shipCells(p: HuntPuzzle, id: number): Coord[] {
	const out: Coord[] = [];
	for (let r = 0; r < p.size; r++)
		for (let c = 0; c < p.size; c++) if (p.shipId[r][c] === id) out.push({ r, c });
	return out;
}

/** Player shot grid: 0 unknown, 1 hit, 2 miss. */
export type Shot = 0 | 1 | 2;

/** A ship is sunk when all of its cells have been hit. */
export function isSunk(p: HuntPuzzle, shots: Shot[][], id: number): boolean {
	return shipCells(p, id).every(({ r, c }) => shots[r][c] === 1);
}

/** Won when every ship cell has been hit. */
export function isWon(p: HuntPuzzle, shots: Shot[][]): boolean {
	for (let r = 0; r < p.size; r++)
		for (let c = 0; c < p.size; c++) if (p.ships[r][c] && shots[r][c] !== 1) return false;
	return true;
}
