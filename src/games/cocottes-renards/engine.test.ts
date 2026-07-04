import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { createGame, placeTower, step, TOWER, FOX, type State, type Fox } from './engine';

const addFox = (s: State, row: number, x: number, type: Fox['type'] = 'normal'): void => {
	const base = FOX[type];
	s.foxes.push({ id: s.nextId++, type, row, x, hp: base.hp * s.hpMul, maxHp: base.hp * s.hpMul, eating: false });
};
const run = (s: State, seconds: number, rng: () => number): void => {
	const STEP = 1 / 60;
	for (let t = 0; t < seconds * 60; t++) step(s, STEP, rng);
};

describe('cocottes-renards engine', () => {
	it('placeTower checks grain, cooldown and occupancy', () => {
		const s = createGame(1, mulberry32(1));
		s.spawnTimer = 1e9;
		s.grain = 40; // below any cost
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(false); // too poor
		s.grain = 500;
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(true);
		expect(s.grain).toBe(500 - TOWER.lanceuse.cost);
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(false); // occupied cell
		expect(placeTower(s, 'costaude', 1, 2)).toBe(true); // free cell ok
	});

	it('a lanceuse eventually kills a fox crossing its lane', () => {
		const s = createGame(1, mulberry32(2));
		s.spawnTimer = 1e9;
		s.grain = 999;
		expect(placeTower(s, 'lanceuse', 0, 1)).toBe(true);
		addFox(s, 0, 7, 'normal');
		run(s, 20, mulberry32(2));
		expect(s.killed).toBeGreaterThanOrEqual(1);
		expect(s.score).toBeGreaterThanOrEqual(1);
		expect(s.over).toBe(false);
	});

	it('a pondeuse produces grain over time', () => {
		const s = createGame(1, mulberry32(3));
		s.spawnTimer = 1e9;
		s.grain = 999;
		placeTower(s, 'pondeuse', 0, 0);
		const after = s.grain; // 999 - 50
		run(s, 8, mulberry32(3)); // one production tick (~7s), no trickle yet (~10s)
		expect(s.grain).toBeGreaterThanOrEqual(after + 25);
	});

	it('piment clears its whole lane immediately', () => {
		const s = createGame(1, mulberry32(4));
		s.spawnTimer = 1e9;
		s.grain = 999;
		addFox(s, 2, 6);
		addFox(s, 2, 4);
		addFox(s, 3, 5); // other lane, survives
		expect(placeTower(s, 'piment', 2, 0)).toBe(true);
		expect(s.foxes.every((f) => f.row !== 2)).toBe(true);
		expect(s.foxes.some((f) => f.row === 3)).toBe(true);
		expect(s.killed).toBe(2);
	});

	it('an uncontested fox reaches the henhouse and ends the game', () => {
		const s = createGame(1, mulberry32(5));
		s.spawnTimer = 1e9;
		addFox(s, 0, 1);
		run(s, 10, mulberry32(5));
		expect(s.over).toBe(true);
	});

	it('is deterministic: same seed + same actions → same state', () => {
		const play = (): State => {
			const s = createGame(1, mulberry32(7));
			const rng = mulberry32(7);
			const STEP = 1 / 60;
			s.grain = 999;
			for (let t = 0; t < 600; t++) {
				if (t === 30) placeTower(s, 'lanceuse', 2, 1);
				if (t === 120) placeTower(s, 'costaude', 1, 3);
				step(s, STEP, rng);
			}
			return s;
		};
		const a = play();
		const b = play();
		expect(b.killed).toBe(a.killed);
		expect(b.grain).toBeCloseTo(a.grain, 6);
		expect(b.foxes.map((f) => [f.row, Math.round(f.x * 1000)])).toEqual(a.foxes.map((f) => [f.row, Math.round(f.x * 1000)]));
	});
});
