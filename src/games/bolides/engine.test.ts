import { describe, it, expect } from 'vitest';
import {
	createGame as newGame, stepGame, stepGuest, resetGame, collectEvents, buildSim, applySim,
	setCarLookup, BASE_CAR, GRID, pct, cellAt, cellCenterX, cellCenterZ, TOTAL, HALF, CFG, angleDiff,
	type Car, type GameState, type NetEvent,
} from './engine';
import { BOLIDES, DEFAULT_CAR, carCfg } from './cars';
import { goCars, type GoMsg } from './net';

// The engine can't import the roster (cars.ts is built from CFG), so the roster is installed.
setCarLookup(carCfg);

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
		const car = s.cars[0];
		const home0 = s.counts[1];
		let peak = home0;
		// Out on a straight line, then steer at the home centroid until the loop closes. Holding
		// full lock instead is a knife-edge path — it encloses at exactly 60 straight-out frames
		// and at neither 40 nor 80 — so it tests one trajectory rather than the capture rule.
		let back = false;
		for (let i = 0; i < 900; i++) {
			if (car.outside && car.trail.length > 40) back = true;
			let steer = 0;
			if (back) {
				const n = s.counts[1] || 1;
				const home = Math.round(s.sumR[1] / n) * GRID + Math.round(s.sumC[1] / n);
				const want = Math.atan2(cellCenterZ(home) - car.z, cellCenterX(home) - car.x);
				steer = Math.max(-1, Math.min(1, angleDiff(want, car.heading) * 2));
			}
			stepGame(s, steer, 0, 1 / 60);
			peak = Math.max(peak, s.counts[1]);
		}
		expect(peak).toBeGreaterThan(home0); // an enclosed loop was claimed
		expect(pct(s, 1)).toBeGreaterThanOrEqual(0);
		expect(pct(s, 1)).toBeLessThanOrEqual(100);
	});

	it('breaks traction on cornering load: paint at cruise, bare ground only flat out', () => {
		// The wheel is RAMPED here, like a held arrow key (KEY_RAMP in BolidesGame.tsx). What
		// breaks traction is the cornering load, not how fast the wheel moved: the retired jab
		// model could not be triggered by a hold at all, so paint felt dead to a keyboard player.
		const corner = (onPaint: boolean, throttle: number) => {
			const s = createGame();
			const car = s.cars[0];
			if (!onPaint) { car.x = 0; car.z = 0; } // the arena centre belongs to nobody at kickoff
			expect(s.owner[cellAt(car.x, car.z)] === 0).toBe(!onPaint);
			// Pin the car on the surface under test: it must reach the throttle's speed without
			// wandering onto the other one.
			const home = { x: car.x, z: car.z };
			const step = (steer: number) => { stepGame(s, steer, throttle, 1 / 60); car.x = home.x; car.z = home.z; };
			for (let i = 0; i < 240; i++) step(0);
			car.heading = 0; car.vh = 0; car.turnRate = 0;
			let steer = 0, drifted = false, curve = 0;
			for (let i = 0; i < 180; i++) {
				steer = Math.min(1, steer + 2.2 / 60);
				const was = car.vh;
				step(steer);
				drifted ||= car.drifting;
				// The radius that matters is the PATH's: vh is where the car actually goes.
				if (i >= 150) curve += (Math.abs(angleDiff(car.vh, was)) * 60) / car.speed;
			}
			return { drifted, radius: 30 / curve };
		};
		expect(corner(true, -1).drifted).toBe(false); // crawling on paint: the tyres hold
		expect(corner(true, 0).drifted).toBe(true); // cruise on paint: hold the corner and it goes
		expect(corner(false, 0).drifted).toBe(false); // cruise on bare ground: grip
		expect(corner(false, 1).drifted).toBe(true); // flat out on bare ground: it goes too
		// Slow cars pivot, fast cars run wide. Both rows grip, so this is the tyres, not a slide.
		expect(corner(false, -1).radius).toBeLessThan(corner(false, 0).radius);
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

describe('bolides home squares', () => {
	const homeCells = (s: GameState, id: number) => {
		const out: number[] = [];
		for (let i = 0; i < TOTAL; i++) if (s.home[i] === id) out.push(i);
		return out;
	};

	it('never lets a rival capture swallow a start square', () => {
		const s = createGame();
		const foe = s.cars[1];
		// A ring wide enough to enclose Rouge's whole corner AND the foe's own ground, so the foe is
		// standing inside its territory the moment the loop closes. Driving it would take a lap of
		// bot-dependent steering; a trail is just a list of cells, so hand it one.
		const r0 = 20, r1 = 80, c0 = 20, c1 = 180;
		const ring: number[] = [];
		for (let c = c0; c <= c1; c++) { ring.push(r0 * GRID + c); ring.push(r1 * GRID + c); }
		for (let r = r0 + 1; r < r1; r++) { ring.push(r * GRID + c0); ring.push(r * GRID + c1); }
		for (const cell of ring) { s.trail[cell] = foe.id; foe.trail.push(cell); }
		foe.outside = true;

		const mine = homeCells(s, 1);
		expect(mine.length).toBe((CFG.homeHalf * 2 + 1) ** 2);
		const before = s.counts[2];
		stepGame(s, 0, 0, 1 / 600); // short step: nobody leaves its cell, so only the capture happens
		expect(s.counts[2]).toBeGreaterThan(before); // the capture really ran
		for (const cell of mine) expect(s.owner[cell]).toBe(1);
		expect(s.counts[1]).toBeGreaterThanOrEqual(mine.length);
		// The point of the rule: there is always ground to come home to, so a loop can still close.
		expect(s.owner[cellAt(s.cars[0].x, s.cars[0].z)]).toBe(1);
		expect(s.counts).toEqual(recount(s));
	});

	it('rebuilds the mask on reset', () => {
		const s = createGame();
		resetGame(s);
		for (let id = 1; id <= 4; id++) expect(homeCells(s, id).length).toBe((CFG.homeHalf * 2 + 1) ** 2);
	});
});

describe('bolides pedal driving', () => {
	/** Hero alone on row 100 (neutral the whole way), nose east, rolling at cruise. `x0` has to
	 *  leave room for the WHOLE run: touching the rail is what wallDrag clamps the speed with, and
	 *  a reverse that ends on the wall reads as "the pedal never worked". */
	function solo(pedal: boolean, x0: number) {
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // no rival blades
		me.pedal = pedal;
		me.x = x0; me.z = 0; me.heading = 0; me.speed = CFG.cruise;
		me.px = me.x; me.pz = me.z;
		return { s, me };
	}

	it('stops on a released pedal and backs up on a negative one', () => {
		const { s, me } = solo(true, 0);
		for (let i = 0; i < 120; i++) stepGame(s, 0, 0, 1 / 60);
		expect(Math.abs(me.speed)).toBeLessThan(0.5); // hands off really is a standstill
		for (let i = 0; i < 120; i++) stepGame(s, 0, -1, 1 / 60);
		expect(me.speed).toBeLessThan(-1);
		// Reverse is a correction tool: it must stay slower than the pace everyone else keeps.
		expect(me.speed).toBeGreaterThanOrEqual(-CFG.maxSpeed * CFG.pedalReverse - 1e-6);
	});

	it('leaves cruise mode alone: 0 is the bots pace and the car never goes backwards', () => {
		const { s, me } = solo(false, -40);
		for (let i = 0; i < 120; i++) stepGame(s, 0, 0, 1 / 60);
		expect(me.speed).toBeCloseTo(CFG.cruise, 1);
		for (let i = 0; i < 120; i++) stepGame(s, 0, -1, 1 / 60);
		expect(me.speed).toBeGreaterThanOrEqual(CFG.minSpeed - 1e-6);
	});

	it('hands the trail back cell by cell when reversing instead of snapping the loop', () => {
		const { s, me } = solo(true, -30);
		for (let i = 0; i < 60; i++) stepGame(s, 0, 1, 1 / 60);
		// The pedal travels down through zero, so the line keeps growing until the car really backs
		// up. Snapshot at that moment, or the deceleration's own cells look like a failed rewind.
		for (let i = 0; i < 120 && me.speed >= 0; i++) stepGame(s, 0, -1, 1 / 60);
		expect(me.speed).toBeLessThan(0);
		const laid = me.trail.slice();
		expect(laid.length).toBeGreaterThan(CFG.grace); // long enough that a self-cross would snap
		s.events.length = 0;
		for (let i = 0; i < 120; i++) stepGame(s, 0, -1, 1 / 60);
		expect(me.alive).toBe(true);
		expect(s.events.some((e) => e.type === 'snap')).toBe(false); // backing up never costs the loop
		expect(me.trail.length).toBeGreaterThan(0);
		expect(me.trail.length).toBeLessThan(laid.length);
		expect(me.trail).toEqual(laid.slice(0, me.trail.length)); // a prefix: only the tail went back
		for (const c of laid.slice(me.trail.length)) expect(s.trail[c]).toBe(0);
		for (const c of me.trail) expect(s.trail[c]).toBe(me.id);
	});
});

/* ---------- the roster: one bolide per seat ---------- */

const MIXED = ['bunker', 'comet', 'hornet', 'drifter'];

/** A fixed input tape: the same steer/throttle every run, so only the sim can differ. */
const TAPE = Array.from({ length: 1800 }, (_, i) => [i % 120 < 60 ? 1 : -1, i % 80 < 40 ? 1 : -1] as const);

/** Row 100 is neutral ground: every home square sits in rows 41-59 or 141-159. */
const rowCell = (row: number, col: number) => row * GRID + col;

/** Lay `n` trail cells along a neutral row, exactly as updateGrid would. */
function layTrail(s: GameState, car: Car, row: number, n: number): void {
	car.trail.length = 0;
	for (let k = 0; k < n; k++) {
		const cell = rowCell(row, 50 + k);
		s.trail[cell] = car.id;
		car.trail.push(cell);
	}
}

/** Park the attacker on `cell` and take one step short enough that it stays there. */
function driveOnto(s: GameState, attacker: Car, cell: number): void {
	attacker.x = cellCenterX(cell); attacker.z = cellCenterZ(cell);
	attacker.px = attacker.x; attacker.pz = attacker.z;
	attacker.heading = 0; attacker.vh = 0;
	s.events.length = 0;
	stepGame(s, 0, 0, 1 / 600);
}

describe('bolides roster', () => {
	it('gives every seat the roster table its id names, and falls back on an unknown id', () => {
		for (const b of BOLIDES) {
			const s = newGame(SEED, 1, [b.id, b.id, b.id, b.id]);
			for (const car of s.cars) {
				expect(car.carId).toBe(b.id);
				expect(car.cfg).toEqual(carCfg(b.id));
			}
		}
		const junk = newGame(SEED, 1, ['no-such-car', '', 'bunker']);
		expect(junk.cars[0].cfg).toEqual(carCfg(DEFAULT_CAR));
		expect(junk.cars[1].cfg).toEqual(carCfg(DEFAULT_CAR));
		expect(junk.cars[2].cfg).toEqual(carCfg('bunker'));
		expect(junk.cars[3].cfg).toEqual(BASE_CAR); // no entry at all -> the base car
	});

	it('defaults to the base car, which is the shipped CFG', () => {
		const s = createGame();
		for (const car of s.cars) {
			expect(car.carId).toBe(DEFAULT_CAR);
			expect(car.cfg).toEqual({ ...CFG, shield: 0 });
			expect(car.cfg).toEqual(carCfg(DEFAULT_CAR));
		}
	});

	it('re-seats the roster on reset and keeps it when none is passed', () => {
		const s = createGame();
		resetGame(s, SEED, 1, MIXED);
		expect(s.cars.map((c) => c.carId)).toEqual(MIXED);
		resetGame(s, SEED, 1);
		expect(s.cars.map((c) => c.carId)).toEqual(MIXED);
	});

	it('replays the same seed and roster to the very same counts and add stream', () => {
		const play = () => {
			const s = newGame(SEED, 2, MIXED);
			s.record = true;
			for (const [steer, throttle] of TAPE) {
				stepGame(s, steer, throttle, 1 / 60);
				s.events.length = 0;
			}
			return { counts: s.counts.slice(), add: s.netAdd.slice(), clock: s.clock };
		};
		const a = play();
		const b = play();
		expect(a.add.length).toBeGreaterThan(100); // the tape really drove a race
		expect(b.counts).toEqual(a.counts);
		expect(b.add).toEqual(a.add);
		expect(b.clock).toBe(a.clock);
	});

	it('replays a mixed-roster host tick onto a guest and lands on the very same grid', () => {
		const host = newGame(SEED, 1, MIXED);
		host.record = true;
		const guest = newGame(SEED, 1, MIXED);
		guest.hero = 2;
		for (const c of guest.cars) { c.remote = c.id !== guest.hero; c.isBot = false; }
		const pending: NetEvent[] = [];
		let snaps = 0;
		// Long arcs one way, shorter the other: the tape has to CROSS ITS OWN LINE or the snap
		// assertion below is vacuous. A flat-out corner now runs wide (the radius opens with
		// speed), so the old 60-frame alternation never closes a loop any more.
		for (let i = 0; i < 3000 && !host.over; i++) {
			stepGame(host, i % 400 < 300 ? 1 : -1, 1, 1 / 60);
			snaps += host.events.filter((e) => e.type === 'snap').length;
			collectEvents(host, pending);
			host.events.length = 0;
			stepGuest(guest, i % 90 < 45 ? -1 : 1, 1, 1 / 60);
			if (i % 3 === 2) applySim(guest, buildSim(host, pending));
		}
		expect(host.clock).toBeGreaterThan(10);
		expect(snaps).toBeGreaterThan(0); // snaps are the shield's channel to the guests
		expect(guest.owner).toEqual(host.owner);
		expect(guest.trail).toEqual(host.trail);
	});
});

describe('bolides shield', () => {
	/** Attacker in seat 1, victim in seat 2 with a long trail on a neutral row. */
	function duel(victimCar: string) {
		const s = newGame(SEED, 1, ['roadster', victimCar, 'roadster', 'roadster']);
		const attacker = s.cars[0];
		const victim = s.cars[1];
		s.cars.slice(2).forEach((c) => { c.alive = false; c.respawnAt = 1e9; });
		// The victim sits home so its own updateGrid leaves the hand-laid trail alone.
		victim.outside = false;
		layTrail(s, victim, 100, 100);
		layTrail(s, attacker, 98, 12);
		attacker.outside = true;
		return { s, attacker, victim };
	}

	it('refuses the cut on a bunker fresh trail and snaps the attacker instead', () => {
		const { s, attacker, victim } = duel('bunker');
		const fresh = victim.trail[victim.trail.length - 1];
		driveOnto(s, attacker, fresh);
		expect(victim.alive).toBe(true);
		expect(victim.trail.length).toBe(100); // the armoured line is untouched
		expect(attacker.trail.length).toBe(0); // its own loop is gone
		expect(s.events.some((e) => e.type === 'snap' && e.id === attacker.id)).toBe(true);
		expect(s.events.some((e) => e.type === 'kill')).toBe(false);
	});

	it('kills a bunker normally on trail older than the shield window', () => {
		const { s, attacker, victim } = duel('bunker');
		expect(victim.cfg.shield).toBeGreaterThan(0);
		expect(victim.cfg.shield).toBeLessThan(100); // the hand-laid trail must outlive the window
		const old = victim.trail[0];
		driveOnto(s, attacker, old);
		expect(victim.alive).toBe(false);
		expect(s.events.some((e) => e.type === 'kill' && e.killer === attacker.id)).toBe(true);
		expect(attacker.trail.length).toBeGreaterThan(0); // the attacker keeps its loop
	});

	it('kills an unshielded car even on its freshest cell', () => {
		const { s, attacker, victim } = duel('comet');
		expect(victim.cfg.shield).toBe(0);
		driveOnto(s, attacker, victim.trail[victim.trail.length - 1]);
		expect(victim.alive).toBe(false);
		expect(s.events.some((e) => e.type === 'kill' && e.killer === attacker.id)).toBe(true);
	});

	/** Put the victim's freshest cell on ground the attacker owns, and keep the attacker's own
	 *  loop out of it (outside = false) so the cut is the only thing under test. */
	function trespass(victimCar: string) {
		const d = duel(victimCar);
		const cell = d.s.owner.findIndex((o) => o === d.attacker.id);
		d.s.trail[cell] = d.victim.id;
		d.victim.trail.push(cell);
		d.attacker.outside = false;
		return { ...d, cell };
	}

	it('cuts a rival trail that crosses your own ground', () => {
		const { s, attacker, victim, cell } = trespass('comet');
		driveOnto(s, attacker, cell);
		expect(victim.alive).toBe(false);
		expect(s.events.some((e) => e.type === 'kill' && e.killer === attacker.id)).toBe(true);
	});

	it('holds the bunker shield at home without snapping the defender', () => {
		const { s, attacker, victim, cell } = trespass('bunker');
		driveOnto(s, attacker, cell);
		expect(victim.alive).toBe(true);
		expect(attacker.trail.length).toBe(12); // no ring at stake at home, so nothing to lose
		expect(s.events.some((e) => e.type === 'snap')).toBe(false);
	});
});

describe('bolides go message', () => {
	it('reads a seat roster and degrades to the default car on junk', () => {
		const base: GoMsg = { seed: 1, diff: 1, ids: ['a', 'b', 'c', 'd'] };
		expect(goCars({ ...base, cars: MIXED }, 4)).toEqual(MIXED);
		expect(goCars(base, 4)).toEqual(new Array(4).fill(DEFAULT_CAR)); // an older host
		expect(goCars({ ...base, cars: ['bunker'] }, 4)).toEqual(['bunker', DEFAULT_CAR, DEFAULT_CAR, DEFAULT_CAR]);
		const junk = { ...base, cars: [1, null, { id: 'x' }, 'comet'] } as unknown as GoMsg;
		expect(goCars(junk, 4)).toEqual([DEFAULT_CAR, DEFAULT_CAR, DEFAULT_CAR, 'comet']);
		expect(goCars({ ...base, cars: 'bunker' } as unknown as GoMsg, 4)).toEqual(new Array(4).fill(DEFAULT_CAR));
		// An unknown id must still build a car, not throw.
		expect(() => newGame(SEED, 1, goCars({ ...base, cars: ['ghost'] }, 4))).not.toThrow();
	});
});
