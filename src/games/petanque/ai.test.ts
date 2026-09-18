import { describe, it, expect } from 'vitest';
import { makeTerrain, SURFACES, type SurfaceId } from './terrain';
import { makeBoule, makeJack, place, settle, cloneSim, throwVelocity, type Sim, type Boule } from './engine';
import { initMatch13, type Match13 } from './rules13';
import {
	planThrow, planJack, solveSpeed, launch, laneBlocked, decide, skillForLevel,
	MIN_SKILL, MAX_SKILL,
} from './ai';

const board = (id: SurfaceId = 'terre-battue', amp = 0.02): Sim =>
	({ t: makeTerrain(4242, SURFACES[id], amp, { slope: 0 }), bs: [], rng: 0 });

const state = (over: Partial<Match13> = {}): Match13 =>
	({ ...initMatch13(13, 0), phase: 'play', circle: { x: 2, y: 1 }, ...over });

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
	Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const parked = (s: Sim, x: number, y: number, side: 0 | 1): Boule => place(s.t, makeBoule(x, y, side));

/** Play one planned throw for real and report where it stopped. */
function shoot(s: Sim, m: Match13, side: 0 | 1, jack: Boule, skill: number, rng: number): Boule {
	const c = cloneSim(s);
	const j = c.bs.find((b) => b.side === -1) ?? jack;
	const th = planThrow(c, j, m, side, skill, rng);
	const b = launch(c, m.circle, side, th);
	c.bs.push(b);
	settle(c, undefined, 30);
	return b;
}

describe('the throw solver', () => {
	const from = { x: 2, y: 1 };
	const solved = (s: Sim, want: number): number => {
		const sp = solveSpeed(s, from, 0, 0, 1, want, 0.5);
		const b = launch(s, from, 0, throwVelocity(0, 1, sp, 0.5));
		settle({ t: s.t, bs: [b], rng: s.rng }, undefined, 30);
		return dist(from, b) - want;
	};

	// A smooth bench measures the SOLVER. On a real pitch the same test would measure the ground.
	it('hits the asked distance to the centimetre on a flat pebble-free bench', () => {
		for (const id of ['terre-battue', 'gravier-gros', 'sable'] as SurfaceId[]) {
			const s: Sim = { t: makeTerrain(4242, SURFACES[id], 0, { slope: 0, noPebbles: true }), bs: [], rng: 0 };
			for (const want of [6.5, 8, 9.5]) expect(Math.abs(solved(s, want))).toBeLessThan(0.03);
		}
	});

	/* On a real pitch a boule sometimes catches a dip at one isolated speed, so the distance curve
	   has dropouts and no solver can promise the donnee. What it must do is never be fooled INTO a
	   dropout — which a plain bisection was, by over a metre. Clay is the hard case here precisely
	   because it rolls the furthest: the longer the roll, the more ground there is to bite. */
	it('stays close on a real pitch, and is never metres out', () => {
		for (const id of ['terre-battue', 'gravier-gros'] as SurfaceId[]) {
			const errs: number[] = [];
			for (let k = 0; k < 12; k++) {
				const s: Sim = { t: makeTerrain(k * 7919 + 13, SURFACES[id], 0.03), bs: [], rng: k };
				for (const want of [6.5, 8, 9.5]) errs.push(Math.abs(solved(s, want)));
			}
			errs.sort((a, b) => a - b);
			expect(errs[Math.floor(errs.length / 2)]).toBeLessThan(0.05);
			expect(errs[errs.length - 1]).toBeLessThan(0.8);
		}
	});

	it('needs more power for a longer donnee', () => {
		const s = board();
		const from = { x: 2, y: 1 };
		const a = solveSpeed(s, from, 0, 0, 1, 6.5, 0.5);
		const b = solveSpeed(s, from, 0, 0, 1, 9.5, 0.5);
		expect(b).toBeGreaterThan(a + 0.3);
	});

	// Sand kills the roll, so the same donnee has to be carried much further through the air.
	it('needs more power on sand than on clay for the same donnee', () => {
		const from = { x: 2, y: 1 };
		const clay = solveSpeed(board('terre-battue'), from, 0, 0, 1, 8, 0.5);
		const sand = solveSpeed(board('sable'), from, 0, 0, 1, 8, 0.5);
		expect(sand).toBeGreaterThan(clay * 1.1);
	});
});

describe('the skill knob', () => {
	// The whole levels ladder rests on this one property. If the spread does not shrink, the
	// ladder is a placebo no matter what the win rates say.
	it('a better player scatters less around the jack', () => {
		const s = board();
		const jack = place(s.t, makeJack(2, 8.5));
		s.bs.push(jack);
		const m = state();
		const spread = (skill: number): number => {
			const ds: number[] = [];
			for (let k = 0; k < 24; k++) ds.push(dist(shoot(s, m, 0, jack, skill, k * 17 + 3), jack));
			return ds.reduce((a, b) => a + b, 0) / ds.length;
		};
		const weak = spread(MIN_SKILL);
		const strong = spread(MAX_SKILL);
		expect(strong).toBeLessThan(weak * 0.6);
		expect(strong).toBeLessThan(0.5); // a strong AI parks it within half a metre on average
	});

	it('maps the levels ladder onto the full range, monotonically', () => {
		expect(skillForLevel(1)).toBeCloseTo(MIN_SKILL, 6);
		expect(skillForLevel(100)).toBeCloseTo(MAX_SKILL, 6);
		for (let lv = 2; lv <= 100; lv++) expect(skillForLevel(lv)).toBeGreaterThan(skillForLevel(lv - 1));
		expect(skillForLevel(250, 200)).toBeCloseTo(MAX_SKILL, 6); // clamped past the last level
	});
});

describe('point or shoot', () => {
	const s = board();
	const jack = place(s.t, makeJack(2, 8.5));

	it('points when nothing of the opponent is on the ground', () => {
		const sim: Sim = { ...board(), bs: [jack] };
		expect(decide(sim, jack, state(), 0, 0.9)).toBe('point');
	});

	it('points when it already holds the point', () => {
		const sim: Sim = { ...board(), bs: [jack, parked(s, 2, 8.6, 0), parked(s, 2, 9.4, 1)] };
		expect(decide(sim, jack, state(), 0, 0.9)).toBe('point');
	});

	// A boule glued to the jack cannot be out-pointed, so a player who can shoot, shoots.
	it('shoots an unpointable opponent boule — but only if it can', () => {
		const sim: Sim = { ...board(), bs: [jack, parked(s, 2.1, 8.5, 1)] };
		expect(decide(sim, jack, state(), 0, 0.9)).toBe('shoot');
		expect(decide(sim, jack, state(), 0, MIN_SKILL)).toBe('point');
	});

	it('sees a boule parked in the lane, and ignores one beside it', () => {
		const from = { x: 2, y: 1 }, to = { x: 2, y: 8.5 };
		const onLine = makeBoule(2.02, 5, 1);
		expect(laneBlocked([onLine], from, to)).toBe(true);
		expect(laneBlocked([makeBoule(2.6, 5, 1)], from, to)).toBe(false);
		expect(laneBlocked([{ ...onLine, live: false }], from, to)).toBe(false);
	});
});

describe('the AI never disturbs the real match', () => {
	it('planning leaves the sim and its grain counter untouched', () => {
		const s = board('gravier-gros', 0.05);
		const jack = place(s.t, makeJack(2.1, 8.2));
		s.bs.push(jack, parked(s, 2.3, 8.4, 1));
		const snap = JSON.stringify({ rng: s.rng, bs: s.bs });
		planThrow(s, jack, state(), 0, 0.8, 11);
		planJack(s, state(), 0.8, 11);
		expect(JSON.stringify({ rng: s.rng, bs: s.bs })).toBe(snap);
	});

	it('the same plan replays identically', () => {
		const s = board();
		const jack = place(s.t, makeJack(2, 8.5));
		s.bs.push(jack);
		const m = state();
		expect(planThrow(s, jack, m, 0, 0.7, 5)).toEqual(planThrow(s, jack, m, 0, 0.7, 5));
		expect(planJack(s, m, 0.7, 5)).toEqual(planJack(s, m, 0.7, 5));
	});
});

describe('the jack throw', () => {
	it('lands legally most of the time, and a beginner misses more often', () => {
		const rate = (skill: number): number => {
			let ok = 0;
			for (let k = 0; k < 30; k++) {
				const s = board();
				const m = state({ phase: 'throw-jack' });
				const j = launch(s, m.circle, 0, planJack(s, m, skill, k * 13 + 1), true);
				s.bs.push(j);
				settle(s, undefined, 30);
				if (j.live && Math.abs(dist(m.circle, j) - 8) <= 2) ok++;
			}
			return ok / 30;
		};
		expect(rate(MAX_SKILL)).toBeGreaterThan(0.8);
		expect(rate(MIN_SKILL)).toBeLessThan(rate(MAX_SKILL));
	});
});
