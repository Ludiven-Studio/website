// Tectonique — the floor slides in whole rows and columns.
//
// A move picks one line (a row or a column) and one edge: everything standing on that
// line packs against that edge, order preserved. The hero never moves on its own — it
// only travels when the line under it is pushed, and on the way it eats every crystal
// between itself and the first solid piece, stopping against it.
//
// Locks are what turn this into a puzzle. A row lock freezes the ROW it sits in, so the
// only way to get rid of it is to push its COLUMN — and a column lock freezes the column
// it sits in. Clearing a path is therefore a sub-puzzle of its own.
//
// The engine stays a pure cell array so the solver can hash a state cheaply. `applyMove`
// hands back the per-piece from → to mapping the UI needs to animate the slide.

export const EMPTY = 0;
export const HERO = 1;
export const CRYSTAL = 2;
export const LOCK_ROW = 3;
export const LOCK_COL = 4;

export type Piece = 0 | 1 | 2 | 3 | 4;

export interface Board {
	n: number;
	cells: Piece[]; // row-major, length n*n
}

export type Axis = 'row' | 'col';

/** `dir` +1 pushes toward the high index (right for a row, down for a column). */
export interface Move {
	axis: Axis;
	index: number;
	dir: -1 | 1;
}

export interface MoveOutcome {
	board: Board;
	eaten: number;
	eatenAt: number[]; // flat board indices of the crystals the hero swallowed
	moved: { from: number; to: number }[]; // flat board indices, for the slide animation
}

export const cloneBoard = (b: Board): Board => ({ n: b.n, cells: b.cells.slice() });

export const isWon = (b: Board): boolean => !b.cells.includes(CRYSTAL);

export const countCrystals = (b: Board): number => b.cells.reduce<number>((n, p) => n + (p === CRYSTAL ? 1 : 0), 0);

/** Flat board index of position `i` along a line. */
const flatAt = (n: number, axis: Axis, index: number, i: number): number =>
	axis === 'row' ? index * n + i : i * n + index;

const readLine = (b: Board, axis: Axis, index: number): Piece[] => {
	const line: Piece[] = [];
	for (let i = 0; i < b.n; i++) line.push(b.cells[flatAt(b.n, axis, index, i)]);
	return line;
};

interface SlideResult {
	line: Piece[];
	eatenAt: number[]; // positions along the line
	moved: { from: number; to: number }[]; // positions along the line
}

/** Slide one line toward `dir`: the hero eats ahead of itself, then everything packs. */
export function slideLine(line: Piece[], dir: -1 | 1): SlideResult {
	const n = line.length;
	const out = line.slice();
	const eatenAt: number[] = [];

	const h = out.indexOf(HERO);
	if (h >= 0) {
		for (let i = h + dir; i >= 0 && i < n; i += dir) {
			if (out[i] === CRYSTAL) {
				out[i] = EMPTY;
				eatenAt.push(i);
				continue;
			}
			if (out[i] !== EMPTY) break; // a solid piece: the hero stops against it
		}
	}

	// Pack the survivors against the destination edge, keeping their order.
	const kept: { piece: Piece; from: number }[] = [];
	for (let i = 0; i < n; i++) if (out[i] !== EMPTY) kept.push({ piece: out[i], from: i });
	const packed: Piece[] = new Array(n).fill(EMPTY);
	const moved: { from: number; to: number }[] = [];
	for (let k = 0; k < kept.length; k++) {
		const to = dir === 1 ? n - kept.length + k : k;
		packed[to] = kept[k].piece;
		if (kept[k].from !== to) moved.push({ from: kept[k].from, to });
	}
	return { line: packed, eatenAt, moved };
}

/** A line is frozen while its own kind of lock stands on it. */
export function canPush(b: Board, axis: Axis, index: number): boolean {
	const freezer = axis === 'row' ? LOCK_ROW : LOCK_COL;
	return !readLine(b, axis, index).includes(freezer);
}

/** Apply a push, or null when it is illegal or would change nothing. */
export function applyMove(b: Board, m: Move): MoveOutcome | null {
	if (m.index < 0 || m.index >= b.n) return null;
	if (!canPush(b, m.axis, m.index)) return null;
	const before = readLine(b, m.axis, m.index);
	const { line, eatenAt, moved } = slideLine(before, m.dir);
	// A push that shuffles nothing is not a move: the counter would be cheatable.
	if (!eatenAt.length && !moved.length) return null;

	const next = cloneBoard(b);
	for (let i = 0; i < b.n; i++) next.cells[flatAt(b.n, m.axis, m.index, i)] = line[i];
	const toFlat = (i: number): number => flatAt(b.n, m.axis, m.index, i);
	return {
		board: next,
		eaten: eatenAt.length,
		eatenAt: eatenAt.map(toFlat),
		moved: moved.map((mv) => ({ from: toFlat(mv.from), to: toFlat(mv.to) })),
	};
}

/** Every push the board geometry allows, legal or not — the solver filters with applyMove. */
export function allMoves(n: number): Move[] {
	const out: Move[] = [];
	for (let i = 0; i < n; i++) {
		out.push({ axis: 'row', index: i, dir: -1 }, { axis: 'row', index: i, dir: 1 });
		out.push({ axis: 'col', index: i, dir: -1 }, { axis: 'col', index: i, dir: 1 });
	}
	return out;
}

export const legalMoves = (b: Board): Move[] => allMoves(b.n).filter((m) => applyMove(b, m) !== null);

export const encodeBoard = (b: Board): string => b.cells.join('');

export function decodeBoard(n: number, s: string): Board {
	const cells = Array.from(s, (ch) => Number(ch) as Piece);
	if (cells.length !== n * n) throw new Error(`bad board: ${s.length} cells for ${n}×${n}`);
	return { n, cells };
}

/** Fewest moves to eat every crystal. null = no solution within `maxStates` explored. */
export function solve(b: Board, maxStates = 300_000): number | null {
	if (isWon(b)) return 0;
	const moves = allMoves(b.n);
	const seen = new Set<string>([encodeBoard(b)]);
	let frontier = [b];
	for (let depth = 1; frontier.length > 0; depth++) {
		const next: Board[] = [];
		for (const cur of frontier) {
			for (const m of moves) {
				const r = applyMove(cur, m);
				if (!r) continue;
				if (isWon(r.board)) return depth;
				const k = encodeBoard(r.board);
				if (seen.has(k)) continue;
				if (seen.size >= maxStates) return null;
				seen.add(k);
				next.push(r.board);
			}
		}
		frontier = next;
	}
	return null; // search exhausted: the crystals cannot all be reached
}

export interface GenParams {
	n: number;
	crystals: number;
	rowLocks: number;
	colLocks: number;
}

/** Scatter the pieces on distinct cells. Says nothing about solvability — `findBoard` judges that. */
export function buildBoard(rng: () => number, p: GenParams): Board {
	const cells: Piece[] = new Array(p.n * p.n).fill(EMPTY);
	const free: number[] = cells.map((_, i) => i);
	const take = (): number => free.splice(Math.floor(rng() * free.length), 1)[0];
	cells[take()] = HERO;
	for (let i = 0; i < p.crystals; i++) cells[take()] = CRYSTAL;
	for (let i = 0; i < p.rowLocks; i++) cells[take()] = LOCK_ROW;
	for (let i = 0; i < p.colLocks; i++) cells[take()] = LOCK_COL;
	return { n: p.n, cells };
}

export interface GeneratedBoard {
	board: Board;
	opt: number;
}

/** Keep scattering until a board's optimum lands in [minOpt, maxOpt]. Deterministic in `rng`. */
export function findBoard(
	rng: () => number,
	p: GenParams,
	minOpt: number,
	maxOpt: number,
	tries = 300,
): GeneratedBoard | null {
	for (let t = 0; t < tries; t++) {
		const board = buildBoard(rng, p);
		const opt = solve(board);
		if (opt !== null && opt >= minOpt && opt <= maxOpt) return { board, opt };
	}
	return null;
}
