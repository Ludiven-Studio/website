/**
 * SUDOKU — pure engine (no UI).
 * N×N grid with rectangular boxes (boxH×boxW, boxH*boxW = N).
 * Each row, column and box must contain 1..N exactly once.
 * Generation guarantees a unique solution by construction.
 *
 * Solver uses bitmask candidate sets + MRV (minimum-remaining-values)
 * heuristic, fast enough to generate 9×9 puzzles client-side.
 */

import type { Rng } from '../prng';

export type Grid = number[][]; // 0 = empty

export interface Variant {
	label: string;
	size: number;
	boxH: number; // box height (rows)
	boxW: number; // box width (cols)
}

export interface DiffLevel {
	label: string;
	removeFrac: number; // share of cells to try to remove
}

export interface SudokuPuzzle {
	size: number;
	boxH: number;
	boxW: number;
	given: Grid; // 0 = to fill
	solution: Grid;
}

export const SIZES: Record<'4' | '6' | '9', Variant> = {
	'4': { label: '4×4', size: 4, boxH: 2, boxW: 2 },
	'6': { label: '6×6', size: 6, boxH: 2, boxW: 3 },
	'9': { label: '9×9', size: 9, boxH: 3, boxW: 3 },
};

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', removeFrac: 0.4 },
	moyen: { label: 'Moyen', removeFrac: 0.5 },
	difficile: { label: 'Difficile', removeFrac: 0.58 },
};

const FULL = (n: number) => ((1 << (n + 1)) - 1) & ~1; // bits 1..n set

const boxIndex = (r: number, c: number, boxH: number, boxW: number, n: number) =>
	Math.floor(r / boxH) * (n / boxW) + Math.floor(c / boxW);

interface Masks {
	row: number[];
	col: number[];
	box: number[];
}

function buildMasks(grid: Grid, n: number, boxH: number, boxW: number): Masks {
	const row = new Array(n).fill(0);
	const col = new Array(n).fill(0);
	const box = new Array(n).fill(0);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			const v = grid[r][c];
			if (v) {
				const bit = 1 << v;
				row[r] |= bit;
				col[c] |= bit;
				box[boxIndex(r, c, boxH, boxW, n)] |= bit;
			}
		}
	}
	return { row, col, box };
}

/** Find the empty cell with the fewest candidates (MRV). Returns null if full. */
function bestCell(
	grid: Grid,
	n: number,
	boxH: number,
	boxW: number,
	m: Masks,
): { r: number; c: number; cand: number; count: number } | null {
	let best: { r: number; c: number; cand: number; count: number } | null = null;
	const full = FULL(n);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (grid[r][c]) continue;
			const used = m.row[r] | m.col[c] | m.box[boxIndex(r, c, boxH, boxW, n)];
			const cand = full & ~used;
			let count = 0;
			for (let b = cand; b; b &= b - 1) count++;
			if (count === 0) return { r, c, cand: 0, count: 0 }; // dead end
			if (!best || count < best.count) {
				best = { r, c, cand, count };
				if (count === 1) return best;
			}
		}
	}
	return best;
}

const bitsToValues = (mask: number): number[] => {
	const out: number[] = [];
	for (let b = mask; b; b &= b - 1) out.push(31 - Math.clz32(b & -b));
	return out;
};

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Fill an empty grid with a random valid solution. */
function fillFull(n: number, boxH: number, boxW: number, rng: Rng): Grid {
	const grid: Grid = Array.from({ length: n }, () => new Array(n).fill(0));
	const m = buildMasks(grid, n, boxH, boxW);

	const place = (r: number, c: number, v: number, on: boolean) => {
		const bit = 1 << v;
		grid[r][c] = on ? v : 0;
		const b = boxIndex(r, c, boxH, boxW, n);
		if (on) { m.row[r] |= bit; m.col[c] |= bit; m.box[b] |= bit; }
		else { m.row[r] &= ~bit; m.col[c] &= ~bit; m.box[b] &= ~bit; }
	};

	const solve = (): boolean => {
		const cell = bestCell(grid, n, boxH, boxW, m);
		if (!cell) return true; // solved
		if (cell.count === 0) return false;
		for (const v of shuffle(bitsToValues(cell.cand), rng)) {
			place(cell.r, cell.c, v, true);
			if (solve()) return true;
			place(cell.r, cell.c, v, false);
		}
		return false;
	};

	solve();
	return grid;
}

/** Count solutions of a partial grid, stopping at `limit`. */
export function countSolutions(
	grid: Grid,
	n: number,
	boxH: number,
	boxW: number,
	limit = 2,
): number {
	const work: Grid = grid.map((row) => [...row]);
	const m = buildMasks(work, n, boxH, boxW);
	let count = 0;

	const place = (r: number, c: number, v: number, on: boolean) => {
		const bit = 1 << v;
		work[r][c] = on ? v : 0;
		const b = boxIndex(r, c, boxH, boxW, n);
		if (on) { m.row[r] |= bit; m.col[c] |= bit; m.box[b] |= bit; }
		else { m.row[r] &= ~bit; m.col[c] &= ~bit; m.box[b] &= ~bit; }
	};

	const dfs = () => {
		if (count >= limit) return;
		const cell = bestCell(work, n, boxH, boxW, m);
		if (!cell) { count++; return; }
		if (cell.count === 0) return;
		for (const v of bitsToValues(cell.cand)) {
			place(cell.r, cell.c, v, true);
			dfs();
			place(cell.r, cell.c, v, false);
			if (count >= limit) return;
		}
	};

	dfs();
	return count;
}

/**
 * Build a full grid then remove cells one by one, keeping a removal only
 * if the solution stays unique. `rng` enables seeded daily puzzles.
 */
export function generateSudoku(
	variant: Variant,
	diff: DiffLevel,
	rng: Rng = Math.random,
): SudokuPuzzle {
	const { size, boxH, boxW } = variant;
	const solution = fillFull(size, boxH, boxW, rng);
	const given: Grid = solution.map((row) => [...row]);

	const cells = shuffle(
		Array.from({ length: size * size }, (_, i): [number, number] => [
			Math.floor(i / size),
			i % size,
		]),
		rng,
	);

	const target = Math.round(size * size * diff.removeFrac);
	let removed = 0;
	for (const [r, c] of cells) {
		if (removed >= target) break;
		const keep = given[r][c];
		given[r][c] = 0;
		if (countSolutions(given, size, boxH, boxW, 2) === 1) {
			removed++;
		} else {
			given[r][c] = keep;
		}
	}

	return { size, boxH, boxW, given, solution };
}
