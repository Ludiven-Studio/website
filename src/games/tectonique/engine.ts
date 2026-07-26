// Tectonique — the floor is a broken plate whose rows and columns slide freely.
//
// Two layers share the grid. The FLOOR (slabs, the hero, the locks) slides: a line
// translates as one rigid block, gaps kept, until its outermost slab hits the wall.
// The CRYSTALS never move — they hover above the floor, so the only way to eat one is
// to ride the hero across its cell.
//
// A row lock freezes the row it sits in, a column lock freezes its column: freeing a row
// means sliding its lock out through the other axis first.
//
// Every slide is reversible, so the puzzle has no dead end. That is what lets the
// generator skip a solver: it walks the hero at random, remembers the cells it swept,
// and drops the crystals there — replaying the walk collects them all.

export const VOID = 0;
export const PLATE = 1;
export const HERO = 2;
export const LOCK_ROW = 3;
export const LOCK_COL = 4;

export type Tile = 0 | 1 | 2 | 3 | 4;
export type Axis = 'row' | 'col';

export interface Board {
	n: number;
	floor: Tile[]; // row-major, length n*n
	crystals: boolean[]; // world-fixed, length n*n
}

export interface SlideResult {
	board: Board;
	shift: number; // what the clamp actually allowed
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

/** A line is frozen while its own kind of lock stands on it. */
export function frozen(b: Board, axis: Axis, index: number): boolean {
	const stop = axis === 'row' ? LOCK_ROW : LOCK_COL;
	for (let i = 0; i < b.n; i++) if (b.floor[flatAt(b.n, axis, index, i)] === stop) return true;
	return false;
}

/** How far the line may still travel, in cells. Both zero when it cannot move at all. */
export function slack(b: Board, axis: Axis, index: number): Slack {
	if (index < 0 || index >= b.n || frozen(b, axis, index)) return { min: 0, max: 0 };
	let lo = -1;
	let hi = -1;
	for (let i = 0; i < b.n; i++) {
		if (b.floor[flatAt(b.n, axis, index, i)] === VOID) continue;
		if (lo < 0) lo = i;
		hi = i;
	}
	if (lo < 0) return { min: 0, max: 0 };
	return { min: lo > 0 ? -lo : 0, max: b.n - 1 - hi };
}

/** Translate a line by `shift` cells, clamped to its slack. Returns the same board when nothing moves. */
export function slide(b: Board, axis: Axis, index: number, shift: number): SlideResult {
	const s = slack(b, axis, index);
	const d = Math.max(s.min, Math.min(s.max, Math.round(shift)));
	if (d === 0) return { board: b, shift: 0, eaten: [], swept: [] };

	const n = b.n;
	const line: Tile[] = [];
	for (let i = 0; i < n; i++) line.push(b.floor[flatAt(n, axis, index, i)]);

	const next = cloneBoard(b);
	for (let i = 0; i < n; i++) next.floor[flatAt(n, axis, index, i)] = VOID;
	for (let i = 0; i < n; i++) if (line[i] !== VOID) next.floor[flatAt(n, axis, index, i + d)] = line[i];

	const eaten: number[] = [];
	const swept: number[] = [];
	const h = line.indexOf(HERO);
	if (h >= 0) {
		const lo = Math.min(h, h + d);
		const hi = Math.max(h, h + d);
		for (let i = lo; i <= hi; i++) {
			const f = flatAt(n, axis, index, i);
			swept.push(f);
			if (next.crystals[f]) {
				next.crystals[f] = false;
				eaten.push(f);
			}
		}
	}
	return { board: next, shift: d, eaten, swept };
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
