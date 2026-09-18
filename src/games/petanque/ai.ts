/**
 * PETANQUE — the opponent. Two stages: decide whether to point or to shoot, then execute with an
 * error that shrinks as `skill` grows.
 *
 * The throw solver replays the REAL engine on a clone (binary search on speed, ~14 sims, which is
 * nothing). So the AI plays with exactly the same physics as the player: it cannot cheat, and
 * there is no second physics model to keep in sync. Clones also mean the grain counter of the real
 * sim never advances while the AI is thinking.
 */

import { type Sim, type Boule, makeBoule, makeJack, place, throwVelocity, settle, cloneSim } from './engine';
import { hashN } from './terrain';
import { type Match13, type Side, other, MIN_JACK, MAX_JACK } from './rules13';

export type Intent = 'point' | 'shoot';

export interface Throw {
	intent: Intent;
	vx: number;
	vy: number;
	vz: number;
	aim: { x: number; y: number }; // where it was trying to land, for the HUD
}

const MIN_SKILL = 0.25;
const MAX_SKILL = 0.95;

/* Aim error, calibrated against measurement E2: a 20 mm lateral sigma at 7.5 m is ~2.7 mrad and
   gives a 45 % carreau rate, a 5 mm sigma is ~0.7 mrad and gives 98 %. */
const ANG_WORST = 0.0115; // rad
const ANG_BEST = 0.0007;
const SPD_WORST = 0.060; // relative
const SPD_BEST = 0.008;

const UNPOINTABLE = 0.22; // m — an opponent boule this close is easier to shoot than to out-point
const COMFORT = 0.55; // m — beyond this, pointing is the obvious play
const LANE_R = 0.13; // m — a boule this close to the path blocks it

const norm = (skill: number): number => {
	const k = (skill - MIN_SKILL) / (MAX_SKILL - MIN_SKILL);
	return k < 0 ? 0 : k > 1 ? 1 : k;
};

/** Approximately normal, without transcendentals, and reproducible from a counter. */
function gauss(n: number, seed: number): number {
	const a = hashN(n * 3, seed), b = hashN(n * 3 + 1, seed), c = hashN(n * 3 + 2, seed);
	return (a + b + c - 1.5) / 0.5;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
	const dx = a.x - b.x, dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

/** A hard ground lets the boule run, so the donnée sits short; on sand you have to carry it. */
const elevationFor = (s: Sim, intent: Intent): number =>
	intent === 'shoot' ? 0.36 : 0.45 + s.t.surface.rollFriction * 0.35;

/** Is something of ours or theirs sitting on the path? Then pointing is risky. */
export function laneBlocked(bs: Boule[], from: { x: number; y: number }, to: { x: number; y: number }): boolean {
	const dx = to.x - from.x, dy = to.y - from.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1e-6) return false;
	const ux = dx / len, uy = dy / len;
	for (const b of bs) {
		if (!b.live || b.side === -1) continue;
		const t = (b.x - from.x) * ux + (b.y - from.y) * uy;
		if (t < 1 || t > len - 0.35) continue; // ignore what is at our feet or right at the jack
		const px = from.x + ux * t, py = from.y + uy * t;
		if (Math.sqrt((b.x - px) ** 2 + (b.y - py) ** 2) < LANE_R) return true;
	}
	return false;
}

/** Start a throw: the body sits on the ground at the circle, airborne the moment it leaves. */
export function launch(s: Sim, from: { x: number; y: number }, side: Side, v: { vx: number; vy: number; vz: number }, asJack = false): Boule {
	const b = asJack ? makeJack(from.x, from.y) : makeBoule(from.x, from.y, side);
	place(s.t, b);
	b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
	b.rolling = false;
	return b;
}

/** Replay one throw on a clone. Returns where the new body came to rest. */
function tryThrow(s: Sim, from: { x: number; y: number }, side: Side, dirX: number, dirY: number, speed: number, elev: number, asJack: boolean):
	{ x: number; y: number; live: boolean } {
	const c = cloneSim(s);
	const b = launch(c, from, side, throwVelocity(dirX, dirY, speed, elev), asJack);
	c.bs.push(b);
	settle(c, undefined, 30);
	return { x: b.x, y: b.y, live: b.live };
}

const SCAN = 8; // coarse samples across the speed window
const REFINE = 6; // halvings inside the bracket the scan found

/**
 * Speed that brings the body to rest `want` metres away, decided by replaying the real engine —
 * no closed form, so the AI cannot know anything the player could not.
 *
 * Distance grows with speed at roughly 2.4 m per m/s, but NOT smoothly: on a long-rolling ground
 * a boule occasionally catches a dip or a pebble and stops a metre short at one isolated speed.
 * A plain bisection reads that dropout as "too weak", walks the wrong way, and lands over a metre
 * off. Hence a coarse scan first — an outlier can misroute the refinement but cannot survive as
 * the answer, because we return the best speed actually measured rather than an untested midpoint.
 */
export function solveSpeed(s: Sim, from: { x: number; y: number }, side: Side, dirX: number, dirY: number, want: number, elev: number, asJack = false): number {
	let bestSp = 3, bestErr = Infinity;
	const probe = (sp: number): number => {
		const r = tryThrow(s, from, side, dirX, dirY, sp, elev, asJack);
		const d = r.live ? dist(from, r) : 99;
		const err = d > 90 ? 90 : Math.abs(d - want);
		if (err < bestErr) { bestErr = err; bestSp = sp; }
		return d;
	};

	const step = (14 - 3) / SCAN;
	let lo = 3, hi = 0;
	for (let i = 1; i <= SCAN; i++) {
		const sp = 3 + i * step;
		if (probe(sp) >= want) { hi = sp; break; }
		lo = sp;
	}
	if (hi === 0) return bestSp; // even the hardest throw falls short

	for (let i = 0; i < REFINE; i++) {
		const mid = (lo + hi) / 2;
		if (probe(mid) < want) lo = mid; else hi = mid;
	}
	return bestSp;
}

/** Who holds the point right now, among the boules on the ground. */
function bests(bs: Boule[], jack: Boule): [number, number] {
	const best: [number, number] = [Infinity, Infinity];
	for (const b of bs) {
		if (!b.live || (b.side !== 0 && b.side !== 1)) continue;
		const d = dist(b, jack);
		if (d < best[b.side]) best[b.side] = d;
	}
	return best;
}

/** Point or shoot. Shooting is for when out-pointing is unlikely, not for when it is merely hard. */
export function decide(s: Sim, jack: Boule, state: Match13, side: Side, skill: number): Intent {
	const foe = other(side);
	const best = bests(s.bs, jack);
	const target = s.bs.find((b) => b.live && b.side === foe && Math.abs(dist(b, jack) - best[foe]) < 1e-9);
	if (!target) return 'point'; // nothing to shoot at
	if (best[side] < best[foe]) return 'point'; // we already hold it, just add

	const k = norm(skill);
	if (best[foe] > COMFORT) return 'point';
	if (best[foe] < UNPOINTABLE) return k > 0.25 ? 'shoot' : 'point';
	if (laneBlocked(s.bs, state.circle, jack)) return k > 0.35 ? 'shoot' : 'point';

	// Behind, running out of boules: take the risk.
	const behind = state.scores[foe] - state.scores[side];
	if (behind >= 3 && state.left[side] <= 1) return k > 0.3 ? 'shoot' : 'point';
	return 'point';
}

/** The throw the AI actually makes: the ideal one, then blurred by skill. */
export function planThrow(s: Sim, jack: Boule, state: Match13, side: Side, skill: number, rng: number): Throw {
	const from = state.circle;
	const intent = decide(s, jack, state, side, skill);
	const k = norm(skill);
	const elev = elevationFor(s, intent);

	let aim = { x: jack.x, y: jack.y };
	if (intent === 'shoot') {
		const foe = other(side);
		const best = bests(s.bs, jack);
		const t = s.bs.find((b) => b.live && b.side === foe && Math.abs(dist(b, jack) - best[foe]) < 1e-9);
		if (t) aim = { x: t.x, y: t.y };
	}

	const dx = aim.x - from.x, dy = aim.y - from.y;
	const len = Math.sqrt(dx * dx + dy * dy) || 1;
	const dirX = dx / len, dirY = dy / len;

	// A tir is thrown flat and fast straight at the boule; a point is solved for its resting spot.
	const ideal = intent === 'shoot'
		? Math.min(13, 6.2 + len * 0.42)
		: solveSpeed(s, from, side, dirX, dirY, len, elev);

	const ang = (ANG_WORST + (ANG_BEST - ANG_WORST) * k) * gauss(rng, s.t.seed);
	const spd = ideal * (1 + (SPD_WORST + (SPD_BEST - SPD_WORST) * k) * gauss(rng + 991, s.t.seed));
	const ex = dirX - ang * dirY, ey = dirY + ang * dirX; // small rotation, no sin/cos

	const v = throwVelocity(ex, ey, spd, elev);
	return { intent, vx: v.vx, vy: v.vy, vz: v.vz, aim };
}

/**
 * The jack throw. Aimed at the comfortable middle of the legal window, so a weak opponent still
 * misses it often enough for the hand-placing rule to come up.
 */
export function planJack(s: Sim, state: Match13, skill: number, rng: number): { vx: number; vy: number; vz: number; aim: { x: number; y: number } } {
	const k = norm(skill);
	const from = state.circle;
	const want = (MIN_JACK + MAX_JACK) / 2 + gauss(rng + 77, s.t.seed) * 0.6;
	const lateral = gauss(rng + 313, s.t.seed) * 0.35;
	const aim = { x: from.x + lateral, y: from.y + state.dir * want };
	const dx = aim.x - from.x, dy = aim.y - from.y;
	const len = Math.sqrt(dx * dx + dy * dy) || 1;
	const dirX = dx / len, dirY = dy / len;
	const elev = 0.5;

	const ideal = solveSpeed(s, from, 0, dirX, dirY, len, elev, true);
	const ang = (ANG_WORST + (ANG_BEST - ANG_WORST) * k) * 6 * gauss(rng + 5, s.t.seed);
	const spd = ideal * (1 + (SPD_WORST + (SPD_BEST - SPD_WORST) * k) * 1.5 * gauss(rng + 1223, s.t.seed));
	const v = throwVelocity(dirX - ang * dirY, dirY + ang * dirX, spd, elev);
	return { ...v, aim };
}

/** Skill for a levels ladder position, 1-based. */
export const skillForLevel = (level: number, count = 100): number =>
	MIN_SKILL + (MAX_SKILL - MIN_SKILL) * Math.min(1, Math.max(0, (level - 1) / (count - 1)));

export { MIN_SKILL, MAX_SKILL };
