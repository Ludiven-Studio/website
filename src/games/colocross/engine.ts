/**
 * COLOCROSS — pure engine (no UI). A coloured picross/nonogram.
 * Each cell is empty (0) or one of K colours (1..K). Every row and column
 * carries an ordered list of blocks (length + colour). Same-colour blocks need
 * at least one empty cell between them; different-colour blocks may touch.
 *
 * Generation keeps only puzzles a human can solve by pure line deduction
 * (`lineSolve` fully determines the grid) — which also guarantees uniqueness.
 */

import type { Rng } from '../prng';

export interface Run {
	len: number;
	color: number; // 1..K
}

export interface ColocrossPuzzle {
	size: number;
	colors: number; // K
	rowClues: Run[][];
	colClues: Run[][];
	solution: number[][]; // 0 = empty, 1..K = colour
}

export interface DiffLevel {
	label: string;
	size: number;
	colors: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, colors: 3 },
	moyen: { label: 'Moyen', size: 6, colors: 3 },
	difficile: { label: 'Difficile', size: 8, colors: 4 },
};

/** Maximal same-colour blocks of a line (different adjacent colours split). */
export function lineRuns(line: number[]): Run[] {
	const runs: Run[] = [];
	let i = 0;
	while (i < line.length) {
		const color = line[i];
		if (color === 0) { i++; continue; }
		let len = 0;
		while (i < line.length && line[i] === color) { len++; i++; }
		runs.push({ len, color });
	}
	return runs;
}

/** Every valid full colouring of one line consistent with its clue. */
export function lineColorings(clue: Run[], size: number): number[][] {
	const res: number[][] = [];
	const cur = new Array(size).fill(0);
	const place = (bi: number, pos: number): void => {
		if (bi === clue.length) {
			res.push([...cur]);
			return;
		}
		const block = clue[bi];
		for (let start = pos; start + block.len <= size; start++) {
			for (let i = start; i < start + block.len; i++) cur[i] = block.color;
			const next = start + block.len;
			const sameNext = bi + 1 < clue.length && clue[bi + 1].color === block.color;
			place(bi + 1, next + (sameNext ? 1 : 0));
			for (let i = start; i < start + block.len; i++) cur[i] = 0;
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

/** Project the colourings compatible with `cand` onto per-cell candidate masks. */
function refine(colorings: number[][], size: number, cand: number[]): { changed: boolean; cand: number[] } {
	let proj = new Array(size).fill(0);
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

/**
 * Solve by iterated line deduction. Returns the fully-determined grid, or null
 * if the clues are not enough to deduce every cell without guessing.
 */
export function lineSolve(
	rowClues: Run[][],
	colClues: Run[][],
	size: number,
	colors: number,
): number[][] | null {
	const full = (1 << (colors + 1)) - 1;
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
	rowClues: Run[][],
	colClues: Run[][],
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

export function generateColocross(diff: DiffLevel, rng: Rng = Math.random): ColocrossPuzzle {
	const { size, colors: K } = diff;

	for (let attempt = 0; attempt < 800; attempt++) {
		const sol = Array.from({ length: size }, () => new Array(size).fill(0));
		const used = new Set<number>();
		let filled = 0;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++)
				if (rng() < 0.55) {
					const color = 1 + Math.floor(rng() * K);
					sol[r][c] = color;
					used.add(color);
					filled++;
				}

		const ratio = filled / (size * size);
		if (ratio < 0.4 || ratio > 0.7 || used.size < K) continue;

		const rowClues = sol.map((row) => lineRuns(row));
		const colClues = Array.from({ length: size }, (_, c) => lineRuns(sol.map((row) => row[c])));

		// Keep only puzzles solvable by pure deduction (⇒ unique, no guessing).
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
