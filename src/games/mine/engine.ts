/**
 * LA MINE AUX COCOTTES — match-3 engine (pure, tested; no UI).
 *
 * Swap two adjacent gems to line up ≥3 of a colour. Matches clear, gems fall,
 * new ones spill from the top, and cascades chain. Cocottes are trapped in cages
 * on the BOTTOM row: a match on/adjacent to a cage cracks it; two cracks free the
 * cocotte. Free them all within the move budget to win.
 *
 * Specials (created by big matches):
 *  - line of 4  → a rocket (clears the whole row or column it lines up with)
 *  - line of 5  → a rainbow (swap it onto a gem → removes every gem of that colour)
 *  - L / T of 5 → a bomb (clears the 3×3 around it)
 * Activating a special can trigger others (enchaînements).
 */

import { mulberry32, type Rng } from '../prng';

export type SpecialKind = 'rowClear' | 'colClear' | 'bomb' | 'rainbow';

export interface Gem {
	color: number; // 1..colors
	special?: SpecialKind;
	id: number; // stable id for animation keys
}
export interface Cage {
	cage: true;
	hits: number; // cracks left before the cocotte is freed
}
export type Cell = Gem | Cage | null; // null only appears transiently inside a resolve

export interface Cfg {
	rows: number;
	cols: number;
	colors: number; // number of gem colours (5..6)
	cocottes: number; // caged cocottes on the bottom row
	cageHits: number; // cracks needed to free each cage
}

export interface Board {
	grid: Cell[][]; // [row][col], row 0 = top
	cfg: Cfg;
	rngRef?: () => Rng; // cascade refill source (set by generateBoard); Math.random fallback
}

/** One cascade beat: what cleared, cage progress, and the board AFTER settle. */
export interface Step {
	cleared: [number, number][];
	cracked: [number, number][];
	freed: number;
	gained: number;
	combo: number; // 1, 2, 3… along the cascade
	grid: Cell[][];
}

export interface SwapResult {
	valid: boolean; // did the swap do anything (match or special)?
	grid: Cell[][]; // final board (unchanged when invalid)
	steps: Step[];
	freed: number;
	gained: number;
}

/* ----------------------------- helpers ----------------------------- */

let idSeq = 0;
const nextId = (): number => ++idSeq;

export const isGem = (c: Cell): c is Gem => !!c && !('cage' in c);
export const isCage = (c: Cell): c is Cage => !!c && 'cage' in c;

const cloneGrid = (g: Cell[][]): Cell[][] => g.map((row) => row.map((c) => (c ? { ...c } : null)));
const inb = (cfg: Cfg, r: number, c: number): boolean => r >= 0 && r < cfg.rows && c >= 0 && c < cfg.cols;

const newGem = (rng: Rng, colors: number): Gem => ({ color: 1 + Math.floor(rng() * colors), id: nextId() });

/** A colour that avoids making an immediate run at (r,c) given the two cells left/up. */
function safeColor(grid: Cell[][], r: number, c: number, rng: Rng, colors: number): number {
	for (let tries = 0; tries < 20; tries++) {
		const color = 1 + Math.floor(rng() * colors);
		const l1 = grid[r]?.[c - 1];
		const l2 = grid[r]?.[c - 2];
		const u1 = grid[r - 1]?.[c];
		const u2 = grid[r - 2]?.[c];
		const hh = isGem(l1) && isGem(l2) && l1.color === color && l2.color === color;
		const vv = isGem(u1) && isGem(u2) && u1.color === color && u2.color === color;
		if (!hh && !vv) return color;
	}
	return 1 + Math.floor(rng() * colors);
}

/* ----------------------------- matches ----------------------------- */

interface Run {
	cells: [number, number][];
	color: number;
	horizontal: boolean;
}

/** All maximal horizontal/vertical runs of ≥3 same-colour gems. */
export function findRuns(grid: Cell[][]): Run[] {
	const rows = grid.length, cols = grid[0].length;
	const runs: Run[] = [];
	// horizontal
	for (let r = 0; r < rows; r++) {
		let c = 0;
		while (c < cols) {
			const cell = grid[r][c];
			if (!isGem(cell)) { c++; continue; }
			let k = c + 1;
			while (k < cols && isGem(grid[r][k]) && (grid[r][k] as Gem).color === cell.color) k++;
			if (k - c >= 3) runs.push({ cells: range(c, k).map((cc): [number, number] => [r, cc]), color: cell.color, horizontal: true });
			c = k;
		}
	}
	// vertical
	for (let c = 0; c < cols; c++) {
		let r = 0;
		while (r < rows) {
			const cell = grid[r][c];
			if (!isGem(cell)) { r++; continue; }
			let k = r + 1;
			while (k < rows && isGem(grid[k][c]) && (grid[k][c] as Gem).color === cell.color) k++;
			if (k - r >= 3) runs.push({ cells: range(r, k).map((rr): [number, number] => [rr, c]), color: cell.color, horizontal: false });
			r = k;
		}
	}
	return runs;
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);
const key = (r: number, c: number): string => `${r},${c}`;

export const hasMatch = (grid: Cell[][]): boolean => findRuns(grid).length > 0;

/* --------------------------- special logic --------------------------- */

/** Decide the special to spawn from a set of runs, and where (prefer `at` if it's in a run). */
function planSpecials(runs: Run[], at: [number, number] | null): Map<string, { special: SpecialKind; color: number }> {
	const out = new Map<string, { special: SpecialKind; color: number }>();
	// L/T: a cell shared by a horizontal and a vertical run → bomb.
	const hMembers = new Map<string, Run>();
	const vMembers = new Map<string, Run>();
	for (const run of runs) for (const [r, c] of run.cells) (run.horizontal ? hMembers : vMembers).set(key(r, c), run);
	const used = new Set<Run>();
	for (const k of hMembers.keys()) {
		if (vMembers.has(k)) {
			out.set(k, { special: 'bomb', color: hMembers.get(k)!.color });
			used.add(hMembers.get(k)!); used.add(vMembers.get(k)!);
		}
	}
	for (const run of runs) {
		if (used.has(run)) continue;
		if (run.cells.length < 4) continue;
		const spot = pickSpot(run, at);
		const k = key(spot[0], spot[1]);
		if (out.has(k)) continue;
		out.set(k, { special: run.cells.length >= 5 ? 'rainbow' : run.horizontal ? 'colClear' : 'rowClear', color: run.color });
	}
	return out;
}

// A run of 4 makes a rocket that flies ALONG the run: a horizontal run clears its
// column-neighbours? No — intuitively the streak clears the crossing line: an H run
// of 4 → a rocket that clears the COLUMN; a V run → clears the ROW. (feels dynamic)
function pickSpot(run: Run, at: [number, number] | null): [number, number] {
	if (at && run.cells.some(([r, c]) => r === at[0] && c === at[1])) return at;
	return run.cells[Math.floor(run.cells.length / 2)];
}

/** Cells an activated special clears (not counting further chaining). */
function specialArea(grid: Cell[][], r: number, c: number, sp: SpecialKind, colorForRainbow: number): [number, number][] {
	const rows = grid.length, cols = grid[0].length;
	const out: [number, number][] = [];
	if (sp === 'rowClear') for (let cc = 0; cc < cols; cc++) out.push([r, cc]);
	else if (sp === 'colClear') for (let rr = 0; rr < rows; rr++) out.push([rr, c]);
	else if (sp === 'bomb') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (r + dr >= 0 && r + dr < rows && c + dc >= 0 && c + dc < cols) out.push([r + dr, c + dc]); }
	else if (sp === 'rainbow') for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) { const g = grid[rr][cc]; if (isGem(g) && g.color === colorForRainbow) out.push([rr, cc]); }
	return out;
}

/** Expand a clear set: any special caught in the blast also detonates (chained). */
function expandClears(grid: Cell[][], seed: Set<string>): Set<string> {
	const out = new Set(seed);
	const stack = [...seed];
	while (stack.length) {
		const k = stack.pop()!;
		const [r, c] = k.split(',').map(Number);
		const g = grid[r][c];
		if (isGem(g) && g.special) {
			for (const [rr, cc] of specialArea(grid, r, c, g.special, g.color)) {
				const kk = key(rr, cc);
				if (!out.has(kk)) { out.add(kk); stack.push(kk); }
			}
		}
	}
	return out;
}

/* ----------------------------- gravity ----------------------------- */

/** Column gravity: within each cage-free segment, gems fall to the bottom and the top
 *  refills with new gems. Cages (immovable) split a column into independent segments,
 *  so no empty cell is ever trapped below a cage. */
function settle(grid: Cell[][], cfg: Cfg, rng: Rng): void {
	for (let c = 0; c < cfg.cols; c++) {
		let segStart = 0;
		for (let r = 0; r <= cfg.rows; r++) {
			if (r === cfg.rows || isCage(grid[r][c])) {
				const gems: Gem[] = [];
				for (let rr = segStart; rr < r; rr++) { const g = grid[rr][c]; if (isGem(g)) gems.push(g); }
				const empties = (r - segStart) - gems.length;
				for (let i = 0; i < empties; i++) grid[segStart + i][c] = newGem(rng, cfg.colors);
				for (let i = 0; i < gems.length; i++) grid[segStart + empties + i][c] = gems[i];
				segStart = r + 1;
			}
		}
	}
}

/** Crack every cage orthogonally adjacent to a cleared cell. Returns cracked positions + freed count. */
function crackCages(grid: Cell[][], cfg: Cfg, cleared: Set<string>): { cracked: [number, number][]; freed: number } {
	const cracked: [number, number][] = [];
	let freed = 0;
	const hit = new Set<string>();
	for (const k of cleared) {
		const [r, c] = k.split(',').map(Number);
		for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
			const rr = r + dr, cc = c + dc;
			if (!inb(cfg, rr, cc)) continue;
			const cell = grid[rr][cc];
			if (isCage(cell) && !hit.has(key(rr, cc))) hit.add(key(rr, cc));
		}
	}
	for (const k of hit) {
		const [r, c] = k.split(',').map(Number);
		const cage = grid[r][c] as Cage;
		cage.hits -= 1;
		cracked.push([r, c]);
		if (cage.hits <= 0) { grid[r][c] = null; freed += 1; } // freed → empty, refills on settle
	}
	return { cracked, freed };
}

/* ----------------------------- resolve ----------------------------- */

const SCORE_GEM = 10;

/** Resolve one board to stable, producing cascade steps. `seedClear` = pre-cleared cells (special activation). */
function resolve(grid: Cell[][], cfg: Cfg, rng: Rng, first: { clears: Set<string>; at: [number, number] | null }): { steps: Step[]; freed: number; gained: number } {
	const steps: Step[] = [];
	let combo = 0;
	let totalFreed = 0;
	let totalGained = 0;
	let pending = first.clears;
	let planAt = first.at;

	while (true) {
		let clears: Set<string>;
		let specials = new Map<string, { special: SpecialKind; color: number }>();
		if (pending && pending.size) {
			clears = expandClears(grid, pending);
		} else {
			const runs = findRuns(grid);
			if (!runs.length) break;
			specials = planSpecials(runs, planAt);
			const base = new Set<string>();
			for (const run of runs) for (const [r, c] of run.cells) base.add(key(r, c));
			clears = expandClears(grid, base);
		}
		pending = new Set(); // consumed
		planAt = null;
		combo += 1;

		// Crack cages adjacent to the cleared cells.
		const { cracked, freed } = crackCages(grid, cfg, clears);
		totalFreed += freed;

		// Clear cells; where a special is planned, place it instead of clearing.
		const clearedList: [number, number][] = [];
		for (const k of clears) {
			const [r, c] = k.split(',').map(Number);
			if (!isGem(grid[r][c])) continue; // cages/empties untouched here
			const plan = specials.get(k);
			if (plan) grid[r][c] = { color: plan.color, special: plan.special, id: nextId() };
			else { grid[r][c] = null; clearedList.push([r, c]); }
		}

		const gained = clearedList.length * SCORE_GEM * combo + freed * 200;
		totalGained += gained;

		settle(grid, cfg, rng);
		steps.push({ cleared: clearedList, cracked, freed, gained, combo, grid: cloneGrid(grid) });
	}
	return { steps, freed: totalFreed, gained: totalGained };
}

/* ----------------------------- public API ----------------------------- */

const adjacent = (a: [number, number], b: [number, number]): boolean =>
	(a[0] === b[0] && Math.abs(a[1] - b[1]) === 1) || (a[1] === b[1] && Math.abs(a[0] - b[0]) === 1);

/** Attempt to swap two adjacent gems. Returns the cascade or an invalid result. */
export function trySwap(board: Board, a: [number, number], b: [number, number]): SwapResult {
	const cfg = board.cfg;
	const grid = cloneGrid(board.grid);
	const ga = grid[a[0]][a[1]], gb = grid[b[0]][b[1]];
	if (!adjacent(a, b) || !isGem(ga) || !isGem(gb)) return { valid: false, grid: board.grid, steps: [], freed: 0, gained: 0 };
	const rng = board.rngRef?.() ?? Math.random;

	// swap
	grid[a[0]][a[1]] = gb; grid[b[0]][b[1]] = ga;

	// Special activation on swap (rainbow, or special+special enchaînements).
	const seed = new Set<string>();
	const sa = grid[a[0]][a[1]], sb = grid[b[0]][b[1]];
	let activated = false;
	if (isGem(sa) && sa.special === 'rainbow') { activateRainbow(grid, a, isGem(sb) ? sb : null, seed); activated = true; }
	if (isGem(sb) && sb.special === 'rainbow') { activateRainbow(grid, b, isGem(sa) ? sa : null, seed); activated = true; }
	if (!activated && isGem(sa) && sa.special && isGem(sb) && sb.special) {
		seed.add(key(a[0], a[1])); seed.add(key(b[0], b[1])); activated = true; // both detonate + chain
	}

	if (!activated && !hasMatch(grid)) return { valid: false, grid: board.grid, steps: [], freed: 0, gained: 0 };

	const { steps, freed, gained } = resolve(grid, cfg, rng, { clears: seed, at: activated ? null : (matchIncludes(grid, a) ? a : b) });
	return { valid: true, grid: steps.length ? steps[steps.length - 1].grid : grid, steps, freed, gained };
}

function matchIncludes(grid: Cell[][], p: [number, number]): boolean {
	return findRuns(grid).some((run) => run.cells.some(([r, c]) => r === p[0] && c === p[1]));
}

/** Rainbow swapped onto `other`: clear every gem of other's colour (or a random colour if other is a special/none). */
function activateRainbow(grid: Cell[][], at: [number, number], other: Gem | null, seed: Set<string>): void {
	const color = other && !other.special ? other.color : 1 + Math.floor(Math.random() * 6);
	for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) { const g = grid[r][c]; if (isGem(g) && g.color === color) seed.add(key(r, c)); }
	seed.add(key(at[0], at[1]));
}

/* ----------------------------- generation ----------------------------- */

export interface GenBoard extends Board {
	rngRef: () => Rng; // returns a fresh rng call source for cascades (uses one shared rng)
}

/** Build a solvable board: no initial match, ≥1 valid move, cocottes caged on the bottom row. */
export function generateBoard(seed: number, cfg: Cfg, rngIn?: Rng): GenBoard {
	const rng = rngIn ?? mulberry(seed);
	let grid: Cell[][] = [];
	for (let attempt = 0; attempt < 60; attempt++) {
		grid = Array.from({ length: cfg.rows }, () => new Array<Cell>(cfg.cols).fill(null));
		// Cocottes caged across the bottom band (more crackable neighbours than the bottom row alone).
		for (const [r, c] of spreadCages(cfg, rng)) grid[r][c] = { cage: true, hits: cfg.cageHits };
		for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
			if (isCage(grid[r][c])) continue;
			grid[r][c] = { color: safeColor(grid, r, c, rng, cfg.colors), id: nextId() };
		}
		if (!hasMatch(grid) && hasAnyMove({ grid, cfg })) break;
	}
	const rngRef = () => rng;
	return { grid, cfg, rngRef };
}

const mulberry = (seed: number): Rng => mulberry32(seed >>> 0);

/** Distinct cage cells in the bottom band (up to 3 rows), spread out. */
function spreadCages(cfg: Cfg, rng: Rng): [number, number][] {
	const n = Math.min(cfg.cocottes, cfg.cols * 3);
	const band = Math.min(3, cfg.rows - 2);
	const cells: [number, number][] = [];
	for (let r = cfg.rows - band; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) cells.push([r, c]);
	for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
	return cells.slice(0, n);
}

/* ----------------------------- moves / hint / shuffle ----------------------------- */

/** Is there any swap that would create a match? */
export function hasAnyMove(board: Board): boolean {
	return !!findHint(board);
}

/** A swap that makes a match (for the hint), or null if none exists. */
export function findHint(board: Board): { a: [number, number]; b: [number, number] } | null {
	const { grid, cfg } = board;
	for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
		const cell = grid[r][c];
		if (!isGem(cell)) continue;
		if (cell.special === 'rainbow') return { a: [r, c], b: [r, c + 1 < cfg.cols && isGem(grid[r][c + 1]) ? c + 1 : c - 1] }; // rainbow always "works"
		for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
			const rr = r + dr, cc = c + dc;
			if (!inb(cfg, rr, cc) || !isGem(grid[rr][cc])) continue;
			const g = cloneGrid(grid);
			[g[r][c], g[rr][cc]] = [g[rr][cc], g[r][c]];
			if (hasMatch(g) || (isGem(g[r][c]) && (g[r][c] as Gem).special) || (isGem(g[rr][cc]) && (g[rr][cc] as Gem).special)) return { a: [r, c], b: [rr, cc] };
		}
	}
	return null;
}

/** Reassign gem colours (keeping cages) until there's a move and no match — for a stuck board. */
export function shuffle(board: GenBoard): void {
	const rng = board.rngRef();
	for (let attempt = 0; attempt < 60; attempt++) {
		for (let r = 0; r < board.cfg.rows; r++) for (let c = 0; c < board.cfg.cols; c++) {
			const cell = board.grid[r][c];
			if (isGem(cell) && !cell.special) cell.color = safeColor(board.grid, r, c, rng, board.cfg.colors);
		}
		if (!hasMatch(board.grid) && hasAnyMove(board)) return;
	}
}

/** Break one gem (hammer joker): clear it + crack adjacent cages, then cascade. */
export function smash(board: Board, at: [number, number]): SwapResult {
	const cfg = board.cfg;
	const grid = cloneGrid(board.grid);
	if (!isGem(grid[at[0]][at[1]])) return { valid: false, grid: board.grid, steps: [], freed: 0, gained: 0 };
	const rng = board.rngRef?.() ?? Math.random;
	const seed = new Set<string>([key(at[0], at[1])]);
	const { steps, freed, gained } = resolve(grid, cfg, rng, { clears: seed, at: null });
	return { valid: true, grid: steps.length ? steps[steps.length - 1].grid : grid, steps, freed, gained };
}

/** Count cocottes still caged. */
export function cagedLeft(grid: Cell[][]): number {
	let n = 0;
	for (const row of grid) for (const c of row) if (isCage(c)) n++;
	return n;
}
