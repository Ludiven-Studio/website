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

export interface HintResult {
	r: number;
	c: number;
	value: number;
	reason: string;
}

const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' };

/** Does a fully-filled cage hit its target exactly? */
function cageComplete(op: Op, target: number, vals: number[]): boolean {
	switch (op) {
		case '=':
			return vals[0] === target;
		case '+':
			return vals.reduce((a, b) => a + b, 0) === target;
		case '*':
			return vals.reduce((a, b) => a * b, 1) === target;
		case '-':
			return Math.abs(vals[0] - vals[1]) === target;
		case '/': {
			const hi = Math.max(...vals);
			const lo = Math.min(...vals);
			return lo !== 0 && hi % lo === 0 && hi / lo === target;
		}
	}
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * Order: correction → forced cage → last cell in a row/col → naked single → hidden
 * single → honest fallback. The returned value is always the solution.
 *
 * Calcudoku has no `given` grid: single-cell "=" cages are the only fixed cells.
 */
export function findHint(
	entries: (number | null)[][],
	puzzle: CalcudokuPuzzle,
): HintResult | null {
	const { size: n, solution, cages, cageOf } = puzzle;

	// Fixed cells = the single-cell "=" cages (shown as givens in the UI).
	const given: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
	for (const cage of cages)
		if (cage.op === '=') {
			const [r, c] = cage.cells[0];
			given[r][c] = cage.target;
		}

	const editable = (r: number, c: number) => given[r][c] == null;
	const val = (r: number, c: number): number | null =>
		given[r][c] != null ? given[r][c] : entries[r][c];

	const rowName = (kind: 'row' | 'col') => (kind === 'row' ? 'sa ligne' : 'sa colonne');
	const rowNameTop = (kind: 'row' | 'col') => (kind === 'row' ? 'cette ligne' : 'cette colonne');

	// 1) Correction — a wrong filled (editable) cell.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!editable(r, c) || entries[r][c] == null) continue;
			const x = entries[r][c]!;
			if (x === solution[r][c]) continue;
			let dup: 'row' | 'col' | null = null;
			for (let cc = 0; cc < n; cc++) if (cc !== c && val(r, cc) === x) dup = 'row';
			if (!dup) for (let rr = 0; rr < n; rr++) if (rr !== r && val(rr, c) === x) dup = 'col';
			const reason = dup
				? `Le ${x} ici fait doublon dans ${rowName(dup)} — la bonne valeur est ${solution[r][c]}.`
				: `Le ${x} ne convient pas ici — la valeur correcte est ${solution[r][c]}.`;
			return { r, c, value: solution[r][c], reason };
		}

	// Latin candidates of an empty cell: 1..n minus values present in its row/col.
	const candidates = (r: number, c: number): number[] => {
		const used = new Set<number>();
		for (let cc = 0; cc < n; cc++) {
			const v = val(r, cc);
			if (v != null) used.add(v);
		}
		for (let rr = 0; rr < n; rr++) {
			const v = val(rr, c);
			if (v != null) used.add(v);
		}
		const out: number[] = [];
		for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v);
		return out;
	};

	/**
	 * Values the target cell can take while keeping its cage satisfiable.
	 * Backtracks over the cage's empty cells (Latin-consistent with the board and
	 * with each other); a candidate is kept iff at least one full assignment of the
	 * cage's empty cells hits the cage target exactly.
	 */
	const cageAllows = (tr: number, tc: number): Set<number> => {
		const cage = cages[cageOf[tr][tc]];
		const fixed: number[] = []; // already-known cage values
		const empties: [number, number][] = [];
		for (const [r, c] of cage.cells) {
			const v = val(r, c);
			if (v != null) fixed.push(v);
			else empties.push([r, c]);
		}
		const ti = empties.findIndex(([r, c]) => r === tr && c === tc);
		const ok = new Set<number>();
		const assigned = new Array(empties.length).fill(0);

		const dfs = (i: number) => {
			if (i === empties.length) {
				if (cageComplete(cage.op, cage.target, [...fixed, ...assigned]))
					ok.add(assigned[ti]);
				return;
			}
			const [r, c] = empties[i];
			for (const v of candidates(r, c)) {
				// keep Latin-consistency among the empty cage cells we are filling
				let clash = false;
				for (let j = 0; j < i; j++) {
					const [rr, cc] = empties[j];
					if ((rr === r || cc === c) && assigned[j] === v) {
						clash = true;
						break;
					}
				}
				if (clash) continue;
				assigned[i] = v;
				dfs(i + 1);
			}
		};
		dfs(0);
		return ok;
	};

	// 2) Forced cage — an empty cell whose cage allows only one value here.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!editable(r, c) || val(r, c) != null) continue;
			const cage = cages[cageOf[r][c]];
			if (cage.op === '=') continue; // already a given
			const allowed = cageAllows(r, c);
			if (allowed.size === 1) {
				const y = [...allowed][0];
				if (y !== solution[r][c]) continue; // safety: never propose a wrong value
				return {
					r,
					c,
					value: y,
					reason: `La cage ${cage.target}${OP_SYMBOL[cage.op]} n'autorise que le ${y} ici.`,
				};
			}
		}

	// 3) Last empty cell of a row / column.
	for (const kind of ['row', 'col'] as const)
		for (let i = 0; i < n; i++) {
			const empties: [number, number][] = [];
			for (let j = 0; j < n; j++) {
				const [r, c] = kind === 'row' ? [i, j] : [j, i];
				if (editable(r, c) && val(r, c) == null) empties.push([r, c]);
			}
			if (empties.length !== 1) continue;
			const [r, c] = empties[0];
			const y = solution[r][c];
			return {
				r,
				c,
				value: y,
				reason: `${rowNameTop(kind)} n'a plus qu'une case libre : il y manque le ${y}.`,
			};
		}

	// 4) Naked single — only one Latin candidate.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!editable(r, c) || val(r, c) != null) continue;
			const cand = candidates(r, c);
			if (cand.length === 1 && cand[0] === solution[r][c])
				return {
					r,
					c,
					value: cand[0],
					reason: `Sur sa ligne et sa colonne, cette case n'accepte que le ${cand[0]}.`,
				};
		}

	// 5) Hidden single — a value fits only one empty cell of a row / column.
	for (const kind of ['row', 'col'] as const)
		for (let i = 0; i < n; i++) {
			const cells: [number, number][] = [];
			for (let j = 0; j < n; j++) {
				const [r, c] = kind === 'row' ? [i, j] : [j, i];
				if (editable(r, c) && val(r, c) == null) cells.push([r, c]);
			}
			for (let v = 1; v <= n; v++) {
				const fit = cells.filter(([r, c]) => candidates(r, c).includes(v));
				if (fit.length === 1 && solution[fit[0][0]][fit[0][1]] === v)
					return {
						r: fit[0][0],
						c: fit[0][1],
						value: v,
						reason: `Le ${v} ne peut se placer que dans cette case de ${rowName(kind)}.`,
					};
			}
		}

	// 6) Fallback — first empty cell.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (editable(r, c) && val(r, c) == null)
				return {
					r,
					c,
					value: solution[r][c],
					reason: `Par élimination, cette case vaut ${solution[r][c]}.`,
				};

	return null;
}
