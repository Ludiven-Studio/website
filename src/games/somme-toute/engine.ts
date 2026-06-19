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

export interface HintResult {
	r: number;
	c: number;
	value: number;
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * Corrects a wrong entry first; then "last cell of a line/column", a value forced
 * by min/max bounds; finally an honest fallback. The returned value is always the
 * solution. Logic is sum-based (repeats allowed — this is not a Latin square).
 */
export function findHint(entries: Cell[][], game: Game): HintResult | null {
	const { puzzle, solution, rowT, colT, size, maxVal } = game;
	const editable = (r: number, c: number) => puzzle[r][c] == null;
	const val = (r: number, c: number): Cell =>
		puzzle[r][c] != null ? puzzle[r][c] : entries[r][c];
	const sol = (r: number, c: number): number => solution[r][c] as number; // always filled

	const rowCells = (r: number): [number, number][] =>
		Array.from({ length: size }, (_, c): [number, number] => [r, c]);
	const colCells = (c: number): [number, number][] =>
		Array.from({ length: size }, (_, r): [number, number] => [r, c]);

	// Sum of currently-placed values in a unit.
	const unitSum = (cells: [number, number][]): number =>
		cells.reduce((s, [r, c]) => s + (val(r, c) ?? 0), 0);

	// 1) Correction — a filled editable cell that does not match the solution.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (!editable(r, c) || entries[r][c] == null) continue;
			const x = entries[r][c]!;
			const y = sol(r, c);
			if (x === y) continue;
			// Mention which line's sum it already breaks (row full & off, then col).
			const rowFull = rowCells(r).every(([rr, cc]) => val(rr, cc) != null);
			const colFull = colCells(c).every(([rr, cc]) => val(rr, cc) != null);
			let where = '';
			if (rowFull && unitSum(rowCells(r)) !== rowT[r])
				where = ` (la somme de sa ligne ne tombe pas sur ${rowT[r]})`;
			else if (colFull && unitSum(colCells(c)) !== colT[c])
				where = ` (la somme de sa colonne ne tombe pas sur ${colT[c]})`;
			return {
				r,
				c,
				value: y,
				reason: `Cette valeur déséquilibre la grille${where} — la bonne valeur est ${y}.`,
			};
		}

	// 2) Last empty cell of a line or column: missing value = target − sum(others).
	const lastCell = (
		cells: [number, number][],
		target: number,
		label: string,
	): HintResult | null => {
		const empties = cells.filter(([r, c]) => editable(r, c) && val(r, c) == null);
		if (empties.length !== 1) return null;
		const [r, c] = empties[0];
		const y = target - unitSum(cells);
		if (y !== sol(r, c)) return null; // safety: only ever propose the solution
		return {
			r,
			c,
			value: y,
			reason: `Il manque exactement ${y} pour atteindre la somme ${target} de ${label}.`,
		};
	};
	for (let r = 0; r < size; r++) {
		const h = lastCell(rowCells(r), rowT[r], 'cette ligne');
		if (h) return h;
	}
	for (let c = 0; c < size; c++) {
		const h = lastCell(colCells(c), colT[c], 'cette colonne');
		if (h) return h;
	}

	// 3) Value forced by bounds: in a unit, the remaining sum and the min/max the
	// OTHER empty cells can absorb leave a single possible value for this cell.
	// For k empty cells summing to `rem`, a cell value v must satisfy
	// (k-1)*1 <= rem - v <= (k-1)*maxVal  →  rem-(k-1)*maxVal <= v <= rem-(k-1).
	// When that window is a single integer, every empty cell of the unit is pinned.
	const forcedByUnit = (
		cells: [number, number][],
		target: number,
		label: string,
	): HintResult | null => {
		const empties = cells.filter(([r, c]) => editable(r, c) && val(r, c) == null);
		if (empties.length < 2) return null; // 0/1 empties handled by earlier techniques
		const rem = target - unitSum(cells);
		const k = empties.length;
		const lo = Math.max(1, rem - (k - 1) * maxVal);
		const hi = Math.min(maxVal, rem - (k - 1));
		if (lo !== hi) return null; // not pinned by the bound alone
		const [r, c] = empties[0]; // window is identical for every empty cell of the unit
		if (lo !== sol(r, c)) return null;
		return {
			r,
			c,
			value: lo,
			reason: `Vu ce qu'il reste à placer dans ${label}, cette case ne peut être que ${lo}.`,
		};
	};
	for (let r = 0; r < size; r++) {
		const h = forcedByUnit(rowCells(r), rowT[r], 'sa ligne');
		if (h) return h;
	}
	for (let c = 0; c < size; c++) {
		const h = forcedByUnit(colCells(c), colT[c], 'sa colonne');
		if (h) return h;
	}

	// 4) Fallback — first empty editable cell.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++)
			if (editable(r, c) && val(r, c) == null)
				return {
					r,
					c,
					value: sol(r, c),
					reason: `Par déduction, cette case vaut ${sol(r, c)}.`,
				};

	return null;
}
