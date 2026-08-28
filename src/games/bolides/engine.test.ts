import { describe, it, expect } from 'vitest';
import { createGame, stepGame, resetGame, pct, TOTAL, HALF, CFG, type GameState } from './engine';

/** Recount ownership straight from the grid — the source of truth for setOwner bookkeeping. */
function recount(s: GameState): number[] {
	const c = new Array(s.counts.length).fill(0);
	for (let i = 0; i < TOTAL; i++) c[s.owner[i]]++;
	return c;
}

describe('bolides engine', () => {
	it('starts with four non-overlapping home squares that tile the grid', () => {
		const s = createGame();
		const c = recount(s);
		expect(c.reduce((a, b) => a + b, 0)).toBe(TOTAL);
		expect(c).toEqual(s.counts);
		for (let id = 1; id <= 4; id++) expect(s.counts[id]).toBeGreaterThan(0);
	});

	it('keeps counts consistent with the grid through captures and kills', () => {
		const s = createGame();
		for (let i = 0; i < 2000; i++) {
			stepGame(s, i % 120 < 60 ? 1 : -1, i % 80 < 40 ? 1 : -1, 1 / 60);
			if (i % 97 === 0) expect(s.counts).toEqual(recount(s));
		}
		expect(s.counts).toEqual(recount(s));
		expect(recount(s).reduce((a, b) => a + b, 0)).toBe(TOTAL);
	});

	it('captures territory when the player loops back home', () => {
		const s = createGame();
		const home0 = s.counts[1];
		let peak = home0;
		for (let i = 0; i < 800; i++) {
			stepGame(s, 1, 0, 1 / 60); // constant hard turn -> a circle that pokes out and returns
			peak = Math.max(peak, s.counts[1]);
		}
		expect(peak).toBeGreaterThan(home0); // an enclosed loop was claimed
		expect(pct(s, 1)).toBeGreaterThanOrEqual(0);
		expect(pct(s, 1)).toBeLessThanOrEqual(100);
	});

	it('resets cleanly in place', () => {
		const s = createGame();
		const fresh = recount(createGame());
		for (let i = 0; i < 500; i++) stepGame(s, 1, 0, 1 / 60);
		resetGame(s);
		expect(recount(s)).toEqual(fresh);
		expect(s.clock).toBe(0);
	});

	it('slides along the arena wall instead of dying there', () => {
		const s = createGame();
		const me = s.cars[0];
		me.x = HALF - 1; me.z = 0; me.heading = 0; // nose into the east wall
		me.px = me.x; me.pz = me.z;
		for (let i = 0; i < 600; i++) stepGame(s, 0, 1, 1 / 60);
		expect(me.alive).toBe(true);
		expect(me.x).toBeLessThanOrEqual(HALF);
		expect(Math.abs(me.z)).toBeGreaterThan(5); // scraped along the wall, didn't stall
		// The rail must stay a bad line: full throttle on it is slower than open track.
		expect(me.speed).toBeLessThan(CFG.cruise);
	});

	it('survives a corner instead of flip-flopping onto its own trail', () => {
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // isolate the corner
		me.x = HALF - 2; me.z = HALF - 2; me.heading = Math.PI / 4; // straight into the SE corner
		me.px = me.x; me.pz = me.z;
		for (let i = 0; i < 900; i++) stepGame(s, 0, 1, 1 / 60);
		expect(me.alive).toBe(true);
		expect(Math.hypot(me.x - HALF, me.z - HALF)).toBeGreaterThan(10); // slid out of the corner
	});

	it('throttle accelerates and brake slows the player', () => {
		const up = createGame();
		for (let i = 0; i < 60; i++) stepGame(up, 0, 1, 1 / 60); // full throttle
		expect(up.cars[0].speed).toBeGreaterThan(CFG.cruise + 1);
		expect(up.cars[0].speed).toBeLessThanOrEqual(CFG.maxSpeed + 1e-6);

		const down = createGame();
		for (let i = 0; i < 60; i++) stepGame(down, 0, -1, 1 / 60); // full brake
		expect(down.cars[0].speed).toBeLessThan(CFG.cruise - 1);
		expect(down.cars[0].speed).toBeGreaterThanOrEqual(CFG.minSpeed - 1e-6);
	});
});
