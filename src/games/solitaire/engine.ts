/* =====================================================
   SOLITAIRE À BILLES — pure peg-solitaire engine.
   A board is a set of holes with precomputed jump triples (from, over, to).
   A move jumps a peg over an adjacent peg into an empty hole 2 away; the
   jumped peg is removed. Goal: end with a single peg. Two boards share the
   same generic model — a square cross (English) and a triangle (diagonals).
   Deterministic, no RNG; a bounded DFS solver powers hints and tests.
   ===================================================== */

import { mulberry32 } from '../prng';

export type Variant = 'anglais' | 'triangle';

export interface Hole {
	x: number; // render coords (grid units; may be fractional for the triangle)
	y: number;
}
export interface Move {
	from: number;
	over: number;
	to: number;
}
export interface Layout {
	variant: Variant;
	holes: Hole[];
	jumps: Move[];
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	startEmpty: number;
	center: number; // "perfect" target hole (-1 if none)
}

export const VARIANTS: { key: Variant; label: string }[] = [
	{ key: 'anglais', label: 'Croix' },
	{ key: 'triangle', label: 'Triangle' },
];

const bounds = (holes: Hole[]): { minX: number; maxX: number; minY: number; maxY: number } => {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const h of holes) {
		minX = Math.min(minX, h.x);
		maxX = Math.max(maxX, h.x);
		minY = Math.min(minY, h.y);
		maxY = Math.max(maxY, h.y);
	}
	return { minX, maxX, minY, maxY };
};

/** English cross: 7×7 with 2×2 corners removed (33 holes), centre empty. */
function buildAnglais(): Layout {
	const ranges: [number, number][] = [
		[2, 4],
		[2, 4],
		[0, 6],
		[0, 6],
		[0, 6],
		[2, 4],
		[2, 4],
	];
	const idAt = new Map<string, number>();
	const holes: Hole[] = [];
	ranges.forEach((rg, r) => {
		for (let c = rg[0]; c <= rg[1]; c++) {
			idAt.set(`${r},${c}`, holes.length);
			holes.push({ x: c, y: r });
		}
	});
	const dirs = [
		[0, 1],
		[0, -1],
		[1, 0],
		[-1, 0],
	];
	const jumps: Move[] = [];
	ranges.forEach((rg, r) => {
		for (let c = rg[0]; c <= rg[1]; c++) {
			const from = idAt.get(`${r},${c}`)!;
			for (const [dr, dc] of dirs) {
				const over = idAt.get(`${r + dr},${c + dc}`);
				const to = idAt.get(`${r + 2 * dr},${c + 2 * dc}`);
				if (over != null && to != null) jumps.push({ from, over, to });
			}
		}
	});
	return { variant: 'anglais', holes, jumps, ...bounds(holes), startEmpty: idAt.get('3,3')!, center: idAt.get('3,3')! };
}

/** Triangle: rows 0..size-1 (15 holes for size 5), apex empty; jumps on 3 axes. */
function buildTriangle(size = 5): Layout {
	const idAt = new Map<string, number>();
	const holes: Hole[] = [];
	for (let r = 0; r < size; r++) {
		for (let i = 0; i <= r; i++) {
			idAt.set(`${r},${i}`, holes.length);
			holes.push({ x: i - r / 2, y: r });
		}
	}
	const dirs = [
		[0, 1],
		[0, -1],
		[1, 0],
		[-1, 0],
		[1, 1],
		[-1, -1],
	];
	const jumps: Move[] = [];
	for (let r = 0; r < size; r++) {
		for (let i = 0; i <= r; i++) {
			const from = idAt.get(`${r},${i}`)!;
			for (const [dr, di] of dirs) {
				const over = idAt.get(`${r + dr},${i + di}`);
				const to = idAt.get(`${r + 2 * dr},${i + 2 * di}`);
				if (over != null && to != null) jumps.push({ from, over, to });
			}
		}
	}
	return { variant: 'triangle', holes, jumps, ...bounds(holes), startEmpty: idAt.get('0,0')!, center: -1 };
}

export function createLayout(variant: Variant): Layout {
	return variant === 'triangle' ? buildTriangle() : buildAnglais();
}

/** All holes filled except the board's starting empty hole. */
export function initialPegs(layout: Layout): boolean[] {
	const pegs = layout.holes.map(() => true);
	pegs[layout.startEmpty] = false;
	return pegs;
}

export const pegCount = (pegs: boolean[]): number => pegs.reduce((n, p) => n + (p ? 1 : 0), 0);
export const isWin = (pegs: boolean[]): boolean => pegCount(pegs) === 1;

const legal = (pegs: boolean[], m: Move): boolean => pegs[m.from] && pegs[m.over] && !pegs[m.to];

/** Valid moves whose peg starts at `from`. */
export function movesFrom(layout: Layout, pegs: boolean[], from: number): Move[] {
	return layout.jumps.filter((m) => m.from === from && legal(pegs, m));
}

/** Every valid move in the current position. */
export function allMoves(layout: Layout, pegs: boolean[]): Move[] {
	return layout.jumps.filter((m) => legal(pegs, m));
}

export const isStuck = (layout: Layout, pegs: boolean[]): boolean => allMoves(layout, pegs).length === 0;

/** Apply a move, returning a new pegs array (immutable). */
export function applyMove(pegs: boolean[], m: Move): boolean[] {
	const next = pegs.slice();
	next[m.from] = false;
	next[m.over] = false;
	next[m.to] = true;
	return next;
}

const keyOf = (pegs: boolean[]): string => {
	let s = '';
	for (const p of pegs) s += p ? '1' : '0';
	return s;
};

/**
 * Bounded DFS: finds a full winning sequence (down to one peg) or null once the
 * node budget is spent. Dedupes visited positions so it converges fast late-game.
 */
export function solve(layout: Layout, pegs: boolean[], budget = 120000): Move[] | null {
	let nodes = 0;
	const dead = new Set<string>();
	const dfs = (state: boolean[]): Move[] | null => {
		if (pegCount(state) === 1) return [];
		if (nodes++ > budget) return null;
		const k = keyOf(state);
		if (dead.has(k)) return null;
		for (const m of allMoves(layout, state)) {
			const rest = dfs(applyMove(state, m));
			if (rest) return [m, ...rest];
		}
		dead.add(k);
		return null;
	};
	return dfs(pegs);
}

/** A helpful hint: a move that keeps the board solvable if one exists, else any legal move. */
export function hintMove(layout: Layout, pegs: boolean[]): Move | null {
	const sol = solve(layout, pegs);
	if (sol && sol.length) return sol[0];
	return allMoves(layout, pegs)[0] ?? null;
}

/* ---------- Daily puzzle: small, uniquely-solvable positions ---------- */

/** Legal *backward* moves: a peg at `to` un-jumps, spawning pegs at `over` and `from`. */
export function reverseMoves(layout: Layout, pegs: boolean[]): Move[] {
	return layout.jumps.filter((m) => pegs[m.to] && !pegs[m.over] && !pegs[m.from]);
}
export function applyReverse(pegs: boolean[], m: Move): boolean[] {
	const next = pegs.slice();
	next[m.to] = false;
	next[m.over] = true;
	next[m.from] = true;
	return next;
}

/**
 * Number of *distinct* solutions up to move order, capped. Two sequences that only
 * reorder independent (commuting) jumps count as one — that's what "unique" means to
 * a player. Decoy lines that dead-end contribute nothing; dead positions are memoised.
 */
export function solutionSignatures(layout: Layout, pegs: boolean[], cap = 2): number {
	const sigs = new Set<string>();
	const dead = new Set<string>();
	const path: string[] = [];
	let stop = false;
	const dfs = (state: boolean[]): void => {
		if (stop) return;
		if (pegCount(state) === 1) {
			sigs.add([...path].sort().join('|'));
			if (sigs.size >= cap) stop = true;
			return;
		}
		const k = keyOf(state);
		if (dead.has(k)) return;
		const before = sigs.size;
		for (const m of allMoves(layout, state)) {
			path.push(`${m.from}-${m.over}-${m.to}`);
			dfs(applyMove(state, m));
			path.pop();
			if (stop) return;
		}
		if (sigs.size === before) dead.add(k); // fully explored, no solution below
	};
	dfs(pegs);
	return sigs.size;
}

/** True when the position has exactly one solution (ignoring reordering of independent jumps). */
export const hasUniqueSolution = (layout: Layout, pegs: boolean[]): boolean => solutionSignatures(layout, pegs, 2) === 1;

/*
 * Note: tiny peg-solitaire positions are mathematically "loose" — they essentially always
 * admit several distinct solutions (measured: ~0% are strictly unique for 5–7 pegs, even up
 * to board symmetry). So the daily can't be truly unique; instead it picks the *tightest*
 * solvable position it can find (fewest distinct solutions) and races the player on time.
 */

/**
 * Deterministic daily start: a small, always-solvable position (`count` pegs) on the English
 * board, chosen as the *tightest* found in a seeded sample — the fewest distinct solutions, so
 * most first moves are traps and the player must find the real line fast. Built by walking
 * backwards from a single central peg (guarantees a solution ending on the centre).
 */
export function generateDaily(seed: number, count = 6): boolean[] {
	const layout = createLayout('anglais');
	const rng = mulberry32(seed >>> 0);
	const target = Math.max(3, Math.min(count, 10));
	let best: boolean[] | null = null;
	let bestSig = Infinity;
	for (let n = 0; n < 220 && bestSig > 1; n++) {
		let pegs = layout.holes.map(() => false);
		pegs[layout.center] = true;
		let ok = true;
		for (let s = 0; s < target - 1; s++) {
			const rm = reverseMoves(layout, pegs);
			if (rm.length === 0) {
				ok = false;
				break;
			}
			pegs = applyReverse(pegs, rm[Math.floor(rng() * rm.length)]);
		}
		if (!ok || pegCount(pegs) !== target) continue;
		const sig = solutionSignatures(layout, pegs, 8);
		if (sig < bestSig) {
			bestSig = sig;
			best = pegs;
		}
	}
	return best ?? initialPegs(layout);
}
