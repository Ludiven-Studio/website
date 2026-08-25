/* =====================================================
   SOUFFLE — pure engine.
   A feather rests on a meadow grid. One gust sends it gliding in a straight line until
   the first rock (or the hedge around the board) stops it, and it brushes every flower
   it crosses, landing cell included. Clear all the flowers in as few gusts as possible.
   Solvable by construction: the flowers are dropped on a recorded walk of the feather,
   and replaying that walk is the shipped solution.
   ===================================================== */

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left

export const DR = [-1, 0, 1, 0] as const;
export const DC = [0, 1, 0, -1] as const;

export interface SoufflePuzzle {
	n: number;
	rocks: boolean[]; // n*n — a rock fills its cell, nothing crosses it
	flowers: boolean[]; // n*n — where the flowers start
	start: number; // the feather's cell
	par: number; // gusts of the recorded solution
	walk: Dir[]; // the solution itself: replaying it clears every flower
}

export interface SouffleState {
	pos: number;
	flowers: boolean[];
	gusts: number;
}

export interface GenParams {
	n: number;
	rocks: number;
	flowers: number;
	gusts: number; // length of the recorded walk the flowers are dropped on
}

/** Free play difficulty bands. */
export const SOUFFLE_BANDS: GenParams[] = [
	{ n: 7, rocks: 6, flowers: 4, gusts: 10 },
	{ n: 9, rocks: 10, flowers: 6, gusts: 16 },
	{ n: 11, rocks: 15, flowers: 8, gusts: 24 },
];

/** Every cell the feather crosses, landing cell last. Empty when the very first cell is blocked. */
export function glide(n: number, rocks: boolean[], from: number, dir: Dir): number[] {
	const path: number[] = [];
	let r = Math.floor(from / n);
	let c = from % n;
	for (;;) {
		const nr = r + DR[dir];
		const nc = c + DC[dir];
		if (nr < 0 || nr >= n || nc < 0 || nc >= n || rocks[nr * n + nc]) return path;
		r = nr;
		c = nc;
		path.push(r * n + c);
	}
}

export const startState = (p: SoufflePuzzle): SouffleState => ({
	pos: p.start,
	flowers: p.flowers.slice(),
	gusts: 0,
});

/** One gust. Pure — the old state is untouched, so undo is just keeping it. Null when blocked. */
export function applyGust(p: SoufflePuzzle, s: SouffleState, dir: Dir): SouffleState | null {
	const path = glide(p.n, p.rocks, s.pos, dir);
	if (!path.length) return null;
	const flowers = s.flowers.slice();
	for (const i of path) flowers[i] = false;
	return { pos: path[path.length - 1], flowers, gusts: s.gusts + 1 };
}

export const flowersLeft = (s: SouffleState): number => s.flowers.reduce((k, f) => k + (f ? 1 : 0), 0);
export const isWon = (s: SouffleState): boolean => !s.flowers.some(Boolean);

/** The dirs a gust can take from here — the ghost previews and the dead-arrow greying. */
export const openDirs = (p: SoufflePuzzle, pos: number): Dir[] =>
	([0, 1, 2, 3] as Dir[]).filter((d) => glide(p.n, p.rocks, pos, d).length > 0);

interface Candidate {
	rocks: boolean[];
	start: number;
	walk: Dir[];
	seen: Map<number, number>; // cell → gusts it took to first brush it
}

/** Random-walk the feather and record when each cell was first swept. Null on a dead layout. */
function tryWalk(rng: () => number, p: GenParams): Candidate | null {
	const size = p.n * p.n;
	const rocks = new Array<boolean>(size).fill(false);
	let left = p.rocks;
	while (left > 0) {
		const i = Math.floor(rng() * size);
		if (!rocks[i]) {
			rocks[i] = true;
			left--;
		}
	}
	const free: number[] = [];
	for (let i = 0; i < size; i++) if (!rocks[i]) free.push(i);
	if (!free.length) return null;
	const start = free[Math.floor(rng() * free.length)];

	const seen = new Map<number, number>();
	const walk: Dir[] = [];
	let pos = start;
	let last: Dir | null = null;
	for (let g = 1; g <= p.gusts; g++) {
		let dirs = ([0, 1, 2, 3] as Dir[]).filter((d) => glide(p.n, rocks, pos, d).length > 0);
		if (!dirs.length) return null;
		// Blowing straight back rarely reaches anything new: avoid it while there is a choice.
		if (last != null && dirs.length > 1) dirs = dirs.filter((d) => d !== (last as number ^ 2));
		const dir = dirs[Math.floor(rng() * dirs.length)];
		const path = glide(p.n, rocks, pos, dir);
		for (const i of path) if (!seen.has(i)) seen.set(i, g);
		pos = path[path.length - 1];
		walk.push(dir);
		last = dir;
	}
	return { rocks, start, walk, seen };
}

/** Deterministic in `rng`. Cells swept early come almost for free, so the flowers keep only
    the late ones — that is what forces the player deep into the walk before the first pay-out. */
export function generateSouffle(rng: () => number, p: GenParams): SoufflePuzzle {
	let best: SoufflePuzzle | null = null;
	for (let t = 0; t < 60; t++) {
		const cand = tryWalk(rng, p);
		if (!cand) continue;
		cand.seen.delete(cand.start); // a flower under the resting feather would be free
		const order = [...cand.seen.entries()].sort((a, b) => a[1] - b[1]);
		if (order.length < p.flowers) continue;
		const kept = order.slice(-p.flowers);
		const par = kept[kept.length - 1][1]; // the walk past the last flower is dead weight
		const flowers = new Array<boolean>(p.n * p.n).fill(false);
		for (const [i] of kept) flowers[i] = true;
		const puzzle: SoufflePuzzle = {
			n: p.n,
			rocks: cand.rocks,
			flowers,
			start: cand.start,
			par,
			walk: cand.walk.slice(0, par),
		};
		if (!best || par > best.par) best = puzzle;
	}
	if (!best) throw new Error('souffle: no layout walked out'); // 60 tries never all die in practice
	return best;
}
