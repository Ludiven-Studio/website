/**
 * DÉMINEUR LOGIQUE (no-guess Minesweeper) — pure engine (no UI).
 * Every generated board is fully solvable by deduction from a guaranteed-safe 0-opening:
 * the player is never forced to guess. A single rule engine (count → subset → frontier
 * enumeration) powers both the generator's no-guess certification and the player hints.
 * Generation is deterministic from a seeded Rng (shared daily challenge).
 */

import type { Rng } from '../prng';

export interface SizeLevel {
	label: string;
	size: number;
	mines: number;
}

// Difficulty is a single axis: it picks BOTH the board (size+mines) and the techniques the
// solver may use to certify the board no-guess. Densities ~12–15% keep cells legible and
// generation fast to converge.
export const SIZES: Record<string, SizeLevel> = {
	facile: { label: 'Facile', size: 9, mines: 10 },
	moyen: { label: 'Moyen', size: 12, mines: 22 },
	difficile: { label: 'Difficile', size: 14, mines: 30 },
};

export interface DiffLevel {
	label: string;
	useSubset: boolean;
	useEnum: boolean;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', useSubset: false, useEnum: false },
	moyen: { label: 'Moyen', useSubset: true, useEnum: false },
	difficile: { label: 'Difficile', useSubset: true, useEnum: true },
};

export type Coord = { r: number; c: number };

export interface DemineurPuzzle {
	size: number;
	mineCount: number;
	mines: boolean[][]; // true = mine (the hidden truth)
	adjacent: number[][]; // adjacent mine count 0..8 (meaningful on non-mine cells)
	start: Coord; // guaranteed-safe opening; adjacent[start] === 0 → cascades
}

// Player / solver cell state. Plain numeric consts (not a const enum — esbuild + isolatedModules
// don't inline cross-module const enums). In the solver "revealed" means proven-safe, "flagged"
// means proven-mine.
export const HIDDEN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;
export type CellState = 0 | 1 | 2;
export type PlayerGrid = CellState[][];

export const emptyState = (n: number): PlayerGrid =>
	Array.from({ length: n }, () => new Array<CellState>(n).fill(HIDDEN));

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** 8-neighbour coordinates of (r,c), in bounds. */
function neighbours(r: number, c: number, n: number): Coord[] {
	const out: Coord[] = [];
	for (let dr = -1; dr <= 1; dr++)
		for (let dc = -1; dc <= 1; dc++) {
			if (dr === 0 && dc === 0) continue;
			const nr = r + dr;
			const nc = c + dc;
			if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push({ r: nr, c: nc });
		}
	return out;
}

/** Adjacent-mine count for every cell. */
export function computeAdjacency(mines: boolean[][]): number[][] {
	const n = mines.length;
	const adj: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (mines[r][c]) continue;
			let k = 0;
			for (const { r: nr, c: nc } of neighbours(r, c, n)) if (mines[nr][nc]) k++;
			adj[r][c] = k;
		}
	return adj;
}

/**
 * Flood-reveal: set (sr,sc) to REVEALED and cascade through 0-adjacency cells. Operates on any
 * number grid where HIDDEN(0) cells are open to reveal; never touches FLAGGED/REVEALED cells.
 * Used for both the player grid and the solver's knowledge grid.
 */
function floodReveal(grid: number[][], adjacent: number[][], n: number, sr: number, sc: number): void {
	if (grid[sr][sc] !== HIDDEN) return;
	const stack: Coord[] = [{ r: sr, c: sc }];
	grid[sr][sc] = REVEALED;
	while (stack.length) {
		const { r, c } = stack.pop()!;
		if (adjacent[r][c] !== 0) continue;
		for (const { r: nr, c: nc } of neighbours(r, c, n))
			if (grid[nr][nc] === HIDDEN) {
				grid[nr][nc] = REVEALED;
				stack.push({ r: nr, c: nc });
			}
	}
}

/** Reveal a player click. A mine → just that cell (boom). A safe cell → reveal + cascade 0s. */
export function reveal(state: PlayerGrid, p: DemineurPuzzle, cell: Coord): PlayerGrid {
	const { r, c } = cell;
	if (state[r][c] !== HIDDEN) return state;
	const next = state.map((row) => row.slice());
	if (p.mines[r][c]) {
		next[r][c] = REVEALED; // boom — caller detects via isLose
		return next;
	}
	floodReveal(next, p.adjacent, p.size, r, c);
	return next;
}

export function isLose(state: PlayerGrid, p: DemineurPuzzle): boolean {
	const n = p.size;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (p.mines[r][c] && state[r][c] === REVEALED) return true;
	return false;
}

export function isWin(state: PlayerGrid, p: DemineurPuzzle): boolean {
	const n = p.size;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (!p.mines[r][c] && state[r][c] !== REVEALED) return false;
	return true;
}

/** Final solution view: every mine flagged, every safe cell revealed. */
export function revealSolution(p: DemineurPuzzle): PlayerGrid {
	const n = p.size;
	return Array.from({ length: n }, (_, r) =>
		Array.from({ length: n }, (_, c) => (p.mines[r][c] ? FLAGGED : REVEALED) as CellState),
	);
}

// ----------------------------------------------------------------------------------------------
// Rule engine — shared by the solver (certification) and findHint (player help).
// Knowledge grid: HIDDEN(0) unknown, REVEALED(1) proven-safe, FLAGGED(2) proven-mine.
// ----------------------------------------------------------------------------------------------

type Tech = { useSubset: boolean; useEnum: boolean };

export interface Deduction {
	cells: Coord[];
	value: 'safe' | 'mine';
	rule: 'count-safe' | 'count-mine' | 'subset-safe' | 'subset-mine' | 'enum-safe' | 'enum-mine';
	v?: number; // anchor number, for count rules
}

interface Constraint {
	ids: number[]; // hidden cell ids (r*n+c)
	need: number; // mines still to place among ids
}

/** Constraints from currently-revealed numbers: each unknown frontier set + remaining mines. */
function constraintsOf(know: number[][], adjacent: number[][], n: number): Constraint[] {
	const out: Constraint[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (know[r][c] !== REVEALED || adjacent[r][c] === 0) continue;
			let flagged = 0;
			const ids: number[] = [];
			for (const { r: nr, c: nc } of neighbours(r, c, n)) {
				if (know[nr][nc] === FLAGGED) flagged++;
				else if (know[nr][nc] === HIDDEN) ids.push(nr * n + nc);
			}
			if (ids.length) out.push({ ids, need: adjacent[r][c] - flagged });
		}
	return out;
}

function countRule(know: number[][], adjacent: number[][], n: number): Deduction | null {
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (know[r][c] !== REVEALED || adjacent[r][c] === 0) continue;
			const v = adjacent[r][c];
			let flagged = 0;
			const hidden: Coord[] = [];
			for (const nb of neighbours(r, c, n)) {
				if (know[nb.r][nb.c] === FLAGGED) flagged++;
				else if (know[nb.r][nb.c] === HIDDEN) hidden.push(nb);
			}
			if (hidden.length === 0) continue;
			if (flagged === v) return { cells: hidden, value: 'safe', rule: 'count-safe', v };
			if (flagged + hidden.length === v) return { cells: hidden, value: 'mine', rule: 'count-mine', v };
		}
	return null;
}

function subsetRule(know: number[][], adjacent: number[][], n: number): Deduction | null {
	const cons = constraintsOf(know, adjacent, n);
	const toCells = (ids: number[]): Coord[] => ids.map((id) => ({ r: Math.floor(id / n), c: id % n }));
	for (const a of cons)
		for (const b of cons) {
			if (a === b || a.ids.length >= b.ids.length) continue;
			const bSet = new Set(b.ids);
			if (!a.ids.every((id) => bSet.has(id))) continue; // a ⊆ b
			const diffIds = b.ids.filter((id) => !a.ids.includes(id));
			const dNeed = b.need - a.need;
			if (dNeed === 0) return { cells: toCells(diffIds), value: 'safe', rule: 'subset-safe' };
			if (dNeed === diffIds.length) return { cells: toCells(diffIds), value: 'mine', rule: 'subset-mine' };
		}
	return null;
}

const FRONTIER_CAP = 18; // max unknown cells per connected component for enumeration

function enumRule(know: number[][], adjacent: number[][], n: number): Deduction | null {
	const cons = constraintsOf(know, adjacent, n);
	if (!cons.length) return null;

	// Union-find over frontier cell ids; union all cells sharing a constraint.
	const parent = new Map<number, number>();
	const find = (x: number): number => {
		let p = parent.get(x);
		if (p === undefined) {
			parent.set(x, x);
			return x;
		}
		while (p !== x) {
			x = p;
			p = parent.get(x)!;
		}
		return x;
	};
	const union = (a: number, b: number) => parent.set(find(a), find(b));
	for (const con of cons) {
		con.ids.forEach((id) => find(id));
		for (let i = 1; i < con.ids.length; i++) union(con.ids[0], con.ids[i]);
	}

	// Group cells and constraints by component root.
	const compCells = new Map<number, number[]>();
	for (const id of parent.keys()) {
		const root = find(id);
		(compCells.get(root) ?? compCells.set(root, []).get(root)!).push(id);
	}
	const compCons = new Map<number, Constraint[]>();
	for (const con of cons) {
		const root = find(con.ids[0]);
		(compCons.get(root) ?? compCons.set(root, []).get(root)!).push(con);
	}

	for (const [root, cellIds] of compCells) {
		if (cellIds.length > FRONTIER_CAP) continue; // too big to enumerate → can't certify here
		const idx = new Map<number, number>();
		cellIds.forEach((id, i) => idx.set(id, i));
		const localCons = (compCons.get(root) ?? []).map((con) => ({
			pos: con.ids.map((id) => idx.get(id)!),
			need: con.need,
		}));

		const assign = new Array(cellIds.length).fill(-1); // -1 unknown, 0 safe, 1 mine
		const mineCount = new Array(cellIds.length).fill(0);
		let total = 0;

		// Constraints touching each cell position (for incremental feasibility checks).
		const touching: number[][] = cellIds.map(() => []);
		localCons.forEach((con, ci) => con.pos.forEach((p) => touching[p].push(ci)));
		const curMines = new Array(localCons.length).fill(0);
		const curAssigned = new Array(localCons.length).fill(0);

		const feasible = (ci: number): boolean => {
			const con = localCons[ci];
			if (curMines[ci] > con.need) return false;
			if (curMines[ci] + (con.pos.length - curAssigned[ci]) < con.need) return false;
			return true;
		};

		const backtrack = (i: number) => {
			if (i === cellIds.length) {
				total++;
				for (let k = 0; k < cellIds.length; k++) if (assign[k] === 1) mineCount[k]++;
				return;
			}
			for (let val = 0; val <= 1; val++) {
				assign[i] = val;
				for (const ci of touching[i]) {
					curAssigned[ci]++;
					if (val === 1) curMines[ci]++;
				}
				let ok = true;
				for (const ci of touching[i]) if (!feasible(ci)) ok = false;
				if (ok) backtrack(i + 1);
				for (const ci of touching[i]) {
					curAssigned[ci]--;
					if (val === 1) curMines[ci]--;
				}
				assign[i] = -1;
			}
		};
		backtrack(0);
		if (total === 0) continue; // no consistent assignment (shouldn't happen on a real layout)

		const safe: Coord[] = [];
		const mine: Coord[] = [];
		for (let k = 0; k < cellIds.length; k++) {
			const cd = { r: Math.floor(cellIds[k] / n), c: cellIds[k] % n };
			if (mineCount[k] === 0) safe.push(cd);
			else if (mineCount[k] === total) mine.push(cd);
		}
		if (safe.length) return { cells: safe, value: 'safe', rule: 'enum-safe' };
		if (mine.length) return { cells: mine, value: 'mine', rule: 'enum-mine' };
	}
	return null;
}

/** First forced deduction under the enabled techniques (cheapest rule first). */
function findForced(know: number[][], puzzle: DemineurPuzzle, tech: Tech): Deduction | null {
	const { adjacent, size: n } = puzzle;
	return (
		countRule(know, adjacent, n) ||
		(tech.useSubset ? subsetRule(know, adjacent, n) : null) ||
		(tech.useEnum ? enumRule(know, adjacent, n) : null)
	);
}

export interface SolveResult {
	solved: boolean;
	know: number[][];
}

/** Simulate a logical player from the safe opening; report whether the board is fully solved. */
export function solve(puzzle: DemineurPuzzle, tech: Tech): SolveResult {
	const { size: n, adjacent, start } = puzzle;
	const know: number[][] = Array.from({ length: n }, () => new Array(n).fill(HIDDEN));
	floodReveal(know, adjacent, n, start.r, start.c);

	for (;;) {
		const d = findForced(know, puzzle, tech);
		if (!d) break;
		if (d.value === 'safe') {
			for (const { r, c } of d.cells) floodReveal(know, adjacent, n, r, c);
		} else {
			for (const { r, c } of d.cells) know[r][c] = FLAGGED;
		}
	}

	let solved = true;
	for (let r = 0; r < n && solved; r++)
		for (let c = 0; c < n; c++) if (!puzzle.mines[r][c] && know[r][c] !== REVEALED) {
			solved = false;
			break;
		}
	return { solved, know };
}

// ----------------------------------------------------------------------------------------------
// Generation
// ----------------------------------------------------------------------------------------------

const MAX_ATTEMPTS = 300;

function buildPuzzle(n: number, mineCount: number, start: Coord, rng: Rng): DemineurPuzzle | null {
	// Forbid mines on the start cell + its 8 neighbours → start is a 0 and cascades.
	const forbidden = new Set<number>([start.r * n + start.c]);
	for (const { r, c } of neighbours(start.r, start.c, n)) forbidden.add(r * n + c);
	const candidates: number[] = [];
	for (let i = 0; i < n * n; i++) if (!forbidden.has(i)) candidates.push(i);
	if (candidates.length < mineCount) return null;
	const chosen = shuffle(candidates, rng).slice(0, mineCount);
	const mines: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
	for (const id of chosen) mines[Math.floor(id / n)][id % n] = true;
	return { size: n, mineCount, mines, adjacent: computeAdjacency(mines), start };
}

export function generateDemineur(
	sizeLvl: SizeLevel,
	diff: DiffLevel,
	rng: Rng = Math.random,
): DemineurPuzzle {
	const n = sizeLvl.size;
	const tech: Tech = { useSubset: diff.useSubset, useEnum: diff.useEnum };

	const tryGenerate = (mineCount: number, t: Tech): DemineurPuzzle | null => {
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const start = { r: Math.floor(rng() * n), c: Math.floor(rng() * n) };
			const p = buildPuzzle(n, mineCount, start, rng);
			if (p && solve(p, t).solved) return p;
		}
		return null;
	};

	// Primary: certify with the difficulty's own techniques.
	let p = tryGenerate(sizeLvl.mines, tech);
	// Fallback 1: allow the full technique set (still no-guess; findHint uses full set anyway).
	if (!p) p = tryGenerate(sizeLvl.mines, { useSubset: true, useEnum: true });
	// Fallback 2: lower the density a notch until it converges (strictly easier).
	for (let m = sizeLvl.mines - 1; !p && m >= 1; m--) p = tryGenerate(m, { useSubset: true, useEnum: true });
	if (p) return p;

	// Last resort (never expected): a trivial board with a single mine in a corner.
	const mines: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
	mines[n - 1][n - 1] = true;
	return { size: n, mineCount: 1, mines, adjacent: computeAdjacency(mines), start: { r: 0, c: 0 } };
}

// ----------------------------------------------------------------------------------------------
// Hints — always uses the full technique set (strongest help), so it solves any no-guess board.
// ----------------------------------------------------------------------------------------------

export interface HintResult {
	cells: Coord[];
	value: 'safe' | 'mine';
	reason: string;
}

const FULL_TECH: Tech = { useSubset: true, useEnum: true };

function reasonFor(d: Deduction): string {
	switch (d.rule) {
		case 'count-safe':
			return `Le ${d.v} touche déjà ${d.v} mine${d.v! > 1 ? 's' : ''} marquée${d.v! > 1 ? 's' : ''} : les autres cases autour sont sûres.`;
		case 'count-mine':
			return `Le ${d.v} a juste assez de cases cachées autour : ce sont toutes des mines.`;
		case 'subset-safe':
			return `En comparant deux chiffres voisins, ces cases ne peuvent pas contenir de mine : elles sont sûres.`;
		case 'subset-mine':
			return `En comparant deux chiffres voisins, ces cases contiennent forcément des mines.`;
		case 'enum-safe':
			return `Aucune disposition de mines compatible avec les chiffres ne place de mine ici : c'est sûr.`;
		case 'enum-mine':
			return `Toutes les dispositions compatibles avec les chiffres placent une mine ici.`;
	}
}

/**
 * Next logically-forced move for the player, with a French explanation. `state` is the player
 * grid; flags assumed to be the player's mine marks. Returns null only once the board is solved.
 */
export function findHint(state: PlayerGrid, puzzle: DemineurPuzzle): HintResult | null {
	const n = puzzle.size;

	// Correction — a flag on a cell that isn't a mine.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (state[r][c] === FLAGGED && !puzzle.mines[r][c])
				return {
					cells: [{ r, c }],
					value: 'safe',
					reason: `Ce drapeau est mal placé : il n'y a pas de mine ici, c'est une case sûre.`,
				};

	// Build knowledge from the player's correct state (revealed → safe, correct flag → mine).
	const know: number[][] = Array.from({ length: n }, () => new Array(n).fill(HIDDEN));
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (state[r][c] === REVEALED) know[r][c] = REVEALED;
			else if (state[r][c] === FLAGGED) know[r][c] = FLAGGED; // correct (wrong flags handled above)
		}

	const d = findForced(know, puzzle, FULL_TECH);
	if (!d) return null;
	return { cells: d.cells, value: d.value, reason: reasonFor(d) };
}
