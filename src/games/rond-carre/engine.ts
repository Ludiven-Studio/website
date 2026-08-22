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
	candidates?: number; // boards to draw, keeping the one with the fewest clues (default 1)
	tier?: SolveTier; // deduction techniques the board may require (default 1)
}

/** 1 = neighbour signs, no-3 and line balance. 2 = adds "all fillings of a line agree". */
export type SolveTier = 1 | 2;

export const SIZE = 6;

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', extraGivens: 8 },
	moyen: { label: 'Moyen', extraGivens: 4 },
	difficile: { label: 'Difficile', extraGivens: 0 },
	// Difficile already strips to the minimal set, so Expert picks the leanest board
	// out of several draws instead, and allows the harder line-fillings technique.
	expert: { label: 'Expert', extraGivens: 0, candidates: 8, tier: 2 },
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

/** All ways to complete one line (row or column) using only that line's own rules. */
function lineFillings(line: Cell[], edges: (boolean | undefined)[], half: number): Cell[][] {
	const n = line.length;
	const out: Cell[][] = [];
	const cur = [...line];
	const cnt = [0, 0, 0];
	for (const x of line) if (x) cnt[x]++;
	const walk = (i: number) => {
		if (out.length > 64) return; // safety net; a 6-cell line never gets close
		if (i === n) {
			out.push([...cur]);
			return;
		}
		const fixed = line[i] !== 0;
		for (const v of fixed ? [line[i]] : ([1, 2] as Cell[])) {
			if (!fixed && cnt[v] >= half) continue;
			if (i >= 2 && cur[i - 1] === v && cur[i - 2] === v) continue;
			const e = edges[i - 1]; // sign between i-1 and i
			if (i > 0 && e !== undefined && e !== (cur[i - 1] === v)) continue;
			cur[i] = v;
			if (!fixed) cnt[v]++;
			walk(i + 1);
			if (!fixed) cnt[v]--;
		}
		cur[i] = line[i];
	};
	walk(0);
	return out;
}

/**
 * Solve using human techniques only, never guessing. Returns the filled grid, or
 * null if the board stalls (needs a guess) or contradicts itself. This is what
 * makes generation guess-free: a clue is only dropped if this still solves.
 */
export function solveByLogic(
	given: Cell[][],
	constraints: Constraint[],
	n: number,
	tier: SolveTier = 1,
): Cell[][] | null {
	const total = n * n;
	const half = n / 2;
	const cons = new Map<number, boolean>();
	for (const { a, b, eq } of constraints)
		cons.set(edgeId(a[0] * n + a[1], b[0] * n + b[1], total), eq);
	const sign = (r1: number, c1: number, r2: number, c2: number) =>
		cons.get(edgeId(r1 * n + c1, r2 * n + c2, total));

	const g: Cell[][] = given.map((row) => [...row]);
	const at = (r: number, c: number): Cell => (r < 0 || r >= n || c < 0 || c >= n ? 0 : g[r][c]);
	const count = (cells: [number, number][], v: Cell) =>
		cells.reduce((s, [r, c]) => s + (g[r][c] === v ? 1 : 0), 0);

	const rowCells = (r: number) => Array.from({ length: n }, (_, c): [number, number] => [r, c]);
	const colCells = (c: number) => Array.from({ length: n }, (_, r): [number, number] => [r, c]);

	const allowed = (r: number, c: number, v: Cell): boolean => {
		if (count(rowCells(r), v) >= half || count(colCells(c), v) >= half) return false;
		if (
			(at(r, c - 1) === v && at(r, c - 2) === v) ||
			(at(r, c + 1) === v && at(r, c + 2) === v) ||
			(at(r, c - 1) === v && at(r, c + 1) === v) ||
			(at(r - 1, c) === v && at(r - 2, c) === v) ||
			(at(r + 1, c) === v && at(r + 2, c) === v) ||
			(at(r - 1, c) === v && at(r + 1, c) === v)
		)
			return false;
		for (const [dr, dc] of [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		]) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr < 0 || nr >= n || nc < 0 || nc >= n || g[nr][nc] === 0) continue;
			const e = sign(r, c, nr, nc);
			if (e !== undefined && e !== (g[nr][nc] === v)) return false;
		}
		return true;
	};

	let empty = 0;
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] === 0) empty++;

	while (empty > 0) {
		let progress = false;
		for (let r = 0; r < n && !progress; r++)
			for (let c = 0; c < n && !progress; c++) {
				if (g[r][c] !== 0) continue;
				const ok = ([1, 2] as Cell[]).filter((v) => allowed(r, c, v));
				if (ok.length === 0) return null;
				if (ok.length === 1) {
					g[r][c] = ok[0];
					empty--;
					progress = true;
				}
			}
		if (progress) continue;
		if (tier < 2) return null;

		// Tier 2: every valid filling of a line agrees on a cell → that cell is settled.
		for (let i = 0; i < 2 * n && !progress; i++) {
			const cells = i < n ? rowCells(i) : colCells(i - n);
			const line = cells.map(([r, c]) => g[r][c]);
			const edges = cells
				.slice(0, n - 1)
				.map(([r, c], k) => sign(r, c, cells[k + 1][0], cells[k + 1][1]));
			const fills = lineFillings(line, edges, half);
			if (fills.length === 0) return null;
			for (let k = 0; k < n; k++) {
				if (line[k] !== 0) continue;
				const v = fills[0][k];
				if (!fills.every((f) => f[k] === v)) continue;
				const [r, c] = cells[k];
				if (!allowed(r, c, v)) return null;
				g[r][c] = v;
				empty--;
				progress = true;
			}
		}
		if (!progress) return null;
	}
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
	let best: RondCarrePuzzle | null = null;
	let bestClues = Infinity;
	for (let i = 0; i < Math.max(1, diff.candidates ?? 1); i++) {
		const p = buildOne(diff, rng);
		const clues = p.given.reduce((s, row) => s + row.filter((v) => v !== 0).length, 0) + p.constraints.length;
		if (clues < bestClues) { best = p; bestClues = clues; }
	}
	return best!;
}

function buildOne(diff: DiffLevel, rng: Rng): RondCarrePuzzle {
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

	// Start fully revealed, then strip clues while the board stays solvable by pure
	// deduction — givens first (Tango feel: few givens, several signs), then signs.
	// The test is solveByLogic, not uniqueness: a unique board can still need a guess.
	const given: Cell[][] = solution.map((row) => [...row]);
	const consActive = new Array(allCons.length).fill(true);
	const activeCons = () => allCons.filter((_, i) => consActive[i]);
	const tier = diff.tier ?? 1;
	const stillDeducible = () => solveByLogic(given, activeCons(), n, tier) !== null;

	const cells = shuffle(
		Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
		rng,
	);
	for (const [r, c] of cells) {
		const keep = given[r][c];
		given[r][c] = 0;
		if (!stillDeducible()) given[r][c] = keep;
	}
	for (const i of shuffle(Array.from({ length: allCons.length }, (_, j) => j), rng)) {
		consActive[i] = false;
		if (!stillDeducible()) consActive[i] = true;
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

	// 5) Every valid filling of a line agrees on one cell (the Expert technique).
	const cons = new Map<number, boolean>();
	for (const { a, b, eq } of puzzle.constraints)
		cons.set(edgeId(a[0] * n + a[1], b[0] * n + b[1], n * n), eq);
	for (let i = 0; i < 2 * n; i++) {
		const cells: [number, number][] =
			i < n
				? Array.from({ length: n }, (_, c): [number, number] => [i, c])
				: Array.from({ length: n }, (_, r): [number, number] => [r, i - n]);
		const line = cells.map(([r, c]) => v(r, c));
		const edges = cells
			.slice(0, n - 1)
			.map(([r, c], k) =>
				cons.get(edgeId(r * n + c, cells[k + 1][0] * n + cells[k + 1][1], n * n)),
			);
		const fills = lineFillings(line, edges, half);
		for (let k = 0; k < n; k++) {
			const [r, c] = cells[k];
			if (line[k] !== 0 || !editable(r, c) || fills.length === 0) continue;
			const want = fills[0][k];
			if (!fills.every((f) => f[k] === want) || want !== solution[r][c]) continue;
			return {
				r,
				c,
				value: want,
				reason: `Toutes les façons de remplir ${i < n ? 'cette ligne' : 'cette colonne'} mettent un ${SYM(want)} ici.`,
			};
		}
	}

	// 6) Fallback.
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
