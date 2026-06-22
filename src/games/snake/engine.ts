/**
 * SNAKE — pure engine (no UI, frame-rate independent).
 * Discrete grid ticks. The apple order is a seeded shuffle of all cells so the daily
 * challenge is shared; on eat we advance to the next non-occupied cell in that order.
 */

import type { Rng } from '../prng';

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Vec {
	x: number;
	y: number;
}

export interface SnakeConfig {
	cols: number;
	rows: number;
	startLen: number;
}

export const SNAKE_CFG: SnakeConfig = { cols: 17, rows: 17, startLen: 3 };

export type SnakeStatus = 'playing' | 'over';

export interface SnakeState {
	snake: Vec[]; // head first
	dir: Dir; // committed direction (applied last tick)
	pendingDir: Dir; // queued for next tick
	foodIndex: number; // position in the food sequence
	food: Vec;
	score: number;
	status: SnakeStatus;
	grew: boolean; // last tick grew the snake (for the UI)
}

const DELTA: Record<Dir, Vec> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

export const opposite = (d: Dir): Dir =>
	d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left';

/** ms per tick — accelerates with score. */
export const tickInterval = (score: number): number => Math.max(70, 150 - score * 4);

const key = (v: Vec): string => `${v.x},${v.y}`;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Seeded shuffle of every cell — the shared apple order. */
export function foodSequence(cfg: SnakeConfig, rng: Rng): Vec[] {
	const cells: Vec[] = [];
	for (let y = 0; y < cfg.rows; y++) for (let x = 0; x < cfg.cols; x++) cells.push({ x, y });
	return shuffle(cells, rng);
}

/** Next apple: first cell of the sequence (from fromIndex, wrapping) not under the snake. */
export function nextFood(seq: Vec[], fromIndex: number, snake: Vec[]): { food: Vec; index: number } {
	const occupied = new Set(snake.map(key));
	for (let k = 0; k < seq.length; k++) {
		const i = (fromIndex + k) % seq.length;
		if (!occupied.has(key(seq[i]))) return { food: seq[i], index: i };
	}
	return { food: { x: -1, y: -1 }, index: fromIndex }; // board full (unreachable in practice)
}

export function createSnake(cfg: SnakeConfig, seq: Vec[]): SnakeState {
	const cy = Math.floor(cfg.rows / 2);
	const cx = Math.floor(cfg.cols / 2);
	const snake: Vec[] = [];
	for (let i = 0; i < cfg.startLen; i++) snake.push({ x: cx - i, y: cy }); // head first, body to the left
	const { food, index } = nextFood(seq, 0, snake);
	return { snake, dir: 'right', pendingDir: 'right', foodIndex: index, food, score: 0, status: 'playing', grew: false };
}

/** Queue a direction change. Rejected if it reverses the committed direction (anti-180°). */
export function setDir(state: SnakeState, dir: Dir): SnakeState {
	if (dir === opposite(state.dir)) return state;
	if (dir === state.pendingDir) return state;
	return { ...state, pendingDir: dir };
}

/** One grid tick. Pure: walls/self-collision → over; eating grows + advances the apple. */
export function stepSnake(state: SnakeState, cfg: SnakeConfig, seq: Vec[]): SnakeState {
	if (state.status === 'over') return state;
	const dir = state.pendingDir;
	const head = state.snake[0];
	const newHead: Vec = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };

	if (newHead.x < 0 || newHead.x >= cfg.cols || newHead.y < 0 || newHead.y >= cfg.rows)
		return { ...state, dir, status: 'over', grew: false };

	const willGrow = newHead.x === state.food.x && newHead.y === state.food.y;
	// When not growing the tail vacates, so moving into the current tail cell is allowed.
	const body = willGrow ? state.snake : state.snake.slice(0, state.snake.length - 1);
	if (body.some((c) => c.x === newHead.x && c.y === newHead.y))
		return { ...state, dir, status: 'over', grew: false };

	const snake = [newHead, ...state.snake];
	if (!willGrow) {
		snake.pop();
		return { ...state, snake, dir, grew: false };
	}
	const { food, index } = nextFood(seq, state.foodIndex + 1, snake);
	return { ...state, snake, dir, food, foodIndex: index, score: state.score + 1, grew: true };
}
