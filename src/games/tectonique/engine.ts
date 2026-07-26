// Tectonique — the barn floor slides, row by row and column by column.
//
// Two layers share the grid. The FLOOR slides, and everything standing on it rides along.
// The CRYSTALS never move: they hover above the floor, and the only way to eat one is to
// ride the hero across its cell.
//
// What tells the floor pieces apart is whether they can slide ON the floor:
//   · a CRATE can. Jam it against the wall or another crate and it falls behind the floor,
//     which is how the crates stack and the gaps close.
//   · a ROCK and the hero's NEST cannot — they are glued to the floor and travel exactly with
//     it. So a rock that butts into something caps the slide of its whole line.
//   · a POST is not on the floor at all: it is driven through it into the ground below, so the
//     floor of the axis it holds cannot budge one cell.
//
// Stacking loses the gaps, so a move cannot be undone — the player can strand himself and has
// ↻ for that. Generation is unaffected: the walk it records IS a solution from the start,
// which is what lets it skip a solver.

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

/** Only crates slide on the floor. Everything else is glued to it and travels exactly with it. */
const glued = (t: Tile): boolean => t !== VOID && t !== PLATE;

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
	visits: Set<number>;
	moves: LineMove[];
}

/** Slide lines at random, favouring the ones under the hero, and collect every cell it crosses. */
function walkVisits(rng: () => number, start: Board, steps: number): Walk {
	const seen = new Set<number>();
	const moves: LineMove[] = [];
	let b = start;
	for (let s = 0; s < steps; s++) {
		const movable = (axis: Axis, index: number): boolean => {
			const sl = slack(b, axis, index);
			return sl.min < 0 || sl.max > 0;
		};
		const h = heroIndex(b);
		const own: Line[] = [];
		if (movable('row', Math.floor(h / b.n))) own.push({ axis: 'row', index: Math.floor(h / b.n) });
		if (movable('col', h % b.n)) own.push({ axis: 'col', index: h % b.n });

		const all: Line[] = [];
		for (let i = 0; i < b.n; i++) {
			if (movable('row', i)) all.push({ axis: 'row', index: i });
			if (movable('col', i)) all.push({ axis: 'col', index: i });
		}
		if (!all.length) break;

		const pool = own.length && rng() < 0.7 ? own : all;
		const line = pool[Math.floor(rng() * pool.length)];
		const sl = slack(b, line.axis, line.index);
		let d = 0;
		while (d === 0) d = sl.min + Math.floor(rng() * (sl.max - sl.min + 1));

		const r = slide(b, line.axis, line.index, d);
		for (const i of r.swept) seen.add(i);
		moves.push({ ...line, shift: d });
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
		const { visits, moves } = walkVisits(rng, base, 30 + 14 * p.crystals);
		visits.delete(heroIndex(base)); // a crystal under the hero would fall on the first slide
		const spots = spread(rng, [...visits], p.crystals, p.n);
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
