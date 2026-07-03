import type { Rng } from '../prng';

/* =====================================================
   2048 — pure engine (slide + merge). No UI/DOM.
   Spawns are drawn from a pre-generated seeded value stream,
   consumed via a `cursor` stored in the state — so restoring
   board + score + cursor reproduces the exact same tile order
   (needed for the resumable one-attempt daily).
   ===================================================== */

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Board = number[][]; // 0 = empty cell

export interface State {
	board: Board;
	score: number;
	size: number;
	cursor: number; // index into the value stream
}

export const DIFFS = {
	facile: { size: 5, label: 'Facile' },
	moyen: { size: 4, label: 'Moyen' },
	difficile: { size: 3, label: 'Difficile' },
} as const;
export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
export type DiffKey = keyof typeof DIFFS;

export const WIN_TILE = 2048;

/** One tile's motion during a move (both partners of a merge point to the same dest). */
export interface Slide {
	fromR: number;
	fromC: number;
	toR: number;
	toC: number;
	value: number;
	merged: boolean;
}

/** Board coord of the j-th cell along the travel direction of line i (0 = front). */
const coord = (dir: Dir, size: number, i: number, j: number): [number, number] => {
	if (dir === 'left') return [i, j];
	if (dir === 'right') return [i, size - 1 - j];
	if (dir === 'up') return [j, i];
	return [size - 1 - j, i]; // down
};

/** Deterministic value stream; spawns read it by cursor (wraps if exhausted). */
export function makeStream(rng: Rng, n = 4096): number[] {
	const out = new Array<number>(n);
	for (let i = 0; i < n; i++) out[i] = rng();
	return out;
}

const clone = (b: Board): Board => b.map((row) => row.slice());

export function emptyCells(board: Board): [number, number][] {
	const cells: [number, number][] = [];
	for (let r = 0; r < board.length; r++)
		for (let c = 0; c < board.length; c++) if (board[r][c] === 0) cells.push([r, c]);
	return cells;
}

/** Place one tile (2 at 90%, 4 at 10%) on a seeded empty cell; advances cursor by 2. */
export function spawnTile(state: State, stream: number[]): State {
	const cells = emptyCells(state.board);
	if (cells.length === 0) return state;
	const n = stream.length;
	const pick = Math.floor(stream[state.cursor % n] * cells.length) % cells.length;
	const value = stream[(state.cursor + 1) % n] < 0.9 ? 2 : 4;
	const [r, c] = cells[pick];
	const board = clone(state.board);
	board[r][c] = value;
	return { ...state, board, cursor: state.cursor + 2 };
}

export function createBoard(size: number, stream: number[]): State {
	const empty: Board = Array.from({ length: size }, () => new Array<number>(size).fill(0));
	let state: State = { board: empty, score: 0, size, cursor: 0 };
	state = spawnTile(state, stream);
	state = spawnTile(state, stream);
	return state;
}

/** Slide a single line toward index 0, merging each pair at most once. */
export function slideLine(cells: number[]): { line: number[]; gained: number } {
	const nonZero = cells.filter((v) => v !== 0);
	const out: number[] = [];
	let gained = 0;
	for (let i = 0; i < nonZero.length; i++) {
		if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
			const merged = nonZero[i] * 2;
			out.push(merged);
			gained += merged;
			i++; // consume the partner
		} else {
			out.push(nonZero[i]);
		}
	}
	while (out.length < cells.length) out.push(0);
	return { line: out, gained };
}

/** Compute a move without spawning: resulting board + per-tile slides (for animation). */
export function planMove(board: Board, dir: Dir): { board: Board; moved: boolean; gained: number; slides: Slide[] } {
	const size = board.length;
	const out: Board = Array.from({ length: size }, () => new Array<number>(size).fill(0));
	const slides: Slide[] = [];
	let gained = 0;
	let moved = false;

	for (let i = 0; i < size; i++) {
		const tiles: { v: number; j: number }[] = [];
		for (let j = 0; j < size; j++) {
			const [r, c] = coord(dir, size, i, j);
			if (board[r][c] !== 0) tiles.push({ v: board[r][c], j });
		}
		let k = 0; // next output slot along travel
		for (let t = 0; t < tiles.length; t++) {
			const [dr, dc] = coord(dir, size, i, k);
			if (t + 1 < tiles.length && tiles[t].v === tiles[t + 1].v) {
				const merged = tiles[t].v * 2;
				out[dr][dc] = merged;
				gained += merged;
				const [ar, ac] = coord(dir, size, i, tiles[t].j);
				const [br, bc] = coord(dir, size, i, tiles[t + 1].j);
				slides.push({ fromR: ar, fromC: ac, toR: dr, toC: dc, value: tiles[t].v, merged: true });
				slides.push({ fromR: br, fromC: bc, toR: dr, toC: dc, value: tiles[t + 1].v, merged: true });
				moved = true;
				t++; // consume the partner
			} else {
				out[dr][dc] = tiles[t].v;
				const [sr, sc] = coord(dir, size, i, tiles[t].j);
				if (sr !== dr || sc !== dc) moved = true;
				slides.push({ fromR: sr, fromC: sc, toR: dr, toC: dc, value: tiles[t].v, merged: false });
			}
			k++;
		}
	}
	return { board: out, moved, gained, slides };
}

/** Apply a move; spawns a tile only if the board actually changed. */
export function move(state: State, dir: Dir, stream: number[]): { state: State; moved: boolean; gained: number } {
	const plan = planMove(state.board, dir);
	if (!plan.moved) return { state, moved: false, gained: 0 };
	const next = spawnTile({ board: plan.board, score: state.score + plan.gained, size: state.size, cursor: state.cursor }, stream);
	return { state: next, moved: true, gained: plan.gained };
}

export function canMove(state: State): boolean {
	const { board, size } = state;
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (board[r][c] === 0) return true;
			if (c + 1 < size && board[r][c] === board[r][c + 1]) return true;
			if (r + 1 < size && board[r][c] === board[r + 1][c]) return true;
		}
	return false;
}

export const isGameOver = (state: State): boolean => !canMove(state);
export const hasWon = (state: State): boolean => state.board.some((row) => row.some((v) => v >= WIN_TILE));
