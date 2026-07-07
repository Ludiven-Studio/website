/* =====================================================
   SOLITAIRE À BILLES — pure peg-solitaire engine.
   A board is a set of holes with precomputed jump triples (from, over, to).
   A move jumps a peg over an adjacent peg into an empty hole 2 away; the
   jumped peg is removed. Goal: end with a single peg. Two boards share the
   same generic model — a square cross (English) and a triangle (diagonals).
   Deterministic, no RNG; a bounded DFS solver powers hints and tests.
   ===================================================== */

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
