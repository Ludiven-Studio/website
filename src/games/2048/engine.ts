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

/** Apply a move; spawns a tile only if the board actually changed. */
export function move(state: State, dir: Dir, stream: number[]): { state: State; moved: boolean; gained: number } {
	const size = state.size;
	const board = clone(state.board);
	let gained = 0;
	let moved = false;

	const read = (i: number): number[] => {
		const line: number[] = [];
		for (let j = 0; j < size; j++) {
			if (dir === 'left') line.push(board[i][j]);
			else if (dir === 'right') line.push(board[i][size - 1 - j]);
			else if (dir === 'up') line.push(board[j][i]);
			else line.push(board[size - 1 - j][i]); // down
		}
		return line;
	};
	const write = (i: number, line: number[]): void => {
		for (let j = 0; j < size; j++) {
			if (dir === 'left') board[i][j] = line[j];
			else if (dir === 'right') board[i][size - 1 - j] = line[j];
			else if (dir === 'up') board[j][i] = line[j];
			else board[size - 1 - j][i] = line[j];
		}
	};

	for (let i = 0; i < size; i++) {
		const before = read(i);
		const { line, gained: g } = slideLine(before);
		gained += g;
		for (let j = 0; j < size; j++) if (before[j] !== line[j]) moved = true;
		write(i, line);
	}

	if (!moved) return { state, moved: false, gained: 0 };
	const next = spawnTile({ ...state, board, score: state.score + gained }, stream);
	return { state: next, moved: true, gained };
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
