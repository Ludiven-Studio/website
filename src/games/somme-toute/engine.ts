/**
 * SOMME TOUTE — pure engine (no UI).
 * Fill empty cells so every row and column reaches its target sum.
 * Generator guarantees a unique solution by construction.
 */

import type { Rng } from '../prng';

export type Cell = number | null;
export type Grid = Cell[][];

export interface Diff {
	label: string;
	size: number;
	maxVal: number;
	holes: number;
}

export interface Game {
	puzzle: Grid; // given cells, null = to fill
	solution: Grid;
	rowT: number[]; // target sum per row
	colT: number[]; // target sum per col
	size: number;
	maxVal: number;
}

export const DIFFS: Record<string, Diff> = {
	facile: { label: 'Facile', size: 4, maxVal: 5, holes: 6 },
	moyen: { label: 'Moyen', size: 5, maxVal: 7, holes: 9 },
	difficile: { label: 'Difficile', size: 6, maxVal: 9, holes: 13 },
};

const randInt = (rng: Rng, n: number) => Math.floor(rng() * n);

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = randInt(rng, i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Count solutions of a partial grid, stopping at 2 (uniqueness check). */
export function countSolutions(
	puzzle: Grid,
	size: number,
	maxVal: number,
	rowT: number[],
	colT: number[],
): number {
	const rowRem = [...rowT];
	const colRem = [...colT];
	const rowCnt = new Array(size).fill(0);
	const colCnt = new Array(size).fill(0);
	const empties: [number, number][] = [];

	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			const v = puzzle[r][c];
			if (v == null) {
				empties.push([r, c]);
				rowCnt[r]++;
				colCnt[c]++;
			} else {
				rowRem[r] -= v;
				colRem[c] -= v;
			}
		}
	}

	let count = 0;
	const dfs = (i: number): void => {
		if (count >= 2) return;
		if (i === empties.length) {
			count++;
			return;
		}
		const [r, c] = empties[i];
		for (let v = 1; v <= maxVal; v++) {
			const rr = rowRem[r] - v;
			const cr = colRem[c] - v;
			const rn = rowCnt[r] - 1;
			const cn = colCnt[c] - 1;
			// Remaining cells in the row/col must still be able to reach
			// the remaining sum with values in 1..maxVal.
			if (rr < rn || rr > rn * maxVal) continue;
			if (cr < cn || cr > cn * maxVal) continue;
			rowRem[r] = rr; colRem[c] = cr; rowCnt[r] = rn; colCnt[c] = cn;
			dfs(i + 1);
			rowRem[r] = rr + v; colRem[c] = cr + v; rowCnt[r] = rn + 1; colCnt[c] = cn + 1;
		}
	};
	dfs(0);
	return count;
}

/**
 * Build a full grid, compute targets, then remove cells one by one,
 * keeping each removal only if the solution stays unique.
 * `rng` lets callers inject a seeded PRNG (daily challenge) or Math.random (training).
 */
export function generatePuzzle(diff: Diff, rng: Rng = Math.random): Game {
	const { size, maxVal, holes } = diff;
	const solution: number[][] = Array.from({ length: size }, () =>
		Array.from({ length: size }, () => 1 + randInt(rng, maxVal)),
	);
	const rowT = solution.map((row) => row.reduce((a, b) => a + b, 0));
	const colT = Array.from({ length: size }, (_, c) =>
		solution.reduce((a, row) => a + row[c], 0),
	);

	const puzzle: Grid = solution.map((row) => [...row]);
	const order = shuffle(
		Array.from({ length: size * size }, (_, i): [number, number] => [
			Math.floor(i / size),
			i % size,
		]),
		rng,
	);

	let removed = 0;
	for (const [r, c] of order) {
		if (removed >= holes) break;
		const keep = puzzle[r][c];
		puzzle[r][c] = null;
		if (countSolutions(puzzle, size, maxVal, rowT, colT) === 1) {
			removed++;
		} else {
			puzzle[r][c] = keep;
		}
	}
	return { puzzle, solution, rowT, colT, size, maxVal };
}
