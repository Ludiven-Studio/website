import { describe, it, expect } from 'vitest';
import {
	createGame as newGame, stepGame, stepGuest, resetGame, collectEvents, buildSim, applySim,
	setCarLookup, BASE_CAR, GRID, CELL, pct, cellAt, cellCenterX, cellCenterZ, TOTAL, HALF, CFG, ITEM, KIND, angleDiff,
	START_POS,
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

	it('fills the loop, away from home, when you cross your own line', () => {
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // no rival blades around
		me.x = 0; me.z = 0; me.heading = 0; // out in neutral ground: a hard circle self-crosses
		me.px = me.x; me.pz = me.z;
		let closes = 0, read = 0;
		for (let i = 0; i < 600; i++) {
			const before = me.trail.length;
			stepGame(s, 1, 0, 1 / 60);
			for (; read < s.events.length; read++) {
				const ev = s.events[read];
				expect(ev.type).not.toBe('snap'); // crossing your own line never costs the loop now
				// from > 0 is the self-cut: re-entering the island just won is an ordinary capture.
				if (ev.type !== 'capture' || ev.from === 0) continue;
				closes++;
				expect(before).toBeGreaterThan(CFG.grace); // never the fresh tail
				expect(ev.gain).toBeGreaterThan(0); // the ring really enclosed something
			}
			expect(me.alive).toBe(true);
		}
		expect(closes).toBeGreaterThan(0);
		// The point of the rule: flood the player's ground out of its start square and some of what
		// it owns is not reached — a zone standing on its own, away from the main one.
		const seen = new Uint8Array(TOTAL);
		const stack = [cellAt(START_POS[0][0], START_POS[0][1])];
		seen[stack[0]] = 1;
		while (stack.length) {
			const cell = stack.pop()!;
			const col = cell % GRID;
			for (const n of [col > 0 ? cell - 1 : -1, col < GRID - 1 ? cell + 1 : -1, cell - GRID, cell + GRID]) {
				if (n >= 0 && n < TOTAL && !seen[n] && s.owner[n] === 1) { seen[n] = 1; stack.push(n); }
			}
		}
		let detached = 0;
		for (let c = 0; c < TOTAL; c++) if (s.owner[c] === 1 && !seen[c]) detached++;
		expect(detached).toBeGreaterThan(0);
	});

	it('lays a trail with no gap in it, even flat out', () => {
		// capture()'s border flood is 4-connected, so ONE skipped cell is a hole it leaks through and
		// the loop dies with no feedback at all. A step at top speed covers more than a cell, so the
		// grid has to walk the segment: 24 % of the links skipped a cell before it did.
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // no blade, no snap
		me.x = -40; me.z = 0; me.heading = 0; me.vh = 0; // due east: the worst case, one axis eats it all
		me.px = me.x; me.pz = me.z;
		for (let i = 0; i < 400 && me.x < 45; i++) stepGame(s, 0, 1, 1 / 60);
		expect(me.speed * (1 / 60)).toBeGreaterThan(CELL); // it really did cover >1 cell per step
		expect(me.trail.length).toBeGreaterThan(100);
		for (let i = 1; i < me.trail.length; i++) {
			const a = me.trail[i - 1], b = me.trail[i];
			const dr = Math.abs(((a / GRID) | 0) - ((b / GRID) | 0));
			const dc = Math.abs((a % GRID) - (b % GRID));
			expect(Math.max(dr, dc)).toBe(1); // touching, corner included: a diagonal wall still seals
		}
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
		expect(Math.hypot(me.x - START_POS[0][0], me.z - START_POS[0][1])).toBeLessThan(1); // back on START_POS[0]
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
		down.cars[0].speed = CFG.cruise; // everyone now leaves from a standstill: brake needs a rolling car
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
		// Bounds track START_POS: the squares sit at ±40 (cells 20 and 180), so the ring has to
		// clear them on the outside while still enclosing both corners.
		const r0 = 5, r1 = 60, c0 = 5, c1 = 194;
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

describe('bolides driving', () => {
	/** Hero alone on row 100 (neutral the whole way), nose east, rolling at cruise. `x0` leaves
	 *  room for the whole run: touching the rail is what wallDrag clamps the speed with. */
	function solo(x0: number) {
		const s = createGame();
		const me = s.cars[0];
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; }); // no rival blades
		me.x = x0; me.z = 0; me.heading = 0; me.speed = CFG.cruise;
		me.px = me.x; me.pz = me.z;
		return { s, me };
	}

	it('holds the bots pace on 0 and never goes backwards on the brake', () => {
		const { s, me } = solo(-40);
		for (let i = 0; i < 120; i++) stepGame(s, 0, 0, 1 / 60);
		expect(me.speed).toBeCloseTo(CFG.cruise, 1);
		for (let i = 0; i < 120; i++) stepGame(s, 0, -1, 1 / 60);
		expect(me.speed).toBeGreaterThanOrEqual(CFG.minSpeed - 1e-6);
	});

	it('braking tightens the circle: the grip tool the mode is built on', () => {
		// Same lock, two speeds. The claim in the settings copy is about the RADIUS, not the angular
		// rate — a fast car swings its nose quicker (speed/radius) while tracing a much wider arc.
		const radius = (throttle: number) => {
			const { s, me } = solo(-40);
			for (let i = 0; i < 180; i++) stepGame(s, 1, throttle, 1 / 60);
			return Math.abs(me.speed / me.turnRate);
		};
		expect(radius(-1)).toBeLessThan(radius(1));
	});
});

/* ---------- the roster: one bolide per seat ---------- */

const MIXED = ['bunker', 'comet', 'hornet', 'drifter'];

/** A fixed input tape: the same steer/throttle every run, so only the sim can differ. */
const TAPE = Array.from({ length: 1800 }, (_, i) => [i % 120 < 60 ? 1 : -1, i % 80 < 40 ? 1 : -1] as const);

/** Row 100 is neutral ground: every home square sits in rows 11-29 or 171-189. */
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
		let rings = 0;
		// Long arcs one way, shorter the other: the tape has to CROSS ITS OWN LINE or the assertion
		// below is vacuous. A self-cut fills only the ring, so the guest has to be told where that
		// ring started — get it wrong and it owns the run-out too, which is the one desync this
		// rule can cause. A flat-out corner now runs wide (the radius opens with speed), so the old
		// 60-frame alternation never closes a loop any more. Retuned again to 300/220 once the trail
		// became continuous: 400/300 drew a clean spiral that never met itself (scripts/_bosnap.mjs).
		for (let i = 0; i < 3000 && !host.over; i++) {
			stepGame(host, i % 300 < 220 ? 1 : -1, 1, 1 / 60);
			rings += host.events.filter((e) => e.type === 'capture' && e.from > 0).length;
			collectEvents(host, pending);
			host.events.length = 0;
			stepGuest(guest, i % 90 < 45 ? -1 : 1, 1, 1 / 60);
			if (i % 3 === 2) applySim(guest, buildSim(host, pending));
		}
		expect(host.clock).toBeGreaterThan(10);
		expect(rings).toBeGreaterThan(0); // the tape really closed a loop on itself
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

describe('bolides pickups', () => {
	/** Solo on a fully painted arena: the car never leaves the slippery surface, so the corner
	 *  under test is the same one every time and only the bonus can change its outcome. */
	const cornerOnPaint = (gripT: number) => {
		const s = newGame(SEED);
		s.owner.fill(1);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		me.x = 0; me.z = 0; me.px = 0; me.pz = 0;
		me.heading = 0; me.vh = 0; me.speed = CFG.cruise;
		let drift = 0;
		for (let i = 0; i < 90; i++) {
			me.gripT = gripT; // held on, so the whole corner is measured under the same surface
			stepGame(s, 1, 0, 1 / 60);
			if (me.drifting) drift++;
		}
		return drift;
	};

	it('makes paint hold like bare ground while it runs', () => {
		// The bonus is one term in stepCar's traction ceiling. The only proof worth having is that
		// the corner which breaks traction on paint stops breaking it under the bonus.
		expect(cornerOnPaint(0)).toBeGreaterThan(30);
		expect(cornerOnPaint(10)).toBe(0);
	});

	it('is grabbed by driving over it, and the slot goes dark then returns to its post', () => {
		const s = newGame(SEED, 1, undefined, true);
		expect(s.items).toHaveLength(ITEM.plan.length);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		s.items[0].kind = KIND.grip; // a slot's kind is redrawn on every respawn; pin it to test grip
		const { x, z } = s.items[0];
		me.x = x; me.z = z; me.px = x; me.pz = z;
		stepGame(s, 0, 0, 1 / 60);
		expect(me.gripT).toBe(ITEM.grip);
		expect(s.events.some((e) => e.type === 'item' && e.id === me.id)).toBe(true);
		expect(s.items[0].at).toBeGreaterThan(s.clock); // taken: the slot is dark for ITEM.respawn
		expect(s.items[0].x === x && s.items[0].z === z).toBe(false);
	});

	it('keeps a doorway slot on the arena side of its own home, before and after a grab', () => {
		// The whole point of the doorway: a loop always comes home to close, so the bonus is picked
		// up on the way back OUT, over one's own paint. A slot drifting away breaks that promise.
		const s = newGame(SEED, 1, undefined, true);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		const [cx, cz] = START_POS[0];
		for (let i = 0; i < 6; i++) {
			const it = s.items[0];
			expect(Math.max(Math.abs(it.x - cx), Math.abs(it.z - cz))).toBeCloseTo(ITEM.door, 6);
			expect(Math.abs(it.x) < Math.abs(cx) || Math.abs(it.z) < Math.abs(cz)).toBe(true); // arena side
			expect(Math.max(Math.abs(it.x), Math.abs(it.z))).toBeLessThan(HALF);
			it.at = 0; // light it back up, then take it again to force a fresh placement
			me.x = it.x; me.z = it.z; me.px = it.x; me.pz = it.z;
			stepGame(s, 0, 0, 1 / 60);
		}
	});

	/** Attacker in seat 1, victim in seat 2 with a long trail on neutral ground, both away from home
	 *  so nothing but the cut under test moves. Same shape as the bunker duel above. */
	function duel() {
		const s = newGame(SEED, 1, ['roadster', 'comet', 'roadster', 'roadster']);
		const attacker = s.cars[0];
		const victim = s.cars[1];
		s.cars.slice(2).forEach((c) => { c.alive = false; c.respawnAt = 1e9; });
		victim.outside = false;
		layTrail(s, victim, 100, 100);
		layTrail(s, attacker, 98, 12);
		attacker.outside = true;
		return { s, attacker, victim };
	}

	it('makes the whole trail uncuttable and breaks the blade of whoever tries', () => {
		// The half worth having: loops die to a rival 23.7x a race and to a self-cut 1.3x. Under the
		// shield even the oldest cell holds, which the car's own cfg.shield window never covers.
		const { s, attacker, victim } = duel();
		expect(victim.cfg.shield).toBe(0); // no built-in armour: the pickup is the only thing at work
		victim.shieldT = ITEM.shield;
		driveOnto(s, attacker, victim.trail[0]);
		expect(victim.alive).toBe(true);
		expect(victim.trail.length).toBe(100);
		expect(attacker.trail.length).toBe(0);
		expect(s.events.some((e) => e.type === 'snap' && e.id === attacker.id)).toBe(true);
	});

	it('never blocks your own landing, shield up or down', () => {
		// The shield guards the line against rivals. Were it to stop a self-cut too it would stop the
		// fill, so the pickup that promises "untouchable" would quietly cost you the zone.
		const crossOwnLine = (shieldT: number) => {
			const { s, victim } = duel();
			victim.outside = true;
			victim.shieldT = shieldT;
			driveOnto(s, victim, victim.trail[0]);
			return {
				len: victim.trail.length,
				landed: s.events.some((e) => e.type === 'capture' && e.id === victim.id),
			};
		};
		expect(crossOwnLine(0)).toEqual({ len: 0, landed: true });
		expect(crossOwnLine(ITEM.shield)).toEqual({ len: 0, landed: true });
	});

	/** Solo, one straight line at full throttle over ground owned by `owner`. No steering, so the
	 *  only thing that can move the speed is the surface — and the arena is 100 wide, so 1.5 s from
	 *  x = -40 never reaches the far rail, whose slide would cap the speed itself. */
	const straightLine = (owner: number, zoneT: number) => {
		const s = newGame(SEED);
		s.owner.fill(owner);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		me.x = -40; me.z = 0; me.px = -40; me.pz = 0;
		me.heading = 0; me.vh = 0; me.speed = CFG.cruise;
		for (let i = 0; i < 90; i++) {
			s.cars[owner - 1].zoneT = zoneT; // held on, so the whole run is under the same surface
			stepGame(s, 0, 1, 1 / 60);
		}
		expect(Math.abs(me.x)).toBeLessThan(HALF - 1);
		return me.speed;
	};

	it('turns your paint into tar for everyone but you', () => {
		// Control first, same seed and same line: without the item, foe paint is as fast as any.
		const clear = straightLine(2, 0);
		expect(clear).toBeGreaterThan(CFG.cruise);
		expect(straightLine(2, ITEM.zone)).toBeLessThan(CFG.cruise);
		// Your own tar never sticks to you, or the item would cost more than it pays.
		expect(straightLine(1, ITEM.zone)).toBeCloseTo(clear, 6);
	});

	it('stays out of the arena unless asked for — an online race never sees one', () => {
		// Free play and the daily ask for them; a guest must not get them, because stepGuest has no
		// grid and dead-reckons the other cars, so no two clients would agree on who grabbed what.
		const s = createGame();
		expect(s.items).toHaveLength(0);
		let items = 0;
		for (let i = 0; i < 1200; i++) {
			stepGame(s, i % 300 < 220 ? 1 : -1, 1, 1 / 60);
			items += s.events.filter((e) => e.type === 'item').length;
			s.events.length = 0;
		}
		expect(items).toBe(0);
		expect(s.cars.every((c) => c.gripT === 0 && c.shieldT === 0 && c.zoneT === 0)).toBe(true);
		expect(s.cars.every((c) => c.boostT === 0 && c.wideT === 0)).toBe(true);
	});
});

describe('bolides rocket', () => {
	/** Solo, one live slot pinned to `kind` and parked under the car, then the single step that takes
	 *  it. Every other slot is held dark so nothing else can fire in the same tick. `hold` keeps
	 *  stepping with the car pinned, so a distance check measures the throw and not the drive.
	 *  `speed` is pinned too, and defaults to a standstill: the throw leads the car by its own speed,
	 *  so leaving it to the race would make every landing spot depend on the launch tick. */
	function grab(kind: number, x: number, z: number, hold = 0, speed = 0) {
		const s = newGame(SEED, 1, undefined, true);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		me.x = x; me.z = z; me.px = x; me.pz = z;
		me.heading = 0; me.vh = 0; me.speed = speed;
		for (const it of s.items) it.at = 1e9;
		Object.assign(s.items[0], { at: 0, kind, x, z });
		s.events.length = 0;
		stepGame(s, 0, 0, 1 / 600);
		for (let i = 0; i < Math.ceil(hold * 600); i++) {
			me.x = x; me.z = z; me.px = x; me.pz = z; me.speed = 0;
			stepGame(s, 0, 0, 1 / 600);
		}
		return { s, me };
	}

	const FLIGHT = ITEM.blastT + ITEM.blasts * ITEM.blastGap + 0.05; // last shell down, plus a margin

	it('throws the shells before it paints anything', () => {
		// The whole point of the arc: on the frame you grab it nothing is on the ground yet. If the
		// paint landed here the renderer would be drawing shells over territory they had not hit.
		const before = newGame(SEED, 1, undefined, true).counts[1];
		const { s } = grab(KIND.rocket, 0, 0);
		expect(s.events.filter((e) => e.type === 'rocket')).toHaveLength(ITEM.blasts);
		expect(s.events.some((e) => e.type === 'blast')).toBe(false);
		expect(s.shots).toHaveLength(ITEM.blasts);
		expect(s.counts[1]).toBe(before);
	});

	it('lands each shell exactly where its own arc was announced', () => {
		const { s } = grab(KIND.rocket, 0, 0, FLIGHT);
		const fired = s.events.filter((e) => e.type === 'rocket');
		const landed = s.events.filter((e) => e.type === 'blast');
		expect(landed).toHaveLength(fired.length);
		// Pairwise and in order: the renderer arcs shell k to fired[k] and must find the splat there.
		for (let k = 0; k < fired.length; k++) {
			expect(landed[k].x).toBe(fired[k].x);
			expect(landed[k].z).toBe(fired[k].z);
		}
		expect(s.shots).toHaveLength(0); // nothing left in the air
	});

	it('leads a moving car, so the paint lands in front of it and not behind', () => {
		// Why the lead exists at all: a shell is up for blastT, and at cruise the car covers ~13 units
		// in that time against a 7 unit throw. Without the lead every splat landed behind the camera
		// (bolides-onscreen.mjs measured 31 % of impacts in frame).
		// Same pinned spot and the same heading in both runs, so the rosette is identical and the ONLY
		// difference left between the two sets of targets is the lead itself.
		const still = grab(KIND.rocket, 0, 0).s.events.filter((e) => e.type === 'rocket');
		const fast = grab(KIND.rocket, 0, 0, 0, CFG.cruise).s.events.filter((e) => e.type === 'rocket');
		expect(fast).toHaveLength(still.length);
		let prev = 0;
		for (let k = 0; k < fast.length; k++) {
			// Heading is 0, so the whole lead is +x and none of it may leak sideways.
			expect(fast[k].z).toBeCloseTo(still[k].z, 6);
			const push = fast[k].x - still[k].x;
			expect(push).toBeGreaterThan(prev); // later shells fly longer, so they lead further
			prev = push;
		}
		// It has to be worth the trouble: the last shell leads by more than the whole throw radius,
		// which is what puts the landing spot clear of the car's tail.
		expect(prev).toBeGreaterThan(ITEM.blastD);
	});

	it('lays the shells in a rosette, with none of them dead ahead', () => {
		// The pattern the player is meant to read: four shells a quarter turn apart, the first one
		// blastSpin off the nose. It matters beyond looks — a shell landing straight ahead paints the
		// cell the car is about to drive into, and arriving on your own cell closes your ring, so it
		// would bank a loop nobody asked for. Standstill, so the aim point is the car itself.
		const { s, me } = grab(KIND.rocket, 0, 0);
		const fired = s.events.filter((e) => e.type === 'rocket');
		expect(fired).toHaveLength(4);
		// Measured across the path, never along it. Heading is 0, so the lead is entirely +x and every
		// shell carries a different one (it flies blastGap longer than the one before) — the sideways
		// offset is the only part of the throw the lead cannot touch, and it is the part that says
		// whether a shell is dead ahead.
		const side = fired.map((e) => e.z - me.z);
		for (let k = 0; k < side.length; k++) {
			const want = ITEM.blastD * Math.sin(ITEM.blastSpin + (k * 2 * Math.PI) / ITEM.blasts);
			expect(side[k]).toBeCloseTo(want, 6);
		}
		// Two each side: the rosette straddles the car's line instead of sitting on it, and nothing is
		// close enough to the nose for its splat to reach the cell the car is driving into.
		expect(side.filter((v) => v > 0)).toHaveLength(2);
		expect(Math.min(...side.map(Math.abs))).toBeGreaterThan(ITEM.blastR);
	});

	it('splats your paint around you without closing a loop', () => {
		const { s, me } = grab(KIND.rocket, 0, 0, FLIGHT);
		const blasts = s.events.filter((e) => e.type === 'blast');
		expect(blasts).toHaveLength(ITEM.blasts);
		for (const b of blasts) {
			expect(b.id).toBe(me.id);
			expect(Math.hypot(b.x - me.x, b.z - me.z)).toBeLessThan(ITEM.blastD + 1);
		}
		// The ground is real, and it is small on purpose: this is the only pickup that paints without
		// a ring, so it is a forward camp first and a handful of tiles second.
		const won = s.counts[1] - newGame(SEED, 1, undefined, true).counts[1];
		expect(won).toBeGreaterThan(50);
		expect(won).toBeLessThan(TOTAL * 0.01);
		expect(s.counts).toEqual(recount(s));
		// No ring was closed, so nothing of the run-out was banked and the trail is untouched.
		expect(s.events.some((e) => e.type === 'capture')).toBe(false);
	});

	it('never takes a square of a rival home', () => {
		// Fired point blank into seat 2's home. setOwner refuses another car's home cell, so the worst
		// a rocket can do is ring the square — it can never lock a rival out of its own respawn.
		const [hx, hz] = START_POS[1];
		const { s } = grab(KIND.rocket, hx, hz, FLIGHT);
		for (let i = 0; i < TOTAL; i++) if (s.home[i] === 2) expect(s.owner[i]).toBe(2);
		expect(s.counts[1]).toBeGreaterThan(newGame(SEED, 1, undefined, true).counts[1]); // not vacuous
	});
});

describe('bolides boost and wide trail', () => {
	/** Solo, one straight line at full throttle from the west side, boost held on or off. Same shape
	 *  as the tar run above: nothing steers, so only the speed term can move the answer. */
	const topSpeed = (boostT: number) => {
		const s = newGame(SEED);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		const me = s.cars[0];
		me.x = -40; me.z = 0; me.px = -40; me.pz = 0;
		me.heading = 0; me.vh = 0; me.speed = CFG.cruise;
		for (let i = 0; i < 90; i++) {
			me.boostT = boostT;
			stepGame(s, 0, 1, 1 / 60);
		}
		expect(Math.abs(me.x)).toBeLessThan(HALF - 1); // never reached the rail, whose slide caps speed
		return me.speed;
	};

	it('lifts the top speed above the roster maximum', () => {
		const flat = topSpeed(0);
		expect(flat).toBeCloseTo(CFG.maxSpeed, 0);
		expect(topSpeed(ITEM.boostT)).toBeGreaterThan(flat * 1.1);
	});

	/** Drive due east across neutral ground, wide or not, and hand back the line it laid. Seat 2 is
	 *  kept alive to play the blade; seats 3 and 4 are out of the way. */
	const line = (wideT: number) => {
		const s = newGame(SEED);
		s.cars.slice(2).forEach((c) => { c.alive = false; c.respawnAt = 1e9; });
		const me = s.cars[0];
		me.x = -20; me.z = 0; me.px = -20; me.pz = 0;
		me.heading = 0; me.vh = 0; me.speed = CFG.cruise; me.outside = true;
		s.cars[1].outside = false; // its own loop stays out of this
		for (let i = 0; i < 60; i++) {
			me.wideT = wideT;
			stepGame(s, 0, 0, 1 / 60);
		}
		return { s, me, foe: s.cars[1] };
	};

	const rows = (car: Car) => new Set(car.trail.map((c) => Math.floor(c / GRID)));

	it('lays ITEM.wideR cells either side of the path', () => {
		expect(rows(line(0).me).size).toBe(1); // due east on one row: the control has to be a hairline
		expect(rows(line(ITEM.wide).me).size).toBe(1 + 2 * ITEM.wideR);
	});

	it('makes a flank cell cut like any other, so a fat line is a fat target too', () => {
		const { s, me, foe } = line(ITEM.wide);
		const mid = Math.floor(me.trail[0] / GRID); // visitCell pushes the centre cell before its flanks
		const flank = me.trail.filter((c) => Math.floor(c / GRID) !== mid);
		expect(flank.length).toBeGreaterThan(20);
		driveOnto(s, foe, flank[0]);
		expect(me.alive).toBe(false);
		expect(s.events.some((e) => e.type === 'kill' && e.killer === foe.id)).toBe(true);
	});

	/** Full lock out of home until the first ring closes: how long the car had to drive to earn it. */
	const ringClock = (wideT: number) => {
		const s = newGame(SEED);
		s.cars.slice(1).forEach((b) => { b.alive = false; b.respawnAt = 1e9; });
		for (let i = 0; i < 1200; i++) {
			s.cars[0].wideT = wideT;
			stepGame(s, 1, 0, 1 / 60);
			if (s.events.some((e) => e.type === 'capture' && e.id === 1)) return s.clock;
			s.events.length = 0;
		}
		return -1;
	};

	it('still has to draw a real ring while the line is fat', () => {
		// A fat line pushes 1 + 2*wideR cells per step, so an unscaled `grace` window would be spent in
		// a third of the driving and the car would close on the cell beside it for no ground at all.
		const flat = ringClock(0);
		expect(flat).toBeGreaterThan(0);
		expect(ringClock(ITEM.wide)).toBeGreaterThan(flat * 0.7);
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
