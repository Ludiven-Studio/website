import { describe, it, expect } from 'vitest';
import { makeTerrain, SURFACES, type SurfaceId } from './terrain';
import { makeBoule, makeJack, place, settle, cloneSim, throwVelocity, type Sim, type Boule } from './engine';
import { initMatch13, jackCheck, MIN_JACK, MAX_JACK, type Match13 } from './rules13';
import {
	planThrow, planJack, jackThrow, JACK_SPREAD_PLAYER, solveSpeed, launch, laneBlocked, decide,
	skillForLevel, MIN_SKILL, MAX_SKILL,
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

/* Shooting the jack out: with the opponent's hand empty, a dead jack scores one point per boule
   still in ours. Only a strong AI sees it, and only when it pays. */
describe('shoot the jack', () => {
	const setup = (jy: number, id: SurfaceId = 'terre-battue'): { sim: Sim; jack: Boule } => {
		const sim = board(id);
		const jack = place(sim.t, makeJack(2, jy));
		sim.bs.push(jack, parked(sim, 2.1, jy, 1)); // the opponent glued to it: not out-pointable
		return { sim, jack };
	};
	const late = state({ left: [2, 0] }); // two boules in hand, the opponent's all thrown

	it('a strong AI takes the jack out when the opponent has nothing left', () => {
		const { sim, jack } = setup(9.5);
		expect(decide(sim, jack, late, 0, 0.9)).toBe('jack');
	});

	it('but not a middling one, and not while the opponent still holds boules', () => {
		const { sim, jack } = setup(9.5);
		expect(decide(sim, jack, late, 0, 0.62)).not.toBe('jack');
		expect(decide(sim, jack, state({ left: [2, 1] }), 0, 0.9)).not.toBe('jack');
	});

	it('not when one boule is left and the point is easy to take back', () => {
		const sim = board();
		const jack = place(sim.t, makeJack(2, 9.5));
		sim.bs.push(jack, parked(sim, 2.45, 9.5, 1)); // 45 cm off, lane clear
		expect(decide(sim, jack, state({ left: [2, 0] }), 0, 0.9)).toBe('point');
	});

	// Sand swallows the jack: no speed window sends it out, so the AI does not gamble on one.
	it('not on sand, where no run of speeds sends the jack out', () => {
		const { sim, jack } = setup(9.5, 'sable');
		expect(decide(sim, jack, late, 0, 0.95)).not.toBe('jack');
	});

	it('and the jack really leaves the pitch when it is thrown with the AI\'s own error', () => {
		const { sim } = setup(9.5);
		let out = 0;
		for (let k = 0; k < 20; k++) {
			const c = cloneSim(sim);
			const j = c.bs.find((b) => b.side === -1) as Boule;
			const th = planThrow(c, j, late, 0, 0.9, k * 17 + 3);
			expect(th.intent).toBe('jack');
			c.bs.push(launch(c, late.circle, 0, th));
			settle(c, undefined, 30);
			if (!j.live) out++;
		}
		expect(out).toBeGreaterThanOrEqual(16);
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

	/* The player now picks the spot and the jack is THROWN at it. That only reads as a choice if the
	   jack actually turns up there, and only stays a gamble if it does not turn up exactly there. */
	it('goes where the player pointed, with a spread that still costs something', () => {
		/* Swept, not sampled. The browser guard can only ever throw ONE jack, so the claim that the
		   ring is honoured has to be a distribution and it has to live here. Both ends of the legal
		   window and the roughest relief are in, because the whole miss is bounce, not aim. */
		const miss: number[] = [];
		for (const id of ['terre-battue', 'gravier-gros', 'sable'] as SurfaceId[]) {
			for (const amp of [0.02, 0.12]) {
				for (const want of [6.2, 8, 9.8]) {
					for (let k = 0; k < 12; k++) {
						const s = board(id, amp);
						const m = state({ phase: 'throw-jack' });
						const aim = { x: m.circle.x, y: m.circle.y + m.dir * want };
						const j = launch(s, m.circle, 0, jackThrow(s, m, aim, JACK_SPREAD_PLAYER, k * 7 + 3), true);
						s.bs.push(j);
						settle(s, undefined, 30);
						miss.push(dist(aim, j));
					}
				}
			}
		}
		miss.sort((a, b) => a - b);
		const mean = miss.reduce((a, b) => a + b, 0) / miss.length;
		expect(mean).toBeLessThan(0.6); // the spot is the throw, not a suggestion
		expect(miss[Math.floor(miss.length * 0.95)]).toBeLessThan(1.2); // 19 jacks in 20 land on the ring
		expect(miss[miss.length - 1]).toBeGreaterThan(0.1); // and never a free placement
	});

	/* The risk profile of aiming the jack. The ring now reaches the raw lines (the player picks the
	   risk), so these are what the player is choosing between: 6.5 / 9 m are safe, asymmetric because
	   a speed error stretches outwards, and the far raw edge misses the window often — the rule then
	   hands the placing to the opponent. */
	it('makes the window edges a real gamble and the inner window safe', () => {
		// 40 throws per board: with 20, one unlucky throw moved the far rate across the 5 % line
		// (6 of 120) while 480 throws put 9 m at 1.9 %.
		const rate = (want: number): number => {
			let out = 0, n = 0;
			for (const id of ['terre-battue', 'gravier-gros', 'sable'] as SurfaceId[]) {
				for (const amp of [0.02, 0.14]) {
					for (let k = 0; k < 40; k++) {
						const s = board(id, amp);
						const m = state({ phase: 'throw-jack' });
						const aim = { x: m.circle.x, y: m.circle.y + m.dir * want };
						const j = launch(s, m.circle, 0, jackThrow(s, m, aim, JACK_SPREAD_PLAYER, k * 7 + 3), true);
						s.bs.push(j);
						settle(s, undefined, 30);
						n++;
						if (jackCheck(m.circle, j) !== 'ok') out++;
					}
				}
			}
			return out / n;
		};
		expect(rate(MIN_JACK + 0.5)).toBeLessThan(0.05); // the near end of the ring
		expect(rate(MAX_JACK - 1.0)).toBeLessThan(0.05); // and the far one
		expect(rate(MAX_JACK - 0.15)).toBeGreaterThan(0.1); // the raw edge really is the trap
	});

	it('is the one code path the AI uses, so the AI jack is unchanged', () => {
		const s = board();
		const m = state({ phase: 'throw-jack' });
		expect(planJack(s, m, 0.7, 5)).toEqual(planJack(s, m, 0.7, 5));
		const aim = planJack(s, m, 0.7, 5).aim;
		expect(jackThrow(s, m, aim, { ang: 0, spd: 0 }, 5).aim).toEqual(aim);
	});
});
