import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import {
	SNAKE_CFG,
	SNAKE_DIFFS,
	foodSequence,
	generateRocks,
	createSnakeLevel,
	nextFood,
	createSnake,
	setDir,
	stepSnake,
	opposite,
	tickInterval,
	type Dir,
	type SnakeState,
} from './engine';

const seq = (seed: number) => foodSequence(SNAKE_CFG, mulberry32(seed));

const run = (state: SnakeState, dirs: Dir[], s: ReturnType<typeof seq>): SnakeState => {
	let st = state;
	for (const d of dirs) {
		st = setDir(st, d);
		st = stepSnake(st, SNAKE_CFG, s);
	}
	return st;
};

describe('snake engine', () => {
	it('foodSequence is a complete, in-bounds permutation of every cell', () => {
		const s = seq(42);
		expect(s.length).toBe(SNAKE_CFG.cols * SNAKE_CFG.rows);
		const keys = new Set(s.map((c) => `${c.x},${c.y}`));
		expect(keys.size).toBe(s.length); // unique
		for (const c of s) {
			expect(c.x).toBeGreaterThanOrEqual(0);
			expect(c.x).toBeLessThan(SNAKE_CFG.cols);
			expect(c.y).toBeGreaterThanOrEqual(0);
			expect(c.y).toBeLessThan(SNAKE_CFG.rows);
		}
	});

	it('createSnake: right-facing snake of startLen with food off the body', () => {
		const s = seq(1);
		const st = createSnake(SNAKE_CFG, s);
		expect(st.snake.length).toBe(SNAKE_CFG.startLen);
		expect(st.dir).toBe('right');
		expect(st.status).toBe('playing');
		const onBody = st.snake.some((c) => c.x === st.food.x && c.y === st.food.y);
		expect(onBody).toBe(false);
	});

	it('setDir rejects a 180° reversal but accepts a perpendicular turn', () => {
		const s = seq(2);
		const st = createSnake(SNAKE_CFG, s); // facing right
		expect(setDir(st, 'left').pendingDir).toBe('right'); // reversal rejected
		expect(setDir(st, 'up').pendingDir).toBe('up'); // perpendicular ok
		expect(opposite('up')).toBe('down');
	});

	it('a plain move keeps the length and advances the head', () => {
		const s = seq(3);
		const st = createSnake(SNAKE_CFG, s);
		const head = st.snake[0];
		const next = stepSnake(st, SNAKE_CFG, s);
		expect(next.snake.length).toBe(st.snake.length);
		expect(next.snake[0]).toEqual({ x: head.x + 1, y: head.y });
	});

	it('eating grows the snake, bumps the score, and spawns a new free apple', () => {
		const s = seq(4);
		let st = createSnake(SNAKE_CFG, s);
		// Force the apple right in front of the head.
		st = { ...st, food: { x: st.snake[0].x + 1, y: st.snake[0].y } };
		const next = stepSnake(st, SNAKE_CFG, s);
		expect(next.score).toBe(1);
		expect(next.snake.length).toBe(st.snake.length + 1);
		expect(next.grew).toBe(true);
		expect(next.snake.some((c) => c.x === next.food.x && c.y === next.food.y)).toBe(false);
	});

	it('hitting a wall ends the game', () => {
		const s = seq(5);
		const st = createSnake(SNAKE_CFG, s);
		// Drive straight right into the wall.
		const dirs: Dir[] = new Array(SNAKE_CFG.cols).fill('right');
		const end = run(st, dirs, s);
		expect(end.status).toBe('over');
	});

	it('biting its own body ends the game', () => {
		const s = seq(6);
		let st = createSnake(SNAKE_CFG, s);
		// Grow enough that a full loop bites the body, then turn in a tight square.
		st = { ...st, snake: [
			{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 },
		] };
		// facing right at (8,8); go down then left then up → into own body.
		const end = run(st, ['down', 'left', 'up'], s);
		expect(end.status).toBe('over');
	});

	it('is deterministic: same seed + same direction script → identical final state', () => {
		const a = run(createSnake(SNAKE_CFG, seq(99)), ['up', 'up', 'left', 'left', 'down'], seq(99));
		const b = run(createSnake(SNAKE_CFG, seq(99)), ['up', 'up', 'left', 'left', 'down'], seq(99));
		expect(a).toEqual(b);
	});

	it('nextFood skips occupied cells', () => {
		const s = seq(7);
		const snake = [s[0], s[1], s[2]];
		const { food } = nextFood(s, 0, snake);
		expect(snake.some((c) => c.x === food.x && c.y === food.y)).toBe(false);
	});

	it('tickInterval accelerates with score and floors at the difficulty minimum', () => {
		const f = SNAKE_DIFFS.facile;
		expect(tickInterval(0, f)).toBe(f.baseTick);
		expect(tickInterval(10, f)).toBe(f.baseTick - 10 * f.accel);
		expect(tickInterval(1000, f)).toBe(f.minTick);
		// Harder levels start faster than easier ones.
		expect(SNAKE_DIFFS.difficile.baseTick).toBeLessThan(SNAKE_DIFFS.facile.baseTick);
	});

	it('generateRocks: requested count, off the start row, deterministic by seed', () => {
		const n = SNAKE_DIFFS.difficile.rocks;
		const a = generateRocks(SNAKE_CFG, n, mulberry32(11));
		const b = generateRocks(SNAKE_CFG, n, mulberry32(11));
		expect(a.length).toBe(n);
		expect(a).toEqual(b); // deterministic
		const cy = Math.floor(SNAKE_CFG.rows / 2);
		for (const r of a) expect(r.y).not.toBe(cy); // start lane stays clear
	});

	it('createSnakeLevel: apples never sit on rocks, fully reproducible from a seed', () => {
		const lvl = createSnakeLevel(SNAKE_CFG, SNAKE_DIFFS.difficile, mulberry32(7));
		const rockKeys = new Set(lvl.rocks.map((r) => `${r.x},${r.y}`));
		for (const c of lvl.seq) expect(rockKeys.has(`${c.x},${c.y}`)).toBe(false);
		const lvl2 = createSnakeLevel(SNAKE_CFG, SNAKE_DIFFS.difficile, mulberry32(7));
		expect(lvl2).toEqual(lvl);
	});

	it('hitting a rock ends the game', () => {
		const s = seq(8);
		let st = createSnake(SNAKE_CFG, s); // facing right at center
		const head = st.snake[0];
		st = { ...st, rocks: [{ x: head.x + 1, y: head.y }] }; // rock straight ahead
		const next = stepSnake(st, SNAKE_CFG, s);
		expect(next.status).toBe('over');
	});
});
