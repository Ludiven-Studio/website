/**
 * CORDES (untangle-free routing) — pure engine (no UI).
 * Join every pair of pegs with a hand-drawn rope. Ropes stay inside the frame, never cross
 * — neither each other nor themselves — and keep their distance from every foreign peg.
 *
 * All pegs are loose inside the board; the puzzle comes from the clearance rule. A rope may
 * not come within CLEAR peg-radii of a foreign peg, so two pegs close together shut the
 * passage between them, and a peg close to the frame shuts the passage along the wall.
 * Difficulty is built from that:
 *  - each peg paired with a far-away partner, so the straight lines all cross;
 *  - on the hard tiers a "fence": a chain of pegs marching in from one edge, every gap
 *    shut — the only way past is round its inner tip.
 *
 * Boards are dealt at random and solved on a raster. Disjoint 4-connected BFS paths can
 * never cross, so the routing is honest: the solve both proves the board solvable and
 * measures how far each rope is dragged past its straight line. Deals are redrawn until
 * enough ropes need a real detour, and the winning routes, smoothed, become the board's
 * own answer for hints.
 */

import type { Rng } from '../prng';

export interface Pt {
	x: number;
	y: number;
}

export interface DiffLevel {
	label: string;
	/** How many pairs of pegs. */
	ropes: number;
	/** Board scale — only drives the peg radius. */
	cols: number;
	rows: number;
	/** Pair each peg with the farthest free one instead of at random. */
	far: boolean;
	/** Pegs in the fence chain (0 or an even count — see `fenceChain`). */
	fence: number;
	/** How many ropes must be forced at least 30% past their straight line. */
	hard: number;
}

/** A rope must stay this many peg radii away from a foreign peg. */
export const CLEAR = 1.6;

/** Frame side for a rope count — keeps the peg radius shrinking as the crowd grows. */
export const frameFor = (ropes: number): number => ropes + 2;

/** Far pairing from four ropes up; three random pairs are enough of a first step. */
export const farFor = (ropes: number): boolean => ropes >= 4;

/**
 * Fence size for a rope count. A fence spends half its links on ropes of its own, so it
 * only pays from six ropes up; shorter chains die on the minimum pair distance.
 */
export const fenceFor = (ropes: number): number => (ropes >= 6 ? 6 : 0);

/** Detour target: half the ropes should refuse the ruler. Measured, each tier reaches it. */
export const hardFor = (ropes: number): number => Math.floor(ropes / 2);

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', ropes: 3, cols: 5, rows: 5, far: false, fence: 0, hard: 1 },
	moyen: { label: 'Moyen', ropes: 4, cols: 6, rows: 6, far: true, fence: 0, hard: 2 },
	difficile: { label: 'Difficile', ropes: 6, cols: 8, rows: 8, far: true, fence: 6, hard: 3 },
	expert: { label: 'Expert', ropes: 8, cols: 10, rows: 10, far: true, fence: 6, hard: 4 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export interface CordesPuzzle {
	ropes: number;
	/** The two pegs of each rope, in the unit square. */
	ends: [Pt, Pt][];
	/** One non-crossing route per rope — the board's own answer, kept for hints. */
	solution: Pt[][];
	/** Peg radius, in unit-square units. Ropes stay CLEAR radii away from foreign pegs. */
	pegR: number;
	/** Per rope, how far the solve was pushed past the straight line (1 = ruler). */
	detours: number[];
}

/** Twice the signed area of (o, a, b) — positive when the turn is counter-clockwise. */
const turn = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * True only when the two segments properly cross. Touching ends and overlaps count as
 * clear, which is the forgiving reading a finger-drawn rope needs.
 */
export function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
	const d1 = turn(c, d, a);
	const d2 = turn(c, d, b);
	const d3 = turn(a, b, c);
	const d4 = turn(a, b, d);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Distance from `p` to segment `ab`. */
export function distToSeg(p: Pt, a: Pt, b: Pt): number {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
	return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Does segment `ab` cross any segment of `path`? `skipTail` ignores the path's last joints. */
export function segHitsPath(a: Pt, b: Pt, path: Pt[], skipTail = 0): boolean {
	for (let i = 0; i < path.length - 1 - skipTail; i++) {
		if (segCross(a, b, path[i], path[i + 1])) return true;
	}
	return false;
}

export function pathsCross(p: Pt[], q: Pt[]): boolean {
	for (let i = 0; i < p.length - 1; i++) {
		if (segHitsPath(p[i], p[i + 1], q)) return true;
	}
	return false;
}

/** A rope that loops over itself. Neighbouring joints share a point, so they never count. */
export function selfCrosses(path: Pt[]): boolean {
	for (let i = 0; i < path.length - 1; i++) {
		for (let j = i + 2; j < path.length - 1; j++) {
			if (segCross(path[i], path[i + 1], path[j], path[j + 1])) return true;
		}
	}
	return false;
}

export const inBox = (p: Pt): boolean => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Pegs the rope `rope` must keep clear of — every peg except its own two. */
export function hitsForeignPeg(path: Pt[], rope: number, p: CordesPuzzle): boolean {
	const rr = p.pegR * CLEAR;
	for (let r = 0; r < p.ends.length; r++) {
		if (r === rope) continue;
		for (const peg of p.ends[r]) {
			for (let i = 0; i < path.length - 1; i++) {
				if (distToSeg(peg, path[i], path[i + 1]) < rr) return true;
			}
		}
	}
	return false;
}

const near = (a: Pt, b: Pt, r: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/**
 * Why `rope` cannot be accepted as drawn, or null when it is fine. `others` are the ropes
 * already on the board.
 */
export function ropeFault(path: Pt[], rope: number, others: (Pt[] | null)[], p: CordesPuzzle): string | null {
	if (path.length < 2) return 'trop court';
	const [a, b] = p.ends[rope];
	const okEnds = (near(path[0], a, p.pegR) && near(path[path.length - 1], b, p.pegR))
		|| (near(path[0], b, p.pegR) && near(path[path.length - 1], a, p.pegR));
	if (!okEnds) return 'ne relie pas ses deux piquets';
	if (!path.every(inBox)) return 'sort du cadre';
	if (selfCrosses(path)) return 'se croise elle-même';
	if (hitsForeignPeg(path, rope, p)) return 'passe trop près d’un piquet';
	for (let r = 0; r < others.length; r++) {
		const o = others[r];
		if (r === rope || !o) continue;
		if (pathsCross(path, o)) return 'croise une autre corde';
	}
	return null;
}

export function isSolved(ropes: (Pt[] | null)[], p: CordesPuzzle): boolean {
	if (ropes.length < p.ropes) return false;
	for (let r = 0; r < p.ropes; r++) {
		const path = ropes[r];
		if (!path || ropeFault(path, r, ropes, p) !== null) return false;
	}
	return true;
}

/** Corner-cutting. New points sit on the old segments, so a smoothed route never leaves its corridor. */
function chaikin(pts: Pt[], rounds: number): Pt[] {
	let out = pts;
	for (let n = 0; n < rounds && out.length >= 3; n++) {
		const next: Pt[] = [out[0]];
		for (let i = 0; i < out.length - 1; i++) {
			const a = out[i];
			const b = out[i + 1];
			next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
			next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
		}
		next.push(out[out.length - 1]);
		out = next;
	}
	return out;
}

/* ---------------- raster solve ---------------- */

/** Raster side. Three-plus cells under the smallest clearance radius keeps corridors honest. */
const G = 96;

/**
 * Extra clearance carved around pegs during generation, in cells. Routes are thinned and
 * smoothed afterwards, which can cut a corner by up to ~0.7 cell; the margin keeps the
 * finished curve strictly clear of the real limit.
 */
const MARGIN = 1.2;

const xi = (c: number): number => c % G;
const yi = (c: number): number => Math.floor(c / G);
const cellOf = (p: Pt): number => {
	const x = Math.min(G - 1, Math.max(0, Math.round(p.x * G - 0.5)));
	const y = Math.min(G - 1, Math.max(0, Math.round(p.y * G - 0.5)));
	return y * G + x;
};

/** Cells rope `rope` may not enter: near a foreign peg, plus `extra` (already-routed ropes). */
function blocksFor(ends: [Pt, Pt][], rope: number, pegR: number, extra?: Uint8Array): Uint8Array {
	const blocked = extra ? Uint8Array.from(extra) : new Uint8Array(G * G);
	const rr = CLEAR * pegR + MARGIN / G;
	for (let r = 0; r < ends.length; r++) {
		if (r === rope) continue;
		for (const peg of ends[r]) {
			const x0 = Math.max(0, Math.floor((peg.x - rr) * G - 0.5));
			const x1 = Math.min(G - 1, Math.ceil((peg.x + rr) * G - 0.5));
			const y0 = Math.max(0, Math.floor((peg.y - rr) * G - 0.5));
			const y1 = Math.min(G - 1, Math.ceil((peg.y + rr) * G - 0.5));
			for (let y = y0; y <= y1; y++) {
				for (let x = x0; x <= x1; x++) {
					const cx = (x + 0.5) / G;
					const cy = (y + 0.5) / G;
					if (Math.hypot(cx - peg.x, cy - peg.y) < rr) blocked[y * G + x] = 1;
				}
			}
		}
	}
	for (const peg of ends[rope]) blocked[cellOf(peg)] = 0;
	return blocked;
}

function bfs(blocked: Uint8Array, s: number, e: number): number[] | null {
	if (blocked[s] || blocked[e]) return null;
	const prev = new Int32Array(G * G).fill(-2);
	prev[s] = -1;
	const queue = new Int32Array(G * G);
	queue[0] = s;
	let head = 0;
	let tail = 1;
	while (head < tail) {
		const cur = queue[head++];
		if (cur === e) break;
		const x = xi(cur);
		const y = yi(cur);
		for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || nx >= G || ny < 0 || ny >= G) continue;
			const n = ny * G + nx;
			if (blocked[n] || prev[n] !== -2) continue;
			prev[n] = cur;
			queue[tail++] = n;
		}
	}
	if (prev[e] === -2) return null;
	const out: number[] = [];
	for (let c = e; c >= 0; c = prev[c]) out.push(c);
	return out.reverse();
}

const manhattan = (s: number, e: number): number => Math.abs(xi(s) - xi(e)) + Math.abs(yi(s) - yi(e));

interface Solve {
	/** Per rope, route length over the straight peg-to-peg distance (both in L1, so it cancels). */
	detours: number[];
	routes: number[][];
}

/**
 * Route every rope, trying several orders — each placed route walls the later ones in.
 * The first order routes the most constrained ropes first, the rest are shuffles.
 */
function solveBoard(ends: [Pt, Pt][], pegR: number, rng: Rng): Solve | null {
	const floor = ends.map(([a, z], r) => {
		const path = bfs(blocksFor(ends, r, pegR), cellOf(a), cellOf(z));
		return path ? (path.length - 1) / Math.max(1, manhattan(cellOf(a), cellOf(z))) : null;
	});
	if (floor.some((d) => d === null)) return null;
	const orders: number[][] = [ends.map((_, r) => r).sort((p, q) => floor[q]! - floor[p]!)];
	for (let k = 0; k < 11; k++) {
		const o = ends.map((_, r) => r);
		for (let i = o.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[o[i], o[j]] = [o[j], o[i]];
		}
		orders.push(o);
	}
	for (const order of orders) {
		const walls = new Uint8Array(G * G);
		const detours: number[] = Array(ends.length).fill(1);
		const routes: number[][] = Array(ends.length);
		let ok = true;
		for (const r of order) {
			const s = cellOf(ends[r][0]);
			const e = cellOf(ends[r][1]);
			const path = bfs(blocksFor(ends, r, pegR, walls), s, e);
			if (!path) {
				ok = false;
				break;
			}
			detours[r] = (path.length - 1) / Math.max(1, manhattan(s, e));
			routes[r] = path;
			for (const c of path) walls[c] = 1;
		}
		if (ok) return { detours, routes };
	}
	return null;
}

/* ---------------- dealing ---------------- */

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Pegs any closer than this, in radii, read as shut by the clearance rule on purpose. */
const minGapFor = (pegR: number): number => (CLEAR + 0.45) * pegR;

/**
 * How far scattered pegs keep from the frame, in radii. Wide of the clearance radius, so
 * the wall-side corridor is always comfortable — only the fence is allowed to seal a wall.
 */
const EDGE = 3.2;

/** Draw pegs one by one, each at least `minGap` from all placed ones. */
function scatter(rng: Rng, count: number, minGap: number, placed: Pt[], margin: number): Pt[] {
	const out: Pt[] = [];
	for (let i = 0; i < count; i++) {
		for (let t = 0; t < 400; t++) {
			const p = { x: margin + rng() * (1 - 2 * margin), y: margin + rng() * (1 - 2 * margin) };
			if ([...placed, ...out].every((q) => dist(p, q) >= minGap)) {
				out.push(p);
				break;
			}
		}
	}
	return out;
}

/**
 * The fence: a chain of pegs marching in from near one edge. The first peg sits within the
 * clearance radius of the frame — sealed, not touching — and every gap along the chain is
 * shut (over the visual minimum, under twice the clearance radius). Chain pegs pair with
 * the peg half a chain away so their own ropes stay long enough to be worth drawing.
 */
function fenceChain(rng: Rng, pegR: number, links: number): Pt[] | null {
	const side = Math.floor(rng() * 4);
	const along = 0.25 + rng() * 0.5;
	const off = pegR * (1.15 + rng() * 0.3);
	const start: Pt = side === 0 ? { x: along, y: off } : side === 1 ? { x: along, y: 1 - off }
		: side === 2 ? { x: off, y: along } : { x: 1 - off, y: along };
	const chain: Pt[] = [start];
	let dir = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI;
	for (let i = 1; i < links; i++) {
		dir += (rng() - 0.5) * 1.2;
		const gap = pegR * (2.3 + rng() * (2 * CLEAR - 0.3 - 2.3));
		const prev = chain[i - 1];
		const p = { x: prev.x + Math.cos(dir) * gap, y: prev.y + Math.sin(dir) * gap };
		// A chain that wanders back to a wall would seal it and cut the board in two.
		if (p.x < EDGE * pegR || p.x > 1 - EDGE * pegR || p.y < EDGE * pegR || p.y > 1 - EDGE * pegR) return null;
		chain.push(p);
	}
	const half = links / 2;
	for (let i = 0; i < half; i++) if (dist(chain[i], chain[i + half]) < 6 * pegR) return null;
	return chain;
}

/** One random board: fence first (hard tiers), the rest scattered and paired. */
function deal(diff: DiffLevel, rng: Rng, pegR: number): [Pt, Pt][] | null {
	const ends: [Pt, Pt][] = [];
	let placed: Pt[] = [];
	if (diff.fence) {
		const chain = fenceChain(rng, pegR, diff.fence);
		if (!chain) return null;
		const half = diff.fence / 2;
		for (let i = 0; i < half; i++) ends.push([chain[i], chain[i + half]]);
		placed = chain;
	}
	const need = 2 * (diff.ropes - ends.length);
	const pegs = scatter(rng, need, minGapFor(pegR), placed, EDGE * pegR);
	if (pegs.length < need) return null;
	if (diff.far) {
		// Long chords cross a lot: each peg takes the farthest partner still free.
		const pool = new Set(pegs.map((_, i) => i));
		while (pool.size) {
			const a = [...pool][Math.floor(rng() * pool.size)];
			pool.delete(a);
			let far = -1;
			for (const b of pool) if (far < 0 || dist(pegs[a], pegs[b]) > dist(pegs[a], pegs[far])) far = b;
			pool.delete(far);
			ends.push([pegs[a], pegs[far]]);
		}
	} else {
		const order = pegs.map((_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		for (let i = 0; 2 * i < order.length; i++) ends.push([pegs[order[2 * i]], pegs[order[2 * i + 1]]]);
	}
	// Two pegs of a pair closer than three widths read as a pair nobody has to think about.
	if (ends.some(([a, b]) => dist(a, b) < 6 * pegR)) return null;
	return ends;
}

/** Cell path → smooth curve pinned on the exact pegs. Thinning halves the staircase first. */
function toRoute(cells: number[], a: Pt, b: Pt): Pt[] {
	const pts = cells
		.filter((_, i) => i % 2 === 0 || i === cells.length - 1)
		.map((c) => ({ x: (xi(c) + 0.5) / G, y: (yi(c) + 0.5) / G }));
	const out = chaikin(pts, 2);
	out[0] = a;
	out[out.length - 1] = b;
	return out;
}

/** A rope counts as hard once its route runs 30% past the straight line. */
const HARD = 1.3;
/** Boards a generation may go through. Reaching the tier's target usually takes far fewer. */
const DEALS = 48;

/**
 * Deal and solve until `hard` ropes are forced off their straight line, keeping the best
 * board seen. The solve is the guarantee of solvability — its routes become the solution.
 */
export function generateCordes(diff: DiffLevel, rng: Rng = Math.random): CordesPuzzle {
	const pegR = 0.3 / Math.max(diff.cols, diff.rows);
	let best: CordesPuzzle | null = null;
	let bestScore = -1;
	// Duds (fence out of frame, unplaceable pegs, no route) are cheap; the extended budget
	// only exists so an unlucky run still returns a board.
	for (let i = 0; i < DEALS * 4 && (best === null || (i < DEALS && bestScore < diff.hard * 16)); i++) {
		const ends = deal(diff, rng, pegR);
		if (!ends) continue;
		const sol = solveBoard(ends, pegR, rng);
		if (!sol) continue;
		const solution = sol.routes.map((cells, r) => toRoute(cells, ends[r][0], ends[r][1]));
		const p: CordesPuzzle = { ropes: ends.length, ends, solution, pegR, detours: sol.detours };
		if (!isSolved(solution, p)) continue;
		const hard = sol.detours.filter((d) => d >= HARD).length;
		const score = hard * 16 + sol.detours.reduce((s, d) => s + d, 0) / sol.detours.length;
		if (score > bestScore) {
			best = p;
			bestScore = score;
		}
	}
	if (!best) throw new Error('cordes: no solvable deal');
	return best;
}

export interface CordesHint {
	rope: number;
	path: Pt[];
}

/** Draw in the first rope still missing, using the board's own route. */
export function findHint(ropes: (Pt[] | null)[], p: CordesPuzzle): CordesHint | null {
	for (let r = 0; r < p.ropes; r++) {
		const path = ropes[r];
		if (!path || ropeFault(path, r, ropes, p) !== null) return { rope: r, path: p.solution[r] };
	}
	return null;
}

/**
 * Lay the hinted route down and rub out whatever was in its way. Board routes never cross
 * each other, so only the player's own ropes can be cleared — each hint therefore fixes one
 * more rope for good and repeated hints finish the board.
 */
export function applyHint(ropes: (Pt[] | null)[], hint: CordesHint, p: CordesPuzzle): (Pt[] | null)[] {
	const next: (Pt[] | null)[] = [];
	for (let r = 0; r < p.ropes; r++) next.push(ropes[r] ?? null);
	next[hint.rope] = hint.path;
	for (let r = 0; r < p.ropes; r++) {
		const o = next[r];
		if (r === hint.rope || !o) continue;
		if (pathsCross(o, hint.path)) next[r] = null;
	}
	return next;
}
