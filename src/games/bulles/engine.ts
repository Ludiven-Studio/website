/* =====================================================
   BULLES — pure engine.
   A hex-packed raft of bubbles hangs from the ceiling and one cannon sits under it.
   A bubble that lands against two of its own colour takes the whole patch down, and
   whatever is left hanging on nothing falls with it.
   The solver at the bottom both proves a board and gives it its par.
   ===================================================== */

import type { Rng } from '../prng';

export interface Pt {
	x: number;
	y: number;
}

/** Bubble radius. Every length here is a multiple of it. */
export const R = 1;

/** Row pitch of a hex packing — two bubbles one row apart just touch. */
export const ROW_H = Math.sqrt(3);

/** Widest angle off the vertical the cannon takes. */
export const MAX_AIM = 1.33;

/** A patch comes down from three of a colour. */
export const MIN_POP = 3;

/** Rows of parking room under the deal: a shot that pops nothing has to go somewhere. */
export const GROWTH = 4;

export interface Grid {
	/** Bubbles in an even row. Odd rows hold one less and sit half a bubble to the right. */
	cols: number;
	/** Rows the grid can hold — the deal plus its parking room. */
	rows: number;
	/** Row-major, `cols` wide whatever the row holds. -1 is empty. */
	cells: Int8Array;
}

export const rowLen = (cols: number, r: number): number => (r % 2 === 0 ? cols : cols - 1);

export const boardW = (cols: number): number => 2 * R * cols;

/** The lane the cannon shoots across, under the lowest row a bubble may reach. */
const LANE = 3.4 * R;

export const boardH = (rows: number): number => R + rows * ROW_H + LANE;

export const shooterOf = (g: Grid): Pt => ({ x: boardW(g.cols) / 2, y: boardH(g.rows) - 1.4 * R });

export const rowOf = (g: Grid, k: number): number => Math.floor(k / g.cols);

export function centreOf(g: Grid, k: number): Pt {
	const r = rowOf(g, k);
	return { x: R + 2 * R * (k % g.cols) + (r % 2 ? R : 0), y: R + r * ROW_H };
}

export const cloneGrid = (g: Grid): Grid => ({ cols: g.cols, rows: g.rows, cells: g.cells.slice() });

export function countBubbles(g: Grid): number {
	let n = 0;
	for (let k = 0; k < g.cells.length; k++) if (g.cells[k] >= 0) n++;
	return n;
}

/** The lowest row still holding a bubble, or -1 on an empty board. */
export function deepestRow(g: Grid): number {
	for (let r = g.rows - 1; r >= 0; r--) {
		for (let c = 0; c < rowLen(g.cols, r); c++) if (g.cells[r * g.cols + c] >= 0) return r;
	}
	return -1;
}

/**
 * The six cells touching `k`, written into a shared buffer — a generation walks the grid
 * millions of times, so the hot paths read `NB` and never allocate. Returns how many are real.
 */
const NB = new Int32Array(6);

function nbrs(g: Grid, k: number): number {
	const r = (k / g.cols) | 0;
	const c = k - r * g.cols;
	// Odd rows sit half a bubble right of the even ones, so the pair above shifts with parity.
	const a = r % 2 ? c : c - 1;
	let n = 0;
	if (c > 0) NB[n++] = k - 1;
	if (c + 1 < rowLen(g.cols, r)) NB[n++] = k + 1;
	if (r > 0) {
		const len = rowLen(g.cols, r - 1);
		if (a >= 0 && a < len) NB[n++] = (r - 1) * g.cols + a;
		if (a + 1 >= 0 && a + 1 < len) NB[n++] = (r - 1) * g.cols + a + 1;
	}
	if (r + 1 < g.rows) {
		const len = rowLen(g.cols, r + 1);
		if (a >= 0 && a < len) NB[n++] = (r + 1) * g.cols + a;
		if (a + 1 >= 0 && a + 1 < len) NB[n++] = (r + 1) * g.cols + a + 1;
	}
	return n;
}

/** The raft has come down to the cannon's lane: the board is lost. */
export const isLost = (g: Grid): boolean => deepestRow(g) >= g.rows - 1;

/** The six cells touching `k`, minus those off the grid. */
export function neighbours(g: Grid, k: number): number[] {
	const n = nbrs(g, k);
	const out: number[] = [];
	for (let i = 0; i < n; i++) out.push(NB[i]);
	return out;
}

let mark = new Uint8Array(0);

function marks(n: number): Uint8Array {
	if (mark.length < n) mark = new Uint8Array(n);
	else mark.fill(0, 0, n);
	return mark;
}

/** The same-colour patch `k` belongs to. */
export function groupAt(g: Grid, k: number): number[] {
	const colour = g.cells[k];
	if (colour < 0) return [];
	const seen = marks(g.cells.length);
	seen[k] = 1;
	const out: number[] = [k];
	for (let head = 0; head < out.length; head++) {
		const n = nbrs(g, out[head]);
		for (let i = 0; i < n; i++) {
			const nb = NB[i];
			if (g.cells[nb] === colour && !seen[nb]) {
				seen[nb] = 1;
				out.push(nb);
			}
		}
	}
	return out;
}

/** Bubbles that no longer hang from the ceiling. */
export function orphans(g: Grid): number[] {
	const held = marks(g.cells.length);
	const queue: number[] = [];
	for (let c = 0; c < rowLen(g.cols, 0); c++) {
		if (g.cells[c] >= 0) {
			held[c] = 1;
			queue.push(c);
		}
	}
	for (let head = 0; head < queue.length; head++) {
		const n = nbrs(g, queue[head]);
		for (let i = 0; i < n; i++) {
			const nb = NB[i];
			if (g.cells[nb] >= 0 && !held[nb]) {
				held[nb] = 1;
				queue.push(nb);
			}
		}
	}
	const out: number[] = [];
	for (let k = 0; k < g.cells.length; k++) if (g.cells[k] >= 0 && !held[k]) out.push(k);
	return out;
}

export interface Blast {
	/** The patch that came down. Empty when the bubble merely stuck. */
	popped: number[];
	/** What fell for want of a ceiling. */
	dropped: number[];
}

/** Land `colour` on the free cell `k` and settle what follows. Mutates `g`. */
export function applyShot(g: Grid, k: number, colour: number): Blast {
	g.cells[k] = colour;
	const patch = groupAt(g, k);
	if (patch.length < MIN_POP) return { popped: [], dropped: [] };
	for (const c of patch) g.cells[c] = -1;
	const dropped = orphans(g);
	for (const c of dropped) g.cells[c] = -1;
	return { popped: patch, dropped };
}

/* ---------------- flight ---------------- */

const STEP = 0.12 * R;
const MAX_STEPS = 6000;

/** Is a bubble centred here overlapping one already up there? */
function hits(g: Grid, x: number, y: number): boolean {
	const r0 = Math.max(0, Math.floor((y - R) / ROW_H) - 1);
	const r1 = Math.min(g.rows - 1, r0 + 3);
	for (let r = r0; r <= r1; r++) {
		const dy = y - (R + r * ROW_H);
		if (dy * dy >= 4 * R * R) continue;
		const off = r % 2 ? R : 0;
		const len = rowLen(g.cols, r);
		const c0 = Math.max(0, Math.floor((x - off - 3 * R) / (2 * R)));
		const c1 = Math.min(len - 1, Math.ceil((x - off + 3 * R) / (2 * R)));
		for (let c = c0; c <= c1; c++) {
			if (g.cells[r * g.cols + c] < 0) continue;
			const dx = x - (R + 2 * R * c + off);
			if (dx * dx + dy * dy < 4 * R * R) return true;
		}
	}
	return false;
}

function hangs(g: Grid, k: number): boolean {
	const n = nbrs(g, k);
	for (let i = 0; i < n; i++) if (g.cells[NB[i]] >= 0) return true;
	return false;
}

/** The free cell a bubble stopped near settles into: the nearest one that hangs on something. */
function snap(g: Grid, x: number, y: number): number | null {
	const r0 = Math.max(0, Math.floor((y - R) / ROW_H) - 2);
	const r1 = Math.min(g.rows - 1, r0 + 5);
	let best = -1;
	let bestD = Infinity;
	for (let r = r0; r <= r1; r++) {
		const off = r % 2 ? R : 0;
		const len = rowLen(g.cols, r);
		for (let c = 0; c < len; c++) {
			const k = r * g.cols + c;
			if (g.cells[k] >= 0) continue;
			if (r > 0 && !hangs(g, k)) continue;
			const dx = x - (R + 2 * R * c + off);
			const dy = y - (R + r * ROW_H);
			const d = dx * dx + dy * dy;
			if (d < bestD) {
				bestD = d;
				best = k;
			}
		}
	}
	return best < 0 ? null : best;
}

export interface Flight {
	/** Cannon first, then one point per wall bounce, then the cell the bubble settles in. */
	path: Pt[];
	cell: number;
}

/** Where a shot at `angle` — radians off the vertical, right is positive — comes to rest. */
export function fly(g: Grid, angle: number): Flight | null {
	const sh = shooterOf(g);
	const wall = boardW(g.cols) - R;
	let x = sh.x;
	let y = sh.y;
	let dx = Math.sin(angle) * STEP;
	const dy = -Math.cos(angle) * STEP;
	if (dy >= 0) return null;
	const path: Pt[] = [sh];
	// Below the raft there is nothing to test against, and that is most of a flight.
	const reach = R + deepestRow(g) * ROW_H + 2 * R;
	for (let i = 0; i < MAX_STEPS; i++) {
		const px = x;
		const py = y;
		x += dx;
		y += dy;
		if (x < R) {
			x = 2 * R - x;
			dx = -dx;
			path.push({ x: R, y });
		} else if (x > wall) {
			x = 2 * wall - x;
			dx = -dx;
			path.push({ x: wall, y });
		}
		if (y > reach) continue;
		const cell = y <= R ? snap(g, x, R) : hits(g, x, y) ? snap(g, px, py) : null;
		if (cell !== null) {
			path.push(centreOf(g, cell));
			return { path, cell };
		}
		if (y <= R) return null; // ceiling reached but nowhere to settle
	}
	return null;
}

/**
 * The line a shot at `angle` actually travels: cannon, one point per wall bounce, then the
 * spot where the bubble first touches something. Unlike `fly` it never snaps to a cell, so
 * the sight sweeps smoothly instead of jumping from one cell centre to the next.
 */
export function ray(g: Grid, angle: number): Pt[] {
	const sh = shooterOf(g);
	const wall = boardW(g.cols) - R;
	let x = sh.x;
	let y = sh.y;
	let dx = Math.sin(angle) * STEP;
	const dy = -Math.cos(angle) * STEP;
	const path: Pt[] = [sh];
	if (dy >= 0) return path;
	const reach = R + deepestRow(g) * ROW_H + 2 * R;
	for (let i = 0; i < MAX_STEPS; i++) {
		const px = x;
		const py = y;
		x += dx;
		y += dy;
		if (x < R) {
			x = 2 * R - x;
			dx = -dx;
			path.push({ x: R, y });
		} else if (x > wall) {
			x = 2 * wall - x;
			dx = -dx;
			path.push({ x: wall, y });
		}
		if (y > reach) continue;
		if (y <= R) {
			path.push({ x, y: R });
			return path;
		}
		if (hits(g, x, y)) {
			path.push({ x: px, y: py });
			return path;
		}
	}
	path.push({ x, y });
	return path;
}

/* ---------------- colours ---------------- */

/** Colours still up there, low to high. */
export function palette(g: Grid): number[] {
	const seen: number[] = [];
	for (let k = 0; k < g.cells.length; k++) {
		const v = g.cells[k];
		if (v >= 0 && !seen.includes(v)) seen.push(v);
	}
	return seen.sort((a, b) => a - b);
}

const shotHash = (seed: number, shot: number): number => {
	let h = (seed ^ Math.imul(shot + 1, 0x9e3779b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	return (h ^ (h >>> 16)) >>> 0;
};

/**
 * The colour loaded for shot number `shot`. It is drawn from what is still on the board,
 * so the cannon never hands out a colour with nothing left to hit — and it depends on the
 * board alone, which is what lets the solver and the hint replay from any position.
 */
export function nextColour(g: Grid, seed: number, shot: number): number {
	const pal = palette(g);
	return pal.length ? pal[shotHash(seed, shot) % pal.length] : 0;
}

/* ---------------- solver ---------------- */

/** Notches of the aiming dial each side of the vertical. */
const AIM_STEPS = 100;

/** Every cell a shot can reach, each with the straightest angle that gets there. */
export function landings(g: Grid): Map<number, number> {
	const out = new Map<number, number>();
	for (let i = -AIM_STEPS; i <= AIM_STEPS; i++) {
		const angle = (i / AIM_STEPS) * MAX_AIM;
		const f = fly(g, angle);
		if (!f) continue;
		const had = out.get(f.cell);
		if (had === undefined || Math.abs(angle) < Math.abs(had)) out.set(f.cell, angle);
	}
	return out;
}

function touching(g: Grid, k: number, colour: number): number {
	const n = nbrs(g, k);
	let t = 0;
	for (let i = 0; i < n; i++) if (g.cells[NB[i]] === colour) t++;
	return t;
}

export interface Move {
	angle: number;
	cell: number;
	/** Bubbles this shot takes off the board, the shot itself included. 0 when it just sticks. */
	clears: number;
}

/**
 * The shot to play now. Clearing wins over everything; when nothing can come down the
 * bubble is parked against its own colour and as high as it will go, which is where next
 * turn's patch starts.
 */
export function bestMove(g: Grid, colour: number): Move | null {
	let best: Move | null = null;
	let bestScore = -Infinity;
	const before = countBubbles(g);
	const t: Grid = { cols: g.cols, rows: g.rows, cells: g.cells.slice() };
	for (const [cell, angle] of landings(g)) {
		t.cells.set(g.cells);
		applyShot(t, cell, colour);
		const clears = before - countBubbles(t) + 1;
		const row = rowOf(g, cell);
		const sc = clears > 0 ? 1e6 + clears * 100 - row : touching(g, cell, colour) * 40 - row;
		if (sc > bestScore) {
			bestScore = sc;
			best = { angle, cell, clears };
		}
	}
	return best;
}

/** Play a board out greedily. Returns the angles used, or null if it would not come down. */
export function solve(g0: Grid, seed: number, fromShot: number, budget: number): number[] | null {
	const g = cloneGrid(g0);
	const shots: number[] = [];
	while (countBubbles(g) > 0) {
		if (shots.length >= budget) return null;
		const colour = nextColour(g, seed, fromShot + shots.length);
		const mv = bestMove(g, colour);
		if (!mv) return null;
		applyShot(g, mv.cell, colour);
		shots.push(mv.angle);
	}
	return shots;
}

/* ---------------- dealing ---------------- */

export interface DiffLevel {
	label: string;
	cols: number;
	/** Rows filled at the start. */
	filled: number;
	colours: number;
	/** Patches of one colour the deal is painted from. More of them breaks the raft up. */
	blobs: number;
	/** Share of bubbles that ignore the patches and take any colour. */
	noise: number;
	/** Share of the last row left open, which is what gives the raft its pockets. */
	ragged: number;
	/** Shots the tier wants the board to take. The deal closest to it is the one kept. */
	wantPar: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', cols: 7, filled: 5, colours: 3, blobs: 4, noise: 0.15, ragged: 0.25, wantPar: 6 },
	moyen: { label: 'Moyen', cols: 8, filled: 6, colours: 4, blobs: 6, noise: 0.25, ragged: 0.3, wantPar: 10 },
	difficile: { label: 'Difficile', cols: 9, filled: 7, colours: 5, blobs: 8, noise: 0.35, ragged: 0.35, wantPar: 15 },
	expert: { label: 'Expert', cols: 10, filled: 8, colours: 6, blobs: 10, noise: 0.45, ragged: 0.4, wantPar: 21 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export interface BullesPuzzle {
	cols: number;
	rows: number;
	colours: number;
	/** The deal, row-major like `Grid.cells`. */
	cells: Int8Array;
	/** Drives the cannon's colour stream — see `nextColour`. */
	seed: number;
	/** Shots the solver needed. The board is proved by it, and graded against it. */
	par: number;
}

export const gridOf = (p: BullesPuzzle): Grid => ({ cols: p.cols, rows: p.rows, cells: p.cells.slice() });

/**
 * Colours are painted in patches, not sprinkled: a raft of singletons has to be parked
 * bubble by bubble, while a patch comes down in one shot and takes what it held with it.
 */
function dealBoard(diff: DiffLevel, rng: Rng): Grid {
	const rows = diff.filled + GROWTH;
	const g: Grid = { cols: diff.cols, rows, cells: new Int8Array(diff.cols * rows).fill(-1) };
	const seeds: { p: Pt; colour: number }[] = [];
	for (let i = 0; i < diff.blobs; i++) {
		const r = Math.floor(rng() * diff.filled);
		const c = Math.floor(rng() * rowLen(diff.cols, r));
		seeds.push({ p: centreOf(g, r * diff.cols + c), colour: i % diff.colours });
	}
	for (let r = 0; r < diff.filled; r++) {
		const len = rowLen(diff.cols, r);
		for (let c = 0; c < len; c++) {
			if (r === diff.filled - 1 && rng() < diff.ragged) continue;
			const k = r * diff.cols + c;
			if (rng() < diff.noise) {
				g.cells[k] = Math.floor(rng() * diff.colours);
				continue;
			}
			const p = centreOf(g, k);
			let bestD = Infinity;
			let colour = 0;
			for (const s of seeds) {
				const d = (p.x - s.p.x) ** 2 + (p.y - s.p.y) ** 2;
				if (d < bestD) {
					bestD = d;
					colour = s.colour;
				}
			}
			g.cells[k] = colour;
		}
	}
	return g;
}

/** Shots a solve may spend before the board counts as a dud. */
export const shotBudget = (bubbles: number, colours: number): number =>
	2 * (Math.ceil(bubbles / 3) + colours);

/** Boards a generation may go through. A dud is cheap; a solve is not. */
const DEALS = 12;

/**
 * Deal until a board comes down under the solver, keeping the one nearest the tier's target —
 * the same recipe can collapse in three shots or drag on for forty, so one deal proves nothing.
 */
export function generateBulles(diff: DiffLevel, rng: Rng = Math.random): BullesPuzzle {
	let best: BullesPuzzle | null = null;
	let bestOff = Infinity;
	for (let i = 0; i < DEALS; i++) {
		const g = dealBoard(diff, rng);
		const seed = Math.floor(rng() * 0x7fffffff);
		if (palette(g).length < diff.colours) continue;
		const shots = solve(g, seed, 0, shotBudget(countBubbles(g), diff.colours));
		if (!shots) continue;
		const off = Math.abs(shots.length - diff.wantPar);
		if (off >= bestOff) continue;
		bestOff = off;
		best = {
			cols: g.cols,
			rows: g.rows,
			colours: diff.colours,
			cells: g.cells.slice(),
			seed,
			par: shots.length,
		};
		if (off <= 1) break; // close enough; the rest of the deals are only cost
	}
	if (!best) throw new Error('bulles: no solvable deal');
	return best;
}
