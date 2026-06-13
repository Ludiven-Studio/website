/**
 * CALCUDOKU (KenKen) — pure engine (no UI).
 * n×n Latin square (1..n once per row/col), partitioned into cages.
 * Each cage has a target value and an operation. Generation guarantees a
 * unique solution.
 */

import type { Rng } from '../prng';

export type Op = '+' | '-' | '*' | '/' | '=';

export interface Cage {
	cells: [number, number][];
	op: Op;
	target: number;
}

export interface DiffLevel {
	label: string;
	size: number;
	maxCage: number; // largest cage size
}

export interface CalcudokuPuzzle {
	size: number;
	solution: number[][];
	cages: Cage[];
	cageOf: number[][]; // cage index per cell
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 4, maxCage: 3 },
	moyen: { label: 'Moyen', size: 5, maxCage: 4 },
	difficile: { label: 'Difficile', size: 6, maxCage: 4 },
};

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Random Latin square via backtracking. */
function latinSquare(n: number, rng: Rng): number[][] {
	const g: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const rowMask = new Array(n).fill(0);
	const colMask = new Array(n).fill(0);

	const solve = (idx: number): boolean => {
		if (idx === n * n) return true;
		const r = Math.floor(idx / n);
		const c = idx % n;
		for (const v of shuffle(
			Array.from({ length: n }, (_, i) => i + 1),
			rng,
		)) {
			const bit = 1 << v;
			if (rowMask[r] & bit || colMask[c] & bit) continue;
			g[r][c] = v;
			rowMask[r] |= bit;
			colMask[c] |= bit;
			if (solve(idx + 1)) return true;
			g[r][c] = 0;
			rowMask[r] &= ~bit;
			colMask[c] &= ~bit;
		}
		return false;
	};

	solve(0);
	return g;
}

/** Partition the grid into connected cages of size 1..maxCage. */
function makeCages(n: number, maxCage: number, rng: Rng): number[][] {
	const cageOf: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	const order = shuffle(
		Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
		rng,
	);
	let id = 0;
	for (const [r, c] of order) {
		if (cageOf[r][c] !== -1) continue;
		cageOf[r][c] = id;
		let count = 1;
		const target = 1 + Math.floor(rng() * maxCage);
		// Grow the cage by absorbing random unassigned orthogonal neighbours.
		while (count < target) {
			const frontier: [number, number][] = [];
			for (let rr = 0; rr < n; rr++)
				for (let cc = 0; cc < n; cc++)
					if (cageOf[rr][cc] === id) {
						for (const [nr, nc] of [
							[rr - 1, cc],
							[rr + 1, cc],
							[rr, cc - 1],
							[rr, cc + 1],
						] as [number, number][]) {
							if (nr >= 0 && nr < n && nc >= 0 && nc < n && cageOf[nr][nc] === -1)
								frontier.push([nr, nc]);
						}
					}
			if (!frontier.length) break;
			const [gr, gc] = frontier[Math.floor(rng() * frontier.length)];
			cageOf[gr][gc] = id;
			count++;
		}
		id++;
	}
	return cageOf;
}

function buildCages(solution: number[][], cageOf: number[][], n: number, rng: Rng): Cage[] {
	const groups = new Map<number, [number, number][]>();
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const id = cageOf[r][c];
			if (!groups.has(id)) groups.set(id, []);
			groups.get(id)!.push([r, c]);
		}

	const cages: Cage[] = [];
	for (const cells of groups.values()) {
		const vals = cells.map(([r, c]) => solution[r][c]);
		if (cells.length === 1) {
			cages.push({ cells, op: '=', target: vals[0] });
			continue;
		}
		if (cells.length === 2) {
			const [a, b] = vals;
			const hi = Math.max(a, b);
			const lo = Math.min(a, b);
			const choices: { op: Op; target: number }[] = [
				{ op: '+', target: a + b },
				{ op: '*', target: a * b },
				{ op: '-', target: hi - lo },
			];
			if (hi % lo === 0) choices.push({ op: '/', target: hi / lo });
			const pick = choices[Math.floor(rng() * choices.length)];
			cages.push({ cells, op: pick.op, target: pick.target });
			continue;
		}
		// size >= 3 : sum or product
		const op: Op = rng() < 0.5 ? '+' : '*';
		const target = op === '+' ? vals.reduce((x, y) => x + y, 0) : vals.reduce((x, y) => x * y, 1);
		cages.push({ cells, op, target });
	}
	return cages;
}

/** Count solutions consistent with the Latin + cage constraints (stop at limit). */
export function countSolutions(cages: Cage[], n: number, limit = 2): number {
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const rowMask = new Array(n).fill(0);
	const colMask = new Array(n).fill(0);
	const cageOf: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	cages.forEach((cage, i) => cage.cells.forEach(([r, c]) => (cageOf[r][c] = i)));

	const cageOk = (ci: number): boolean => {
		const cage = cages[ci];
		const vals: number[] = [];
		let filled = 0;
		for (const [r, c] of cage.cells) {
			if (grid[r][c]) {
				vals.push(grid[r][c]);
				filled++;
			}
		}
		const full = filled === cage.cells.length;
		switch (cage.op) {
			case '=':
				return vals[0] === cage.target;
			case '+': {
				const s = vals.reduce((a, b) => a + b, 0);
				return full ? s === cage.target : s < cage.target;
			}
			case '*': {
				const p = vals.reduce((a, b) => a * b, 1);
				return full ? p === cage.target : p <= cage.target && cage.target % p === 0;
			}
			case '-':
				return full ? Math.abs(vals[0] - vals[1]) === cage.target : true;
			case '/': {
				if (!full) return true;
				const hi = Math.max(vals[0], vals[1]);
				const lo = Math.min(vals[0], vals[1]);
				return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
			}
		}
	};

	let count = 0;
	const solve = (idx: number) => {
		if (count >= limit) return;
		if (idx === n * n) {
			count++;
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;
		for (let v = 1; v <= n; v++) {
			const bit = 1 << v;
			if (rowMask[r] & bit || colMask[c] & bit) continue;
			grid[r][c] = v;
			rowMask[r] |= bit;
			colMask[c] |= bit;
			if (cageOk(cageOf[r][c])) solve(idx + 1);
			grid[r][c] = 0;
			rowMask[r] &= ~bit;
			colMask[c] &= ~bit;
			if (count >= limit) return;
		}
	};

	solve(0);
	return count;
}

/** Generate a uniquely-solvable Calcudoku puzzle. */
export function generateCalcudoku(diff: DiffLevel, rng: Rng = Math.random): CalcudokuPuzzle {
	const { size, maxCage } = diff;
	for (let attempt = 0; attempt < 80; attempt++) {
		const solution = latinSquare(size, rng);
		const cageOf = makeCages(size, maxCage, rng);
		const cages = buildCages(solution, cageOf, size, rng);
		if (countSolutions(cages, size, 2) === 1) {
			return { size, solution, cages, cageOf };
		}
	}
	// Fallback: all single-cell cages -> trivially unique.
	const solution = latinSquare(size, rng);
	const cageOf: number[][] = Array.from({ length: size }, (_, r) =>
		Array.from({ length: size }, (_, c) => r * size + c),
	);
	const cages = buildCages(solution, cageOf, size, rng);
	return { size, solution, cages, cageOf };
}
