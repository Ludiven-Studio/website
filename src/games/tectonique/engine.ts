// Tectonique — the factory floor is a lattice of conveyor belts, one per row and column.
//
// Two layers share the grid. The BELTS slide, and the CRYSTALS never move: they hover above,
// and the only way to eat one is to carry the hero across their cell.
//
// What tells the pieces apart is how they sit on the belt:
//   · a CRATE and the HERO slide on it. Jammed against the wall or the piece ahead, they fall
//     behind while the belt runs on — that is how the crates stack, how the gaps close, and
//     why the belt still scrolls under a blocked hero.
//   · a BLOCK is bolted to its belt and travels exactly with it. So a block that butts into
//     something caps the slide of its whole line.
//   · a POST is not on the belt at all: it is driven through it into the ground below, so the
//     belt of the axis it holds cannot budge one cell.
//
// The player only ever pushes the two lines the hero stands on, one cell at a time. Stacking
// loses the gaps, so a move cannot be undone: he can strand himself, and `heroStuck` is how the
// UI catches it. Generation follows the same rule, so the walk it records IS a player solution
// from the start — which is what lets it skip a solver.

export const VOID = 0;
export const PLATE = 1;
export const HERO = 2;
export const LOCK_ROW = 3;
export const LOCK_COL = 4;
export const LOCK_ALL = 5;
export const ROCK = 6;

export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Axis = 'row' | 'col';

export interface Board {
	n: number;
	floor: Tile[]; // row-major, length n*n
	crystals: boolean[]; // world-fixed, length n*n
}

/** One piece's trip, in flat indices. Pieces pile up, so they no longer all travel the same. */
export interface PieceMove {
	from: number;
	to: number;
}

export interface SlideResult {
	board: Board;
	shift: number; // how far the furthest piece went
	moves: PieceMove[]; // every piece that actually travelled
	eaten: number[]; // flat indices of the crystals swallowed
	swept: number[]; // flat indices the hero crossed, endpoints included
}

export interface Slack {
	min: number;
	max: number;
}

export const cloneBoard = (b: Board): Board => ({ n: b.n, floor: b.floor.slice(), crystals: b.crystals.slice() });

export const countCrystals = (b: Board): number => b.crystals.reduce<number>((n, c) => n + (c ? 1 : 0), 0);

export const isWon = (b: Board): boolean => !b.crystals.includes(true);

export const heroIndex = (b: Board): number => b.floor.indexOf(HERO);

/** Flat index of position `i` along a line. */
export const flatAt = (n: number, axis: Axis, index: number, i: number): number =>
	axis === 'row' ? index * n + i : i * n + index;

/** A post is driven through the floor: the floor of the axis it holds cannot slide at all. */
export const holds = (t: Tile, axis: Axis): boolean =>
	t === LOCK_ALL || (axis === 'row' ? t === LOCK_ROW : t === LOCK_COL);

/** Crates and the hero slide on the belt. The rest is bolted to it and travels exactly with it. */
const glued = (t: Tile): boolean => t !== VOID && t !== PLATE && t !== HERO;

const lineOf = (b: Board, axis: Axis, index: number): Tile[] => {
	const line: Tile[] = [];
	for (let i = 0; i < b.n; i++) line.push(b.floor[flatAt(b.n, axis, index, i)]);
	return line;
};

/**
 * Slide the floor `d` cells and let the pieces settle. Each one runs up to `d` cells until it
 * meets the wall or the piece ahead — a crate that falls short has slid back on the floor, and
 * that is what closes the gaps. Returns the settled line plus where each landing piece came from.
 */
function pack(line: Tile[], d: number): { out: Tile[]; from: number[] } {
	const n = line.length;
	const out: Tile[] = new Array<Tile>(n).fill(VOID);
	const from: number[] = new Array<number>(n).fill(-1);
	const dir = Math.sign(d);
	const room = Math.abs(d);
	// Walk from the leading end, so each piece already knows the last free cell left to it.
	let limit = dir > 0 ? n - 1 : 0;
	for (let k = 0; k < n; k++) {
		const i = dir > 0 ? n - 1 - k : k;
		if (line[i] === VOID) continue;
		const p = dir > 0 ? Math.min(i + room, limit) : Math.max(i - room, limit);
		out[p] = line[i];
		from[p] = i;
		limit = p - dir;
	}
	return { out, from };
}

/** Cells the furthest piece gains when the floor is pushed all the way. */
function reach(line: Tile[], dir: 1 | -1): number {
	const { from } = pack(line, dir * line.length);
	let best = 0;
	for (let p = 0; p < line.length; p++) if (from[p] >= 0) best = Math.max(best, Math.abs(p - from[p]));
	return best;
}

/**
 * How far the floor of this line may really slide. A post nails it down outright; otherwise a
 * glued piece that cannot keep up caps everyone, since it is the floor itself that carries it.
 */
function travel(line: Tile[], axis: Axis, dir: 1 | -1, want: number): number {
	if (line.some((t) => holds(t, axis))) return 0;
	for (let d = Math.min(want, reach(line, dir)); d > 0; d--) {
		const { from } = pack(line, dir * d);
		let ok = true;
		for (let p = 0; p < line.length && ok; p++) {
			if (from[p] >= 0 && glued(line[from[p]])) ok = Math.abs(p - from[p]) === d;
		}
		if (ok) return d;
	}
	return 0;
}

/** How far the line may still slide, in cells. Both zero when it is nailed down. */
export function slack(b: Board, axis: Axis, index: number): Slack {
	if (index < 0 || index >= b.n) return { min: 0, max: 0 };
	const line = lineOf(b, axis, index);
	const back = travel(line, axis, -1, b.n);
	return { min: back ? -back : 0, max: travel(line, axis, 1, b.n) };
}

/** Flat indices of the pieces that still gain ground when the line is nudged one cell that way. */
export function movers(b: Board, axis: Axis, index: number, dir: 1 | -1): number[] {
	if (index < 0 || index >= b.n) return [];
	const line = lineOf(b, axis, index);
	if (!travel(line, axis, dir, 1)) return [];
	const { from } = pack(line, dir);
	const out: number[] = [];
	for (let p = 0; p < b.n; p++) if (from[p] >= 0 && from[p] !== p) out.push(flatAt(b.n, axis, index, from[p]));
	return out;
}

/** What stops this line: the posts nailing it down, or whatever jams one cell short. */
export function blockers(b: Board, axis: Axis, index: number, dir: 1 | -1): number[] {
	if (index < 0 || index >= b.n) return [];
	const line = lineOf(b, axis, index);
	const posts = line.flatMap((t, i) => (holds(t, axis) ? [flatAt(b.n, axis, index, i)] : []));
	if (posts.length) return posts;
	const { from } = pack(line, dir);
	const stuck: number[] = [];
	const capped: number[] = [];
	for (let p = 0; p < b.n; p++) {
		if (from[p] < 0 || from[p] !== p) continue;
		stuck.push(flatAt(b.n, axis, index, p));
		// A glued piece that cannot keep up caps the whole line on its own — name it alone.
		if (glued(line[p])) capped.push(flatAt(b.n, axis, index, p));
	}
	return capped.length ? capped : stuck;
}

/** The two lines the player may push: the ones the hero stands on. */
export function heroLines(b: Board): [Axis, number][] {
	const h = heroIndex(b);
	return h < 0 ? [] : [['row', Math.floor(h / b.n)], ['col', h % b.n]];
}

/** Dead end: neither of the hero's lines can budge, so no move is left at all. */
export function heroStuck(b: Board): boolean {
	for (const [axis, index] of heroLines(b)) {
		const s = slack(b, axis, index);
		if (s.min < 0 || s.max > 0) return false;
	}
	return true;
}

/** Push a line by `shift` cells. Returns the same board when nothing moves. */
export function slide(b: Board, axis: Axis, index: number, shift: number): SlideResult {
	const still: SlideResult = { board: b, shift: 0, moves: [], eaten: [], swept: [] };
	const want = Math.round(shift);
	if (want === 0 || index < 0 || index >= b.n) return still;

	const n = b.n;
	const line = lineOf(b, axis, index);
	const dir = want > 0 ? 1 : -1;
	const d = travel(line, axis, dir, Math.abs(want));
	if (d === 0) return still;

	const { out, from } = pack(line, dir * d);

	// The floor moved `d`, but a crate that jammed moved less: whatever draws the pieces has to
	// follow `moves`, never `shift`, or a jammed one drifts off.
	const moves: PieceMove[] = [];
	let hero = -1;
	for (let p = 0; p < n; p++) {
		if (from[p] < 0) continue;
		if (from[p] !== p) moves.push({ from: flatAt(n, axis, index, from[p]), to: flatAt(n, axis, index, p) });
		if (out[p] === HERO) hero = p;
	}

	const next = cloneBoard(b);
	for (let i = 0; i < n; i++) next.floor[flatAt(n, axis, index, i)] = out[i];

	const eaten: number[] = [];
	const swept: number[] = [];
	if (hero >= 0) {
		const lo = Math.min(hero, from[hero]);
		const hi = Math.max(hero, from[hero]);
		for (let i = lo; i <= hi; i++) {
			const f = flatAt(n, axis, index, i);
			swept.push(f);
			if (next.crystals[f]) {
				next.crystals[f] = false;
				eaten.push(f);
			}
		}
	}
	return { board: next, shift: dir * d, moves, eaten, swept };
}

export const encodeBoard = (b: Board): string => `${b.floor.join('')}|${b.crystals.map((c) => (c ? '1' : '0')).join('')}`;

export function decodeBoard(n: number, s: string): Board {
	const [f, c] = s.split('|');
	if (!f || !c || f.length !== n * n || c.length !== n * n) throw new Error(`bad board for ${n}×${n}: ${s}`);
	return { n, floor: Array.from(f, (ch) => Number(ch) as Tile), crystals: Array.from(c, (ch) => ch === '1') };
}

/* ---------- Generation ---------- */

export interface GenParams {
	n: number;
	crystals: number;
	rowLocks: number;
	colLocks: number;
	allLocks: number; // posts holding both axes
	rocks: number; // glued to the floor, they cap the slide instead of freezing it
	holes: number;
}

/** Void frame around the plate. It IS the room every line slides in — keep it thin, or the
    plate shreds into lone slabs that roam the whole grid and the puzzle goes slack. */
const MARGIN = 2;

const shuffled = <T>(rng: () => number, arr: T[]): T[] => {
	const out = arr.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

/** A square plate floating in the void, pierced with holes, carrying the hero and the locks. */
function buildFloor(rng: () => number, p: GenParams): Board {
	const n = p.n;
	const w = n - MARGIN;
	const ox = Math.floor(rng() * (MARGIN + 1));
	const oy = Math.floor(rng() * (MARGIN + 1));

	const floor: Tile[] = new Array(n * n).fill(VOID);
	const plate: number[] = [];
	for (let r = 0; r < w; r++) {
		for (let c = 0; c < w; c++) {
			const i = (oy + r) * n + ox + c;
			floor[i] = PLATE;
			plate.push(i);
		}
	}

	// Holes, but never below two slabs on a line: a lone slab roams the whole grid and the
	// plate stops reading as one piece.
	const rowCount = new Array<number>(n).fill(0);
	const colCount = new Array<number>(n).fill(0);
	for (let k = 0; k < w; k++) {
		rowCount[oy + k] = w;
		colCount[ox + k] = w;
	}
	let holes = p.holes;
	for (const i of shuffled(rng, plate)) {
		if (holes <= 0) break;
		const r = Math.floor(i / n);
		const c = i % n;
		if (rowCount[r] <= 2 || colCount[c] <= 2) continue;
		floor[i] = VOID;
		rowCount[r]--;
		colCount[c]--;
		holes--;
	}

	const free = shuffled(rng, plate.filter((i) => floor[i] === PLATE));
	let k = 0;
	floor[free[k++]] = HERO;
	for (let i = 0; i < p.rowLocks && k < free.length; i++) floor[free[k++]] = LOCK_ROW;
	for (let i = 0; i < p.colLocks && k < free.length; i++) floor[free[k++]] = LOCK_COL;
	for (let i = 0; i < p.allLocks && k < free.length; i++) floor[free[k++]] = LOCK_ALL;
	for (let i = 0; i < p.rocks && k < free.length; i++) floor[free[k++]] = ROCK;

	return { n, floor, crystals: new Array<boolean>(n * n).fill(false) };
}

interface Line {
	axis: Axis;
	index: number;
}

export interface LineMove extends Line {
	shift: number;
}

interface Walk {
	/** Cell → step of the walk that first swept it. */
	visits: Map<number, number>;
	moves: LineMove[];
}

/** Walk the hero the only way the player can — his own line, one cell — and collect what he crosses. */
function walkVisits(rng: () => number, start: Board, steps: number): Walk {
	const seen = new Map<number, number>();
	const moves: LineMove[] = [];
	let b = start;
	seen.set(heroIndex(b), 0);
	let undo: LineMove | null = null;
	for (let s = 0; s < steps; s++) {
		const opts: LineMove[] = [];
		for (const [axis, index] of heroLines(b)) {
			const sl = slack(b, axis, index);
			if (sl.min < 0) opts.push({ axis, index, shift: -1 });
			if (sl.max > 0) opts.push({ axis, index, shift: 1 });
		}
		if (!opts.length) break;
		// Retracing covers no new ground, so take it back only when it is the last way out.
		const fresh = opts.filter((o) => !undo || o.axis !== undo.axis || o.shift !== undo.shift);
		let pool = fresh.length ? fresh : opts;
		// A push can scroll the belt under a jammed hero and sweep nothing. Fine for the player,
		// wasted here: prefer the pushes that actually carry him somewhere.
		const h = heroIndex(b);
		const riding = pool.filter((o) => movers(b, o.axis, o.index, o.shift > 0 ? 1 : -1).includes(h));
		if (riding.length) pool = riding;
		const m = pool[Math.floor(rng() * pool.length)];

		const r = slide(b, m.axis, m.index, m.shift);
		for (const i of r.swept) if (!seen.has(i)) seen.set(i, s + 1);
		moves.push(m);
		undo = { ...m, shift: -m.shift };
		b = r.board;
	}
	return { visits: seen, moves };
}

/** Pick `want` cells, keeping them apart while candidates allow it. */
function spread(rng: () => number, cand: number[], want: number, n: number): number[] {
	const chosen: number[] = [];
	const pool = shuffled(rng, cand);
	const far = (a: number, b: number): number =>
		Math.max(Math.abs(Math.floor(a / n) - Math.floor(b / n)), Math.abs((a % n) - (b % n)));
	for (const minD of [3, 2, 1]) {
		for (const c of pool) {
			if (chosen.length >= want) return chosen;
			if (chosen.includes(c)) continue;
			if (chosen.every((o) => far(o, c) >= minD)) chosen.push(c);
		}
	}
	return chosen;
}

export interface Generated {
	board: Board;
	/** The walk the crystals were dropped on: replaying it eats every one of them. */
	walk: LineMove[];
}

/** Deterministic in `rng`. Solvable by construction — the crystals sit on a walk the hero can replay. */
export function generateDetailed(rng: () => number, p: GenParams): Generated {
	let best: Generated | null = null;
	let bestCount = -1;
	for (let t = 0; t < 40; t++) {
		const base = buildFloor(rng, p);
		const { visits, moves } = walkVisits(rng, base, 60 + 30 * p.crystals);
		visits.delete(heroIndex(base)); // a crystal under the hero would fall on the first slide
		// Cells swept early come almost for free. Keeping only the late ones forces the player
		// deep into the irreversible sequence before the first crystal pays out.
		const order = [...visits.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => i);
		const late = order.slice(Math.floor(order.length * 0.4));
		const spots = spread(rng, late, p.crystals, p.n);
		if (spots.length > bestCount) {
			const board = cloneBoard(base);
			for (const i of spots) board.crystals[i] = true;
			best = { board, walk: moves };
			bestCount = spots.length;
		}
		if (bestCount >= p.crystals) break;
	}
	return best as Generated;
}

export const generate = (rng: () => number, p: GenParams): Board => generateDetailed(rng, p).board;
