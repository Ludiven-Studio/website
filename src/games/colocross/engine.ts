/**
 * COLOCROSS — pure engine (no UI). A fully-coloured deduction grid.
 * Every cell is one of K colours (no background). For each line, the clue gives,
 * per colour, the ordered lengths of that colour's blocks — but NOT how the
 * colours interleave. The player only ever sees the active colour's numbers, so
 * the interleaving (where each block starts) is the deduction.
 *
 * Generation keeps only puzzles solvable by pure line deduction (`lineSolve`),
 * which also guarantees a unique solution.
 */

import type { Rng } from '../prng';

/** Per line: clue[color-1] = ordered block lengths of that colour. */
export type LineClue = number[][];

export interface ColocrossPuzzle {
	size: number;
	colors: number; // K
	rowClues: LineClue[];
	colClues: LineClue[];
	solution: number[][]; // every cell 1..K
}

export interface DiffLevel {
	label: string;
	size: number;
	colors: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, colors: 2 },
	moyen: { label: 'Moyen', size: 6, colors: 3 },
	difficile: { label: 'Difficile', size: 8, colors: 4 },
};

/** Clue of one fully-coloured line: ordered block lengths grouped by colour. */
export function lineClueOf(line: number[], colors: number): LineClue {
	const clue: number[][] = Array.from({ length: colors }, () => []);
	let i = 0;
	while (i < line.length) {
		const c = line[i];
		let len = 0;
		while (i < line.length && line[i] === c) { len++; i++; }
		if (c >= 1 && c <= colors) clue[c - 1].push(len);
	}
	return clue;
}

/** Every full colouring obtained by interleaving the per-colour block runs
    (never two same-colour blocks adjacent). */
export function lineColorings(clue: LineClue, size: number): number[][] {
	const res: number[][] = [];
	const ptr = clue.map(() => 0);
	const total = clue.reduce((s, arr) => s + arr.length, 0);
	const cur: number[] = [];

	const place = (lastColor: number, placed: number): void => {
		if (placed === total) {
			if (cur.length === size) res.push([...cur]);
			return;
		}
		for (let ci = 0; ci < clue.length; ci++) {
			const color = ci + 1;
			if (color === lastColor || ptr[ci] >= clue[ci].length) continue;
			const len = clue[ci][ptr[ci]];
			if (cur.length + len > size) continue;
			ptr[ci]++;
			for (let k = 0; k < len; k++) cur.push(color);
			place(color, placed + 1);
			for (let k = 0; k < len; k++) cur.pop();
			ptr[ci]--;
		}
	};
	place(0, 0);
	return res;
}

const bitIndex = (m: number): number => {
	let v = 0;
	while (m > 1) { m >>= 1; v++; }
	return v;
};

function refine(colorings: number[][], size: number, cand: number[]): { changed: boolean; cand: number[] } {
	const proj = new Array(size).fill(0);
	for (const col of colorings) {
		let ok = true;
		for (let i = 0; i < size; i++) if (!((cand[i] >> col[i]) & 1)) { ok = false; break; }
		if (!ok) continue;
		for (let i = 0; i < size; i++) proj[i] |= 1 << col[i];
	}
	const out = cand.slice();
	let changed = false;
	for (let i = 0; i < size; i++) {
		const nv = cand[i] & proj[i];
		if (nv !== cand[i]) changed = true;
		out[i] = nv;
	}
	return { changed, cand: out };
}

/** Iterated line deduction. Returns the fully-determined grid, or null if the
    clues are not enough to deduce every cell without guessing. */
export function lineSolve(
	rowClues: LineClue[],
	colClues: LineClue[],
	size: number,
	colors: number,
): number[][] | null {
	const full = ((1 << (colors + 1)) - 1) & ~1; // colours 1..K (bit 0 unused)
	const cand: number[][] = Array.from({ length: size }, () => new Array(size).fill(full));
	const rowOpts = rowClues.map((cl) => lineColorings(cl, size));
	const colOpts = colClues.map((cl) => lineColorings(cl, size));

	let changed = true;
	while (changed) {
		changed = false;
		for (let r = 0; r < size; r++) {
			const res = refine(rowOpts[r], size, cand[r]);
			if (res.changed) { cand[r] = res.cand; changed = true; }
		}
		for (let c = 0; c < size; c++) {
			const colCand = cand.map((row) => row[c]);
			const res = refine(colOpts[c], size, colCand);
			if (res.changed) {
				for (let r = 0; r < size; r++) cand[r][c] = res.cand[r];
				changed = true;
			}
		}
	}

	const grid = Array.from({ length: size }, () => new Array(size).fill(-1));
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const m = cand[r][c];
			if (m === 0 || (m & (m - 1)) !== 0) return null; // empty or not a singleton
			grid[r][c] = bitIndex(m);
		}
	return grid;
}

/** Count solutions consistent with the clues, stopping at `limit` (uniqueness). */
export function countSolutions(
	rowClues: LineClue[],
	colClues: LineClue[],
	size: number,
	limit = 2,
): number {
	const rowOpts = rowClues.map((cl) => lineColorings(cl, size));
	const colOpts = colClues.map((cl) => lineColorings(cl, size));
	const grid = Array.from({ length: size }, () => new Array(size).fill(0));
	let count = 0;

	const colPrefixOK = (rowsPlaced: number): boolean => {
		for (let c = 0; c < size; c++) {
			const ok = colOpts[c].some((col) => {
				for (let r = 0; r < rowsPlaced; r++) if (col[r] !== grid[r][c]) return false;
				return true;
			});
			if (!ok) return false;
		}
		return true;
	};

	const dfs = (r: number): void => {
		if (count >= limit) return;
		if (r === size) { count++; return; }
		for (const row of rowOpts[r]) {
			for (let c = 0; c < size; c++) grid[r][c] = row[c];
			if (colPrefixOK(r + 1)) dfs(r + 1);
			if (count >= limit) return;
		}
	};
	dfs(0);
	return count;
}

const clues = (grid: number[][], size: number, K: number): { rowClues: LineClue[]; colClues: LineClue[] } => ({
	rowClues: grid.map((row) => lineClueOf(row, K)),
	colClues: Array.from({ length: size }, (_, c) => lineClueOf(grid.map((row) => row[c]), K)),
});

export function generateColocross(diff: DiffLevel, rng: Rng = Math.random): ColocrossPuzzle {
	const { size, colors: K } = diff;

	for (let attempt = 0; attempt < 4000; attempt++) {
		const sol = Array.from({ length: size }, () =>
			Array.from({ length: size }, () => 1 + Math.floor(rng() * K)),
		);

		// Every colour used, and no line of a single colour (too trivial).
		const used = new Set(sol.flat());
		if (used.size < K) continue;
		let uniform = false;
		for (let r = 0; r < size && !uniform; r++) if (sol[r].every((v) => v === sol[r][0])) uniform = true;
		for (let c = 0; c < size && !uniform; c++) if (sol.every((row) => row[c] === sol[0][c])) uniform = true;
		if (uniform) continue;

		const { rowClues, colClues } = clues(sol, size, K);
		const solved = lineSolve(rowClues, colClues, size, K);
		if (!solved) continue;
		let eq = true;
		for (let r = 0; r < size && eq; r++)
			for (let c = 0; c < size; c++) if (solved[r][c] !== sol[r][c]) { eq = false; break; }
		if (!eq) continue;

		return { size, colors: K, rowClues, colClues, solution: sol };
	}

	throw new Error('Colocross: failed to generate a puzzle');
}
