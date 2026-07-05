import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { createGame, placeTower, collectGrain, step, waveType, TOWER, FOX, COLS, type State, type Fox, type FoxType } from './engine';

const addFox = (s: State, row: number, x: number, type: Fox['type'] = 'normal'): void => {
	const base = FOX[type];
	s.foxes.push({
		id: s.nextId++,
		type,
		row,
		x,
		hp: base.hp * s.hpMul,
		maxHp: base.hp * s.hpMul,
		eating: false,
		slow: 0,
		jumps: type === 'sauteur' ? 1 : 0,
	});
};
const run = (s: State, seconds: number, rng: () => number): void => {
	const STEP = 1 / 60;
	for (let t = 0; t < seconds * 60; t++) step(s, STEP, rng);
};
const silenceWaves = (s: State): void => {
	s.waveTimer = 1e9;
};

describe('cocottes-renards engine', () => {
	it('placeTower checks grain, cooldown and occupancy', () => {
		const s = createGame(1, mulberry32(1));
		silenceWaves(s);
		s.grain = 20; // below any cost
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(false); // too poor
		s.grain = 500;
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(true);
		expect(s.grain).toBe(500 - TOWER.lanceuse.cost);
		expect(placeTower(s, 'lanceuse', 0, 2)).toBe(false); // occupied cell
		expect(placeTower(s, 'costaude', 1, 2)).toBe(true); // free cell ok
	});

	it('a lanceuse eventually kills a fox crossing its lane', () => {
		const s = createGame(1, mulberry32(2));
		silenceWaves(s);
		s.grain = 999;
		expect(placeTower(s, 'lanceuse', 0, 1)).toBe(true);
		addFox(s, 0, 7, 'normal');
		run(s, 20, mulberry32(2));
		expect(s.killed).toBeGreaterThanOrEqual(1);
		expect(s.score).toBeGreaterThanOrEqual(1);
		expect(s.over).toBe(false);
	});

	it('a pondeuse lays a collectable grain token, and collecting credits grain', () => {
		const s = createGame(1, mulberry32(3));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'pondeuse', 0, 0);
		const after = s.grain; // 999 - 50
		run(s, 6, mulberry32(3)); // one production tick (~5s), no trickle yet (~8s)
		expect(s.grains.length).toBeGreaterThanOrEqual(1);
		const token = s.grains.find((g) => !g.sky)!;
		expect(token.value).toBe(25);
		const before = s.grain;
		expect(collectGrain(s, token.id)).toBe(25);
		expect(s.grain).toBe(before + 25);
		expect(s.grains.some((g) => g.id === token.id)).toBe(false);
		expect(s.grain).toBeGreaterThan(after);
	});

	it('an uncollected token auto-collects after its delay (never lost)', () => {
		const s = createGame(1, mulberry32(31));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'pondeuse', 0, 0);
		const after = s.grain;
		run(s, 16, mulberry32(31)); // first token spawns ~5s, auto-collects ~9s later
		expect(s.grain).toBeGreaterThanOrEqual(after + 25);
	});

	it('piment clears its whole lane immediately', () => {
		const s = createGame(1, mulberry32(4));
		silenceWaves(s);
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
		silenceWaves(s);
		addFox(s, 0, 1);
		run(s, 10, mulberry32(5));
		expect(s.over).toBe(true);
	});

	it('the glacière slows the foxes it hits', () => {
		const s = createGame(1, mulberry32(11));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'glaciere', 0, 1);
		addFox(s, 0, 5, 'blinde'); // tanky, survives long enough to get frosted
		run(s, 3, mulberry32(11));
		const fox = s.foxes.find((f) => f.row === 0);
		expect(fox).toBeDefined();
		expect(fox!.slow).toBeGreaterThan(0);
	});

	it('a sauteur leaps over the first tower once', () => {
		const s = createGame(1, mulberry32(12));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'costaude', 0, 3); // a blocker to hop over
		addFox(s, 0, 5, 'sauteur');
		run(s, 3, mulberry32(12));
		const fox = s.foxes.find((f) => f.row === 0);
		expect(fox).toBeDefined();
		expect(fox!.jumps).toBe(0); // jump consumed
		expect(fox!.x).toBeLessThan(3); // now past the tower
	});

	it('a creuseur is egg-immune until it reaches midfield', () => {
		const s = createGame(1, mulberry32(13));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'lanceuse', 0, 1);
		addFox(s, 0, 6, 'creuseur'); // starts in the right half (x > COLS/2)
		run(s, 2.5, mulberry32(13));
		const fox = s.foxes.find((f) => f.row === 0)!;
		expect(fox.x).toBeGreaterThan(COLS / 2); // still burrowed
		expect(fox.hp).toBe(fox.maxHp); // took no egg damage
		run(s, 6, mulberry32(13)); // emerges past midfield, now hittable
		const still = s.foxes.find((f) => f.row === 0);
		if (still) expect(still.hp).toBeLessThan(still.maxHp);
	});

	it('an armed œuf-mine detonates on contact with area damage', () => {
		const s = createGame(1, mulberry32(14));
		silenceWaves(s);
		s.grain = 999;
		placeTower(s, 'mine', 0, 2);
		addFox(s, 0, 6, 'normal'); // far enough that the mine arms before contact
		run(s, 12, mulberry32(14));
		expect(s.killed).toBeGreaterThanOrEqual(1);
		expect(s.towers.length).toBe(0); // mine consumed
		expect(s.over).toBe(false);
	});

	it('sends a méga renard on the 5th wave, bigger than a normal fox', () => {
		const s = createGame(1, mulberry32(9));
		const rng = mulberry32(9);
		let megaHp = 0;
		// Keep the henhouse safe (sweep foxes) so waves keep rolling to wave 5+.
		for (let t = 0; t < 60 * 60; t++) {
			step(s, 1 / 60, rng);
			const mega = s.foxes.find((f) => f.type === 'mega');
			if (mega) megaHp = mega.maxHp;
			s.foxes = s.foxes.filter((f) => f.x > 0.5);
		}
		expect(s.wave).toBeGreaterThanOrEqual(5);
		expect(megaHp).toBeGreaterThan(FOX.normal.hp * s.hpMul);
	});

	it('waveType introduces the new fox families as waves deepen', () => {
		const seen = new Set<FoxType>();
		const rng = mulberry32(21);
		for (let w = 1; w <= 20; w++) for (let i = 0; i < 40; i++) seen.add(waveType(w, rng));
		expect(seen.has('meute')).toBe(true);
		expect(seen.has('sauteur')).toBe(true);
		expect(seen.has('creuseur')).toBe(true);
		expect(seen.has('blinde')).toBe(true);
	});

	it('is deterministic: same seed + same actions → same state', () => {
		const play = (): State => {
			const s = createGame(1, mulberry32(7));
			const rng = mulberry32(7);
			const STEP = 1 / 60;
			s.grain = 999;
			for (let t = 0; t < 1500; t++) {
				if (t === 30) placeTower(s, 'lanceuse', 2, 1);
				if (t === 120) placeTower(s, 'costaude', 1, 3);
				if (t === 300) placeTower(s, 'gemellaire', 3, 2);
				step(s, STEP, rng);
			}
			return s;
		};
		const a = play();
		const b = play();
		expect(b.killed).toBe(a.killed);
		expect(b.wave).toBe(a.wave);
		expect(b.grain).toBeCloseTo(a.grain, 6);
		expect(b.grains.length).toBe(a.grains.length);
		expect(b.foxes.map((f) => [f.row, Math.round(f.x * 1000)])).toEqual(a.foxes.map((f) => [f.row, Math.round(f.x * 1000)]));
	});
});
