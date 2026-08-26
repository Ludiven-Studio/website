/* =====================================================
   FEUILLES — pure engine.
   Autumn rains leaves on a small meadow. The finger draws wind currents: every cell it
   crosses gets an arrow that persists. Drawing over an existing stream CUTS it there —
   its downstream dissolves, its upstream pours into the new stroke, brooks merging into
   rivers. Every beat, each leaf rides the arrow of its cell toward the vortex that
   swallows it — and fresh leaves keep falling anywhere on the meadow. Reach the target
   count as fast as you can: the chrono is the score.
   Obstacles (rocks) take no arrow and stop the wind; the board is generated with every
   free cell 4-connected to the vortex, so no leaf can fall out of reach.
   ===================================================== */

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left

export const DR = [-1, 0, 1, 0] as const;
export const DC = [0, 1, 0, -1] as const;

export interface FeuillesBoard {
	n: number;
	rocks: boolean[]; // n*n — no arrow lands on a rock, no leaf crosses it
	vortex: number; // the collector cell
}

export interface Leaf {
	id: number;
	cell: number;
}

export interface FlowState {
	dirs: (Dir | null)[]; // the arrow each cell carries, latest stroke wins
	owner: (number | null)[]; // which stroke painted it
	strokes: Map<number, number[]>; // stroke id → its cells, upstream first
	nextId: number;
}

export interface GenParams {
	n: number;
	rocks: number;
	target: number; // leaves to collect — the win condition
	seed: number; // leaves already on the ground at the start
	spawnEvery: number; // beats between two falling leaves
}

export interface PaintResult {
	flow: FlowState;
	painted: boolean;
	dissolved: number[]; // cells whose arrows evaporated in the cut
}

export interface TickResult {
	leaves: Leaf[];
	moved: boolean;
	collected: Leaf[]; // swallowed this beat
}

/** Free play difficulty bands — small meadows, generous rain. */
export const FEUILLES_BANDS: GenParams[] = [
	{ n: 6, rocks: 5, target: 30, seed: 10, spawnEvery: 2 },
	{ n: 7, rocks: 8, target: 45, seed: 14, spawnEvery: 2 },
	{ n: 8, rocks: 12, target: 60, seed: 18, spawnEvery: 1 },
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
export function paint(b: FeuillesBoard, f: FlowState, id: number, cell: number, dir: Dir): PaintResult {
	if (b.rocks[cell] || cell === b.vortex) return { flow: f, painted: false, dissolved: [] };
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

/** One beat of wind: every leaf follows its cell's arrow, all at once. Leaves stack freely. */
export function tickLeaves(b: FeuillesBoard, dirs: (Dir | null)[], leaves: Leaf[]): TickResult {
	const out: Leaf[] = [];
	const collected: Leaf[] = [];
	let moved = false;
	for (const leaf of leaves) {
		const d = dirs[leaf.cell];
		if (d == null) {
			out.push(leaf);
			continue;
		}
		const r = Math.floor(leaf.cell / b.n) + DR[d];
		const q = (leaf.cell % b.n) + DC[d];
		if (r < 0 || r >= b.n || q < 0 || q >= b.n) {
			out.push(leaf);
			continue;
		}
		const t = r * b.n + q;
		if (b.rocks[t]) {
			out.push(leaf);
			continue;
		}
		moved = true;
		if (t === b.vortex) collected.push(leaf);
		else out.push({ ...leaf, cell: t });
	}
	return { leaves: out, moved, collected };
}

/** Fresh leaves fall on random free cells — piles welcome, ids keep counting up. */
export function spawnLeaves(
	rng: () => number,
	b: FeuillesBoard,
	count: number,
	nextId: number,
): { leaves: Leaf[]; nextId: number } {
	const free: number[] = [];
	for (let i = 0; i < b.n * b.n; i++) if (!b.rocks[i] && i !== b.vortex) free.push(i);
	const leaves: Leaf[] = [];
	for (let k = 0; k < count; k++) {
		leaves.push({ id: nextId++, cell: free[Math.floor(rng() * free.length)] });
	}
	return { leaves, nextId };
}

/** Every free cell can walk (4-connected, around rocks) to the vortex. */
export function allReachable(b: FeuillesBoard): boolean {
	const size = b.n * b.n;
	const seen = new Array<boolean>(size).fill(false);
	seen[b.vortex] = true;
	const queue = [b.vortex];
	while (queue.length) {
		const c = queue.pop() as number;
		for (let d = 0 as Dir; d < 4; d++) {
			const r = Math.floor(c / b.n) + DR[d];
			const q = (c % b.n) + DC[d];
			if (r < 0 || r >= b.n || q < 0 || q >= b.n) continue;
			const t = r * b.n + q;
			if (seen[t] || b.rocks[t]) continue;
			seen[t] = true;
			queue.push(t);
		}
	}
	for (let i = 0; i < size; i++) if (!b.rocks[i] && !seen[i]) return false;
	return true;
}

/** Deterministic in `rng`. Rocks are rejected until the meadow stays in one piece. */
export function generateBoard(rng: () => number, p: GenParams): FeuillesBoard {
	const size = p.n * p.n;
	for (let attempt = 0; attempt < 200; attempt++) {
		const vortex = (1 + Math.floor(rng() * (p.n - 2))) * p.n + 1 + Math.floor(rng() * (p.n - 2));
		const rocks = new Array<boolean>(size).fill(false);
		let left = p.rocks;
		let guard = 0;
		while (left > 0 && guard++ < 2000) {
			const i = Math.floor(rng() * size);
			if (rocks[i] || i === vortex) continue;
			rocks[i] = true;
			left--;
		}
		const b: FeuillesBoard = { n: p.n, rocks, vortex };
		if (left === 0 && allReachable(b)) return b;
	}
	throw new Error('feuilles: generation starved'); // 200 tries never all die in practice
}
