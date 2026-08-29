import { describe, it, expect } from 'vitest';
import {
	createGame as newGame, stepGame, stepGuest, resetGame, collectEvents, buildSim, applySim,
	pct, cellCenterX, cellCenterZ, TOTAL, HALF, CFG, type GameState, type NetEvent,
} from './engine';

// createGame() defaults to a random seed, so the bots would play a different game on every run
// and every assertion below would be a coin toss. Pin it: a failure here must be reproducible.
const SEED = 20260829;
const createGame = (seed = SEED) => newGame(seed);

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
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // the rail alone, no rival blade
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

	it('drops the loop, not the car, when you cross your own line', () => {
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // no rival blades around
		me.x = 0; me.z = 0; me.heading = 0; // out in neutral ground: a hard circle self-crosses
		me.px = me.x; me.pz = me.z;
		let snaps = 0, read = 0;
		for (let i = 0; i < 600; i++) {
			const before = me.trail.length;
			stepGame(s, 1, 0, 1 / 60);
			for (; read < s.events.length; read++) {
				if (s.events[read].type !== 'snap') continue;
				snaps++;
				expect(before).toBeGreaterThan(CFG.grace); // never the fresh tail
				expect(me.trail.length).toBe(0); // the whole loop is gone
			}
			expect(me.alive).toBe(true);
		}
		expect(snaps).toBeGreaterThan(0);
	});

	it('respawns the player at the start point instead of ending the run', () => {
		const s = createGame();
		const me = s.cars[0];
		const foe = s.cars[1];
		me.x = 0; me.z = 0; me.heading = 0; // neutral ground: drive straight and lay a line
		me.px = me.x; me.pz = me.z;
		for (let i = 0; i < 40; i++) stepGame(s, 0, 0, 1 / 60);
		expect(me.trail.length).toBeGreaterThan(CFG.grace);
		// Only a rival's blade kills now, so put one on the middle of the player's line.
		const cut = me.trail[me.trail.length >> 1];
		foe.alive = true;
		foe.x = cellCenterX(cut); foe.z = cellCenterZ(cut);
		foe.px = foe.x; foe.pz = foe.z;
		stepGame(s, 0, 0, 1 / 600); // short step so the foe stays on that cell
		expect(me.alive).toBe(false);
		const died = s.clock;
		let back = -1;
		for (let i = 0; i < 400 && back < 0; i++) {
			stepGame(s, 0, 0, 1 / 60);
			if (me.alive) back = s.clock;
		}
		expect(s.over).toBe(false); // dying is a setback, not the end of the run
		expect(back - died).toBeCloseTo(CFG.respawnPlayer, 1);
		expect(Math.hypot(me.x + HALF * 0.5, me.z + HALF * 0.5)).toBeLessThan(1); // back on START_POS[0]
	});

	it('ends the run as soon as a car passes the win threshold', () => {
		const s = createGame();
		for (let i = 0; i < Math.floor(TOTAL * 0.55); i++) {
			const old = s.owner[i];
			if (old === 1) continue;
			s.owner[i] = 1; s.counts[old]--; s.counts[1]++;
		}
		stepGame(s, 0, 0, 1 / 60);
		expect(s.over).toBe(true);
		expect(s.winner).toBe(1);
		const frozen = s.clock;
		stepGame(s, 1, 1, 1 / 60);
		expect(s.clock).toBe(frozen); // a decided run no longer simulates
	});

	it('awards the buzzer to the biggest territory', () => {
		const s = createGame();
		s.clock = CFG.timeLimit - 1 / 120; // one step short of the buzzer
		s.counts[3] += 500; // make Vert the leader without crossing the win threshold
		s.counts[0] -= 500;
		expect(s.over).toBe(false);
		stepGame(s, 0, 0, 1 / 60);
		expect(s.over).toBe(true);
		expect(s.overByTime).toBe(true);
		expect(s.winner).toBe(3);
	});

	it('replays a host tick onto a guest and lands on the very same grid', () => {
		const host = createGame();
		host.record = true;
		const guest = createGame(); // same seed -> same arena; the grid then comes only from the host
		guest.hero = 2;
		for (const c of guest.cars) { c.remote = c.id !== guest.hero; c.isBot = false; }
		const pending: NetEvent[] = [];
		for (let i = 0; i < 3000 && !host.over; i++) {
			stepGame(host, i % 120 < 60 ? 1 : -1, 1, 1 / 60);
			collectEvents(host, pending);
			host.events.length = 0; // the shell drains them every frame; collecting twice would double them
			stepGuest(guest, i % 90 < 45 ? -1 : 1, 1, 1 / 60);
			if (i % 3 === 2) applySim(guest, buildSim(host, pending)); // 20 Hz, like the real send rate
		}
		expect(host.clock).toBeGreaterThan(10); // the run really happened
		expect(guest.owner).toEqual(host.owner);
		expect(guest.trail).toEqual(host.trail);
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
