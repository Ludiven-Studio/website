import { DR, DC, type Dir } from './engine';

/* =====================================================
   SOUFFLE, leaves mode — pure engine.
   The finger draws wind currents on the meadow: every cell it crosses gets an arrow.
   Currents persist and accumulate; drawing over an existing stream CUTS it there —
   its downstream arrows dissolve, its upstream now pours into the new stroke, like
   brooks joining a river. Every leaf rides the arrow of its cell, one cell per beat,
   until an arrowless cell strands it or the vortex swallows it. Collect all the leaves.
   Solvable by construction: a current tree is grown backward from the vortex and the
   leaves are seeded on its branches — the tree is the shipped solution.
   ===================================================== */

export interface LeavesPuzzle {
	n: number;
	rocks: boolean[]; // n*n — nothing is drawn on a rock, nothing crosses it
	vortex: number; // the collector cell
	leaves: number[]; // starting cells, distinct
	solution: (Dir | null)[]; // arrows that carry every leaf home
	par: number; // cells of the solution — the breath it costs
}

export interface FlowState {
	dirs: (Dir | null)[]; // the arrow each cell carries, latest stroke wins
	owner: (number | null)[]; // which stroke painted it
	strokes: Map<number, number[]>; // stroke id → its cells, upstream first
	nextId: number;
}

export interface GenParams {
	n: number;
	leaves: number;
	rocks: number;
	branches: number; // size of the current tree the leaves are seeded on
}

export interface PaintResult {
	flow: FlowState;
	painted: boolean;
	dissolved: number[]; // cells whose arrows evaporated in the cut
}

export interface TickResult {
	leaves: number[]; // position per leaf, -1 once collected
	moved: boolean;
	collected: number[]; // leaf indices swallowed this beat
}

/** Free play difficulty bands. */
export const LEAVES_BANDS: GenParams[] = [
	{ n: 7, leaves: 5, rocks: 4, branches: 20 },
	{ n: 9, leaves: 8, rocks: 7, branches: 34 },
	{ n: 11, leaves: 11, rocks: 10, branches: 52 },
];

export const emptyFlow = (n: number): FlowState => ({
	dirs: new Array<Dir | null>(n * n).fill(null),
	owner: new Array<number | null>(n * n).fill(null),
	strokes: new Map(),
	nextId: 1,
});

/** A new stroke begins — reserves its id. */
export function startStroke(f: FlowState): { flow: FlowState; id: number } {
	const strokes = new Map(f.strokes);
	strokes.set(f.nextId, []);
	return { flow: { ...f, strokes, nextId: f.nextId + 1 }, id: f.nextId };
}

/** One arrow along the finger's path. Pure — the old flow is untouched. */
export function paint(p: LeavesPuzzle, f: FlowState, id: number, cell: number, dir: Dir): PaintResult {
	if (p.rocks[cell] || cell === p.vortex) return { flow: f, painted: false, dissolved: [] };
	if (f.owner[cell] === id && f.dirs[cell] === dir) return { flow: f, painted: false, dissolved: [] }; // finger jitter
	const dirs = f.dirs.slice();
	const owner = f.owner.slice();
	const strokes = new Map(f.strokes);
	const dissolved: number[] = [];
	const old = owner[cell];
	if (old != null) {
		// The cut: the crossed stroke keeps its upstream, everything from here on dissolves.
		const cells = strokes.get(old) ?? [];
		const at = cells.indexOf(cell);
		for (const c of cells.slice(at)) {
			dirs[c] = null;
			owner[c] = null;
			if (c !== cell) dissolved.push(c);
		}
		strokes.set(old, cells.slice(0, at));
	}
	dirs[cell] = dir;
	owner[cell] = id;
	strokes.set(id, [...(strokes.get(id) ?? []), cell]);
	return { flow: { ...f, dirs, owner, strokes }, painted: true, dissolved };
}

/** One beat of wind: every leaf follows its cell's arrow, all at once. Leaves never collide. */
export function tickLeaves(p: LeavesPuzzle, dirs: (Dir | null)[], leaves: number[]): TickResult {
	const out = leaves.slice();
	const collected: number[] = [];
	let moved = false;
	leaves.forEach((c, i) => {
		if (c < 0) return;
		const d = dirs[c];
		if (d == null) return;
		const r = Math.floor(c / p.n) + DR[d];
		const q = (c % p.n) + DC[d];
		if (r < 0 || r >= p.n || q < 0 || q >= p.n) return;
		const t = r * p.n + q;
		if (p.rocks[t]) return;
		moved = true;
		if (t === p.vortex) {
			out[i] = -1;
			collected.push(i);
		} else {
			out[i] = t;
		}
	});
	return { leaves: out, moved, collected };
}

export const allCollected = (leaves: number[]): boolean => leaves.every((c) => c < 0);

/** Deterministic in `rng`. Grows a current tree backward from the vortex (each new cell's
    arrow points at its parent), seeds the leaves on deep branches, then keeps as solution
    only the arrows the leaves actually ride — their union is the par. */
export function generateLeaves(rng: () => number, p: GenParams): LeavesPuzzle {
	const size = p.n * p.n;
	for (let attempt = 0; attempt < 60; attempt++) {
		const vortex = (1 + Math.floor(rng() * (p.n - 2))) * p.n + 1 + Math.floor(rng() * (p.n - 2));
		const toward = new Array<Dir | null>(size).fill(null);
		const inTree = new Array<boolean>(size).fill(false);
		inTree[vortex] = true;
		const cells = [vortex];
		let guard = 0;
		while (cells.length < p.branches && guard++ < 4000) {
			// Growing from the last cell most of the time makes long winding brooks, not fuzz.
			const t = rng() < 0.6 ? cells[cells.length - 1] : cells[Math.floor(rng() * cells.length)];
			const d = Math.floor(rng() * 4) as Dir;
			const ur = Math.floor(t / p.n) - DR[d];
			const uc = (t % p.n) - DC[d];
			if (ur < 0 || ur >= p.n || uc < 0 || uc >= p.n) continue;
			const u = ur * p.n + uc;
			if (inTree[u]) continue;
			inTree[u] = true;
			toward[u] = d;
			cells.push(u);
		}
		if (cells.length < p.branches) continue;

		const depthOf = (c: number): number => {
			let k = 0;
			while (c !== vortex) {
				c = c + DR[toward[c] as Dir] * p.n + DC[toward[c] as Dir];
				k++;
			}
			return k;
		};
		const pool = cells.filter((c) => c !== vortex && depthOf(c) >= 2);
		if (pool.length < p.leaves) continue;
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		const leaves = pool.slice(0, p.leaves);

		const solution = new Array<Dir | null>(size).fill(null);
		for (let c of leaves) {
			while (c !== vortex) {
				solution[c] = toward[c];
				c = c + DR[toward[c] as Dir] * p.n + DC[toward[c] as Dir];
			}
		}
		const par = solution.filter((d) => d != null).length;

		const rocks = new Array<boolean>(size).fill(false);
		let left = p.rocks;
		guard = 0;
		while (left > 0 && guard++ < 4000) {
			const i = Math.floor(rng() * size);
			if (rocks[i] || solution[i] != null || i === vortex) continue;
			rocks[i] = true;
			left--;
		}
		if (left > 0) continue;

		return { n: p.n, rocks, vortex, leaves, solution, par };
	}
	throw new Error('leaves: generation starved'); // 60 tries never all die in practice
}
