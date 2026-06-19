/**
 * ROND & CARRÉ (façon LinkedIn "Tango") — pure engine (no UI).
 * Fill a 6×6 grid with ● (1) and ■ (2) so that:
 *  - each row and column has as many ● as ■ (n/2 each),
 *  - never 3 identical in a row/column,
 *  - "=" / "≠" edge constraints between neighbours are respected.
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export type Cell = 0 | 1 | 2; // empty | rond | carré

export interface Constraint {
	a: [number, number];
	b: [number, number];
	eq: boolean; // true = same symbol, false = different
}

export interface RondCarrePuzzle {
	size: number;
	given: Cell[][]; // 0 = to fill
	solution: Cell[][];
	constraints: Constraint[];
}

export interface DiffLevel {
	label: string;
	extraGivens: number; // revealed beyond the minimal set (more = easier)
}

export const SIZE = 6;

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', extraGivens: 8 },
	moyen: { label: 'Moyen', extraGivens: 4 },
	difficile: { label: 'Difficile', extraGivens: 0 },
};

const edgeId = (a: number, b: number, total: number) =>
	(a < b ? a : b) * total + (a < b ? b : a);

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Random full valid grid (balanced rows/cols, no 3-in-a-row). */
function randomFullGrid(n: number, rng: Rng): Cell[][] {
	const half = n / 2;
	const g: Cell[][] = Array.from({ length: n }, () => new Array(n).fill(0) as Cell[]);
	const rowCnt = Array.from({ length: n }, () => [0, 0, 0]);
	const colCnt = Array.from({ length: n }, () => [0, 0, 0]);

	const place = (idx: number): boolean => {
		if (idx === n * n) return true;
		const r = Math.floor(idx / n);
		const c = idx % n;
		for (const v of shuffle([1, 2] as Cell[], rng)) {
			if (rowCnt[r][v] >= half || colCnt[c][v] >= half) continue;
			if (c >= 2 && g[r][c - 1] === v && g[r][c - 2] === v) continue;
			if (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v) continue;
			g[r][c] = v;
			rowCnt[r][v]++;
			colCnt[c][v]++;
			if (place(idx + 1)) return true;
			g[r][c] = 0;
			rowCnt[r][v]--;
			colCnt[c][v]--;
		}
		return false;
	};

	place(0);
	return g;
}

/** Count solutions of a puzzle (given + constraints), stopping at `limit`. */
export function countSolutions(
	given: Cell[][],
	constraints: Constraint[],
	n: number,
	limit = 2,
): number {
	const total = n * n;
	const half = n / 2;
	const cons = new Map<number, boolean>();
	for (const { a, b, eq } of constraints)
		cons.set(edgeId(a[0] * n + a[1], b[0] * n + b[1], total), eq);

	const g: Cell[][] = given.map((row) => [...row]);
	const rowCnt = Array.from({ length: n }, () => [0, 0, 0]);
	const colCnt = Array.from({ length: n }, () => [0, 0, 0]);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (g[r][c]) {
				rowCnt[r][g[r][c]]++;
				colCnt[c][g[r][c]]++;
			}

	// No-3 + "=" / "≠" consistency vs the already-placed left/up neighbours.
	const consistent = (r: number, c: number, v: Cell): boolean => {
		if (c >= 2 && g[r][c - 1] === v && g[r][c - 2] === v) return false;
		if (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v) return false;
		if (c > 0 && g[r][c - 1] !== 0) {
			const e = cons.get(edgeId(r * n + c, r * n + c - 1, total));
			if (e !== undefined && e !== (g[r][c - 1] === v)) return false;
		}
		if (r > 0 && g[r - 1][c] !== 0) {
			const e = cons.get(edgeId(r * n + c, (r - 1) * n + c, total));
			if (e !== undefined && e !== (g[r - 1][c] === v)) return false;
		}
		return true;
	};

	let count = 0;
	const solve = (idx: number) => {
		if (count >= limit) return;
		if (idx === total) {
			count++;
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;
		if (given[r][c] !== 0) {
			// Fixed cell: still verify it against its placed neighbours.
			if (consistent(r, c, g[r][c])) solve(idx + 1);
			return;
		}
		for (const v of [1, 2] as Cell[]) {
			if (rowCnt[r][v] >= half || colCnt[c][v] >= half) continue;
			if (!consistent(r, c, v)) continue;
			g[r][c] = v;
			rowCnt[r][v]++;
			colCnt[c][v]++;
			solve(idx + 1);
			g[r][c] = 0;
			rowCnt[r][v]--;
			colCnt[c][v]--;
			if (count >= limit) return;
		}
	};
	solve(0);
	return count;
}

/** Generate a uniquely-solvable puzzle. */
export function generateRondCarre(diff: DiffLevel, rng: Rng = Math.random): RondCarrePuzzle {
	const n = SIZE;
	const solution = randomFullGrid(n, rng);

	// Every adjacent edge as a candidate constraint (derived from the solution).
	const allCons: Constraint[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (c + 1 < n)
				allCons.push({ a: [r, c], b: [r, c + 1], eq: solution[r][c] === solution[r][c + 1] });
			if (r + 1 < n)
				allCons.push({ a: [r, c], b: [r + 1, c], eq: solution[r][c] === solution[r + 1][c] });
		}

	// Start fully revealed (trivially unique), then strip clues while unique —
	// givens first (Tango feel: few givens, several constraints), then constraints.
	const given: Cell[][] = solution.map((row) => [...row]);
	const consActive = new Array(allCons.length).fill(true);
	const activeCons = () => allCons.filter((_, i) => consActive[i]);

	const cells = shuffle(
		Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
		rng,
	);
	for (const [r, c] of cells) {
		const keep = given[r][c];
		given[r][c] = 0;
		if (countSolutions(given, activeCons(), n, 2) !== 1) given[r][c] = keep;
	}
	for (const i of shuffle(Array.from({ length: allCons.length }, (_, j) => j), rng)) {
		consActive[i] = false;
		if (countSolutions(given, activeCons(), n, 2) !== 1) consActive[i] = true;
	}

	// Easier levels: reveal extra givens (adding clues never breaks uniqueness).
	const empties = shuffle(
		cells.filter(([r, c]) => given[r][c] === 0),
		rng,
	);
	for (let i = 0; i < diff.extraGivens && i < empties.length; i++) {
		const [r, c] = empties[i];
		given[r][c] = solution[r][c];
	}

	return { size: n, given, solution, constraints: activeCons() };
}

export interface HintResult {
	r: number;
	c: number;
	value: Cell; // 1 = rond ●, 2 = carré ■
	reason: string;
}

const SYM = (v: Cell) => (v === 1 ? '●' : '■');
const OTHER = (v: Cell): Cell => (v === 1 ? 2 : 1);

/**
 * Find the next logically-deducible cell and explain the technique (French).
 * `marks` is the player grid (0 empty / 1 rond / 2 carré). Corrects a wrong cell
 * first; then = / ≠ edge constraints, the no-3-in-a-row rule, row/column balance,
 * and an honest fallback. The returned value always matches the solution.
 */
export function findHint(marks: Cell[][], puzzle: RondCarrePuzzle): HintResult | null {
	const { size: n, given, solution } = puzzle;
	const half = n / 2;
	const editable = (r: number, c: number) => given[r][c] === 0;
	const v = (r: number, c: number): Cell =>
		r < 0 || r >= n || c < 0 || c >= n ? 0 : given[r][c] !== 0 ? given[r][c] : marks[r][c];

	// 1) Correction — a filled editable cell that disagrees with the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!editable(r, c) || marks[r][c] === 0) continue;
			if (marks[r][c] === solution[r][c]) continue;
			return {
				r,
				c,
				value: solution[r][c],
				reason: `Le ${SYM(marks[r][c])} ne convient pas ici — c'est un ${SYM(solution[r][c])}.`,
			};
		}

	// 2) = / ≠ constraint linking an empty cell to a decided neighbour.
	for (const { a, b, eq } of puzzle.constraints) {
		for (const [p, q] of [
			[a, b],
			[b, a],
		] as [[number, number], [number, number]][]) {
			const [pr, pc] = p;
			const [qr, qc] = q;
			if (editable(pr, pc) && v(pr, pc) === 0 && v(qr, qc) !== 0) {
				const want: Cell = eq ? v(qr, qc) : OTHER(v(qr, qc));
				if (want !== solution[pr][pc]) continue;
				return {
					r: pr,
					c: pc,
					value: want,
					reason: eq
						? `Le signe = relie cette case à sa voisine : même forme, ${SYM(want)}.`
						: `Le signe ≠ : cette case prend la forme opposée à sa voisine, ${SYM(want)}.`,
				};
			}
		}
	}

	// 3) No three identical in a row/column.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!editable(r, c) || v(r, c) !== 0) continue;
			for (const bad of [1, 2] as Cell[]) {
				const triple =
					(v(r, c - 1) === bad && v(r, c - 2) === bad) ||
					(v(r, c + 1) === bad && v(r, c + 2) === bad) ||
					(v(r, c - 1) === bad && v(r, c + 1) === bad) ||
					(v(r - 1, c) === bad && v(r - 2, c) === bad) ||
					(v(r + 1, c) === bad && v(r + 2, c) === bad) ||
					(v(r - 1, c) === bad && v(r + 1, c) === bad);
				if (triple && OTHER(bad) === solution[r][c])
					return {
						r,
						c,
						value: OTHER(bad),
						reason: `Jamais trois ${SYM(bad)} d'affilée : cette case est donc un ${SYM(OTHER(bad))}.`,
					};
			}
		}

	// 4) Row/column balance — a line that already has n/2 of one symbol.
	const lineHint = (cells: [number, number][], label: string): HintResult | null => {
		const cnt: Record<number, number> = { 1: 0, 2: 0 };
		for (const [r, c] of cells) {
			const x = v(r, c);
			if (x !== 0) cnt[x]++;
		}
		for (const full of [1, 2] as Cell[]) {
			if (cnt[full] !== half) continue;
			for (const [r, c] of cells)
				if (editable(r, c) && v(r, c) === 0 && OTHER(full) === solution[r][c])
					return {
						r,
						c,
						value: OTHER(full),
						reason: `${label} a déjà ses ${half} ${SYM(full)} → les autres cases sont des ${SYM(OTHER(full))}.`,
					};
		}
		return null;
	};
	for (let r = 0; r < n; r++) {
		const h = lineHint(Array.from({ length: n }, (_, c): [number, number] => [r, c]), 'Cette ligne');
		if (h) return h;
	}
	for (let c = 0; c < n; c++) {
		const h = lineHint(Array.from({ length: n }, (_, r): [number, number] => [r, c]), 'Cette colonne');
		if (h) return h;
	}

	// 5) Fallback.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (editable(r, c) && v(r, c) === 0)
				return {
					r,
					c,
					value: solution[r][c],
					reason: `Par déduction, cette case est un ${SYM(solution[r][c])}.`,
				};

	return null;
}
