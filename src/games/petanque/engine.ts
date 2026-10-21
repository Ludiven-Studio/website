/**
 * PETANQUE — pure engine (no UI, no three.js). A boule flies, lands, bounces, rolls on an
 * uneven ground, and stops. Metres, seconds, kilograms.
 *
 * Determinism is a hard requirement: the online match replays the same throws on both peers.
 * So this file must never call Math.random, Date.now, Math.hypot or Math.pow (the last two are
 * not guaranteed bit-identical across JS engines). engine.test.ts reads the source and fails
 * if any of them appears. The grain scatter uses a counter kept in the Sim, advanced in a fixed
 * order; previews and the AI run on a clone so they never advance the real one.
 */

import { type Terrain, type GroundSample, heightAt, gradAt, pebblesNear, inPitch, hashN, surfaceAt, gritAt } from './terrain';

export const G = 9.81;
export const BOULE_R = 0.0375; // 75 mm competition boule
export const BOULE_M = 0.7;
export const JACK_R = 0.015;
export const JACK_M = 0.012;

export const BOULE_REST = 0.90; // boule-boule restitution — this is what makes a carreau possible
const ROLL_VN = 0.35; // normal speed below which a bounce becomes a roll
const BOUNCE_VN = 1.6; // m/s — the rebound a boule tends to on clay, however hard it lands (13 cm ceiling)
const SLOPE_K = 5 / 7; // rolling sphere: only 5/7 of the slope acceleration reaches the centre
const PEBBLE_KICK = 0.55; // rad of deflection per unit bite
const PEBBLE_HOP = 0.15; // upward share of the speed when a boule climbs one
const JACK_PEBBLE_HOP = 0.9; // and when the jack does: a visible hop off a gravel stone (up to ~8 cm)
const SETTLE = 0.06; // m/s, below which a rolling boule is at rest
const MAX_SUB = 24;
/* The effet: side spin given by the hand. It turns the bounce a little towards its side, then
   curves the roll while it wears off; a strike mostly kills it. Zero spin touches nothing, so every
   throw without effet replays bit for bit. No sin/cos either: `deflect` shears. */
const SPIN_LAND = 0.20; // rad of extra turn at a bounce, full spin
const SPIN_ROLL = 0.65; // rad/s of curve while rolling, full spin
const SPIN_DECAY = 0.45; // share lost per second of roll
const SPIN_BOUNCE_KEEP = 0.8;
const SPIN_HIT_KEEP = 0.25;
/* Uneven pitches (terrain.rough set) only. Landing on a stone sends the boule off at an angle, away
   from the stone; the micro-gravel turns a rolling boule all along its run, more as it slows. A
   heavy boule pushes through both, a big one rides the grit. Previews and the AI plan on a blind
   sim that feels neither: they are what nobody can read on the ground. The stones a rolling boule
   meets are drawn where they lie, so the blind sim still meets them. */
const LAND_KICK = 0.9; // rad per unit bite
const LAND_MAX = 0.35; // rad, about 20 deg
const LAND_HOP = 0.12; // upward share of the speed
const GRIT = 4.4; // rad per second of run at full difficulty on grit 1, over a speed in m/s
const GRIT_V0 = 0.35; // m/s: below this a stone turns it no more than at this speed
const JACK_GRIT = 1.5;

/** A boule's make. The standard one is the website's boule, value for value. */
export interface Kit {
	m: number; // kg
	r: number; // m
	e: number; // restitution against another body: a soft (tendre) boule keeps less
	bite: number; // speed kept on landing: under 1 a soft boule sticks, over 1 a hard one runs on
	aim: number; // spread of the hand: a heavy or big boule is harder to hold steady
}

export const STANDARD_KIT: Kit = { m: BOULE_M, r: BOULE_R, e: BOULE_REST, bite: 1, aim: 1 };

export interface Boule {
	x: number;
	y: number;
	z: number; // height of the centre
	vx: number;
	vy: number;
	vz: number;
	r: number;
	m: number;
	side: 0 | 1 | -1; // -1 = the jack
	live: boolean; // false once it has left the pitch
	rolling: boolean;
	spin?: number; // the effet, -1 (left) to 1 (right) seen from behind the throw; absent = none
	e?: number; // the kit's restitution; absent = BOULE_REST
	bite?: number; // the kit's landing grip; absent = 1
}

/** A throw's velocity, and its effet when the hand gave one (see `Boule.spin`). */
export interface Velocity { vx: number; vy: number; vz: number; spin?: number; }

/** A contact the render layer may dramatise. Observational only — reporting changes nothing. */
export interface Impact {
	kind: 'ground' | 'boule' | 'pebble' | 'out';
	x: number;
	y: number;
	z: number;
	speed: number;
	jack?: boolean; // a 'boule' contact that involved the jack: wood, not steel
}

export interface Sim {
	t: Terrain;
	bs: Boule[];
	rng: number; // grain counter
	kits?: [Kit, Kit]; // each side's boules; absent = standard
	blind?: boolean; // a plan or a preview: no stone kick on landing, no micro-gravel
}

export interface StepResult {
	hitBoule: boolean;
	landed: boolean; // a boule touched the ground for the first time this call
	out: number[]; // indices that left the pitch this call
}

export const makeBoule = (x: number, y: number, side: 0 | 1, kit?: Kit): Boule => kit
	? { x, y, z: kit.r, vx: 0, vy: 0, vz: 0, r: kit.r, m: kit.m, side, live: true, rolling: true, e: kit.e, bite: kit.bite }
	: { x, y, z: BOULE_R, vx: 0, vy: 0, vz: 0, r: BOULE_R, m: BOULE_M, side, live: true, rolling: true };

export const makeJack = (x: number, y: number): Boule =>
	({ x, y, z: JACK_R, vx: 0, vy: 0, vz: 0, r: JACK_R, m: JACK_M, side: -1, live: true, rolling: true });

/** Snap a boule onto the ground. Without this it is dropped from z = r and bounces on arrival. */
export function place(t: Terrain, b: Boule): Boule {
	b.z = heightAt(t, b.x, b.y) + b.r;
	b.rolling = true;
	return b;
}

/* Where the hand lets go above the circle: low for a roulette thrown crouched, higher for a lob
   thrown standing. Read from the velocity alone (vz / speed is the sine of the loft) with no trig,
   so both online peers compute the same bits from the same message. */
export const RELEASE_LOW = 0.3; // m above the ground, a flat throw
export const RELEASE_SPAN = 0.5; // m more for a vertical one (~0.77 m at a full plomb)

/** Put a body in the thrower's hand, above the circle, and let it go with velocity `v`. */
export function release(t: Terrain, b: Boule, v: Velocity): Boule {
	place(t, b);
	const sp = Math.sqrt(v.vx * v.vx + v.vy * v.vy + v.vz * v.vz);
	const up = sp > 0 ? Math.max(0, Math.min(1, v.vz / sp)) : 0;
	b.z += RELEASE_LOW + RELEASE_SPAN * up;
	b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
	if (v.spin) b.spin = Math.max(-1, Math.min(1, v.spin));
	b.rolling = false;
	return b;
}

export const speed2 = (b: Boule): number => Math.sqrt(b.vx * b.vx + b.vy * b.vy);
export const speed3 = (b: Boule): number => Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
export const dist2 = (a: Boule, b: Boule): number => {
	const dx = a.x - b.x, dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

export function cloneSim(s: Sim): Sim {
	const c: Sim = { t: s.t, rng: s.rng, bs: s.bs.map((b) => ({ ...b })) };
	if (s.kits) c.kits = s.kits;
	if (s.blind) c.blind = true;
	return c;
}

/** A clone for planning or previewing: it reads the ground but feels no stone kick on landing nor grit. */
export function blindSim(s: Sim): Sim {
	const c = cloneSim(s);
	c.blind = true;
	return c;
}

/** How much less a body is thrown about than the standard boule: its mass against 700 g, squared
 *  (measured: linear, a heavy boule never paid off on rough ground). The jack keeps its own,
 *  untouched behaviour. */
const steady = (b: Boule): number => (b.side === -1 ? 1 : (BOULE_M / b.m) * (BOULE_M / b.m));

/** The share of its run a body keeps for its weight when it lands: a heavy boule sinks into sand or
 *  loose gravel, not into packed clay (restitution 0.30 and up). Measured: digging in everywhere
 *  made heavy boules win on every ground. 1 for the standard boule and the jack. */
const dig = (b: Boule, restitution: number): number =>
	1 - (1 - Math.sqrt(steady(b))) * (restitution < 0.30 ? 1 - restitution / 0.30 : 0);

/** Rotate the horizontal velocity by a small angle without sin/cos: shear, then restore speed. */
function deflect(b: Boule, a: number): void {
	const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
	if (sp <= 0) return;
	const nx = b.vx - a * b.vy, ny = b.vy + a * b.vx;
	const k = sp / Math.sqrt(nx * nx + ny * ny);
	b.vx = nx * k;
	b.vy = ny * k;
}

/** Symmetric grain sample in [-1, 1], consumed one per event so replays match. */
function grain(s: Sim): number {
	return hashN(s.rng++, s.t.seed) * 2 - 1;
}

const gv = { gx: 0, gy: 0 };
const gs: GroundSample = { rollFriction: 0, restitution: 0, impactFriction: 0, scatter: 0, grit: 0 };

function groundContact(s: Sim, b: Boule, near: number[], imp?: Impact[]): void {
	const surf = surfaceAt(s.t, b.x, b.y, gs);
	gradAt(s.t, b.x, b.y, gv);
	// unit normal of the local patch
	const nl = 1 / Math.sqrt(gv.gx * gv.gx + gv.gy * gv.gy + 1);
	const nx = -gv.gx * nl, ny = -gv.gy * nl, nz = nl;
	const vn = b.vx * nx + b.vy * ny + b.vz * nz;
	b.z = heightAt(s.t, b.x, b.y) + b.r;
	if (vn >= 0) return;

	if (-vn < ROLL_VN) {
		b.vz = 0;
		b.rolling = true;
		return;
	}
	// split into normal and tangential, bounce the normal, damp the tangent
	const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
	let back = -vn * surf.restitution;
	/* A 700 g boule digs in, and the harder it lands the more it digs: a fixed restitution sent a
	   plombée on clay 27 cm back up. The rebound saturates at BOUNCE_VN instead (scaled by the
	   ground's own restitution, so soft ground absorbs more), with no kink: a soft touch keeps its
	   bounce, a plombée stays under ~9 cm. sqrt only, so replays stay bit-identical. The jack is
	   light and keeps its plain bounce. A heavier boule digs into a soft ground and keeps less of its
	   run; a light one skips on. Its rebound does not depend on its weight: measured, a heavy boule
	   bouncing lower won every ground. */
	if (b.side !== -1) {
		const cap = BOUNCE_VN * (surf.restitution / 0.30);
		back /= Math.sqrt(1 + (back / cap) * (back / cap));
	}
	const bite = b.bite ?? 1;
	const run = surf.impactFriction * bite * dig(b, surf.restitution);
	b.vx = tx * run + nx * back * bite;
	b.vy = ty * run + ny * back * bite;
	b.vz = tz * run + nz * back * bite;
	deflect(b, grain(s) * surf.scatter * -vn * steady(b));
	// The effet bites at the bounce: a positive spin turns right, which is a negative shear.
	if (b.spin) { deflect(b, -b.spin * SPIN_LAND); b.spin *= SPIN_BOUNCE_KEEP; }
	imp?.push({ kind: 'ground', x: b.x, y: b.y, z: b.z, speed: -vn });
	if (s.t.rough !== undefined && !s.blind) landOnStone(s, b, near, imp);
}

/** Uneven pitches: a boule coming down on a stone leaves at an angle, away from it, and hops. */
function landOnStone(s: Sim, b: Boule, near: number[], imp?: Impact[]): void {
	const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
	if (sp < 0.15) return;
	pebblesNear(s.t, b.x, b.y, near);
	for (let k = 0; k < near.length; k++) {
		const p = s.t.pebbles[near[k]];
		const dx = p.x - b.x, dy = p.y - b.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		const reach = b.r * 0.8 + p.r;
		if (d >= reach || d <= 1e-6) continue;
		// The stone's side of the line of flight, -1..1: a stone on the left sends it right.
		const side = (-b.vy * dx + b.vx * dy) / (sp * reach);
		const bite = (p.r / b.r) * (1 - d / reach);
		const a = -side * bite * LAND_KICK * steady(b);
		deflect(b, a < -LAND_MAX ? -LAND_MAX : a > LAND_MAX ? LAND_MAX : a);
		b.vz += bite * sp * LAND_HOP * steady(b);
		imp?.push({ kind: 'pebble', x: p.x, y: p.y, z: b.z - b.r, speed: sp });
		return;
	}
}

/** A pebble under a rolling boule kicks it sideways and a little upward. */
function pebbleContact(s: Sim, b: Boule, near: number[], imp?: Impact[]): void {
	const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
	if (sp < 0.15) return;
	pebblesNear(s.t, b.x, b.y, near);
	for (let k = 0; k < near.length; k++) {
		const p = s.t.pebbles[near[k]];
		const dx = p.x - b.x, dy = p.y - b.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		const reach = b.r * 0.55 + p.r;
		if (d >= reach || d <= 1e-6) continue;
		// The stone's side of the direction of travel, -1..1: one on the left pushes it right.
		const side = (-b.vy * dx + b.vx * dy) / (sp * reach);
		const bite = (p.r / b.r) * (1 - d / reach);
		deflect(b, -side * bite * PEBBLE_KICK * steady(b));
		// A 12 g jack jumps off a stone that a 700 g boule just rolls over: its own, livelier hop,
		// capped so a coarse-gravel stone twice its radius does not launch it.
		b.vz += b.side === -1 ? Math.min(1, bite) * sp * JACK_PEBBLE_HOP : bite * sp * PEBBLE_HOP * steady(b);
		b.rolling = false;
		imp?.push({ kind: 'pebble', x: p.x, y: p.y, z: b.z - b.r, speed: sp });
		return; // one pebble per sub-step is enough, and keeps the order unambiguous
	}
}

function collide(t: Terrain, a: Boule, b: Boule, imp?: Impact[]): boolean {
	const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
	const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
	const min = a.r + b.r;
	if (d <= 1e-9 || d >= min) return false;
	const nx = dx / d, ny = dy / d, nz = dz / d;
	const ia = 1 / a.m, ib = 1 / b.m;
	const push = (min - d) / (ia + ib);
	a.x -= nx * push * ia; a.y -= ny * push * ia; a.z -= nz * push * ia;
	b.x += nx * push * ib; b.y += ny * push * ib; b.z += nz * push * ib;
	const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
	if (vn >= 0) return false;
	// Two makes meet halfway: a soft boule against a hard one bounces like two medium ones.
	const rest = ((a.e ?? BOULE_REST) + (b.e ?? BOULE_REST)) / 2;
	const j = (-(1 + rest) * vn) / (ia + ib);
	a.vx -= j * ia * nx; a.vy -= j * ia * ny; a.vz -= j * ia * nz;
	b.vx += j * ib * nx; b.vy += j * ib * ny; b.vz += j * ib * nz;
	a.rolling = false; b.rolling = false;
	if (a.spin) a.spin *= SPIN_HIT_KEEP;
	if (b.spin) b.spin *= SPIN_HIT_KEEP;
	/* A boule meets the jack above its centre (radii 37.5 vs 15 mm), so the normal dips ~25 deg and
	   part of the kick points into the ground. On the ground, the ground takes it. Left in, it
	   bounced the jack at impactFriction per hop, and the boule behind re-struck it: a jack hit at
	   6 m/s stopped after 1.1 m on coarse gravel, 13 hops. */
	for (const o of [a, b]) if (o.vz < 0 && o.z <= heightAt(t, o.x, o.y) + o.r + 1e-3) o.vz = 0;
	imp?.push({ kind: 'boule', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, speed: -vn, jack: a.side === -1 || b.side === -1 });
	return true;
}

/** Advance `dt` seconds, sub-stepped so a fast boule cannot tunnel through a target. */
export function stepSim(s: Sim, dt: number, imp?: Impact[]): StepResult {
	const res: StepResult = { hitBoule: false, landed: false, out: [] };
	const bs = s.bs;
	let maxV = 0;
	for (const b of bs) if (b.live) maxV = Math.max(maxV, speed3(b));
	const sub = Math.max(1, Math.min(MAX_SUB, Math.ceil((maxV * dt) / (BOULE_R * 0.5))));
	const h = dt / sub;
	const near: number[] = [];

	for (let n = 0; n < sub; n++) {
		for (const b of bs) {
			if (!b.live) continue;
			const ground = heightAt(s.t, b.x, b.y) + b.r;
			if (b.rolling && b.z <= ground + 1e-4) {
				const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
				if (sp < SETTLE) { b.vx = 0; b.vy = 0; b.vz = 0; b.z = ground; continue; }
				gradAt(s.t, b.x, b.y, gv);
				const drag = surfaceAt(s.t, b.x, b.y, gs).rollFriction * G;
				b.vx += (-G * gv.gx * SLOPE_K - (drag * b.vx) / sp) * h;
				b.vy += (-G * gv.gy * SLOPE_K - (drag * b.vy) / sp) * h;
				b.vz = 0;
				if (b.spin) { deflect(b, -b.spin * SPIN_ROLL * h); b.spin -= b.spin * SPIN_DECAY * h; }
				// Micro-gravel: each stone turns it by more as it slows (the run's last metre wanders).
				if (s.t.rough !== undefined && !s.blind) {
					const w = (GRIT * s.t.rough * gs.grit * gritAt(s.t, b.x, b.y) * h * sp) / Math.max(sp * sp, GRIT_V0 * GRIT_V0);
					deflect(b, b.side === -1 ? w * JACK_GRIT : w * steady(b) * (BOULE_R / b.r));
				}
				b.x += b.vx * h;
				b.y += b.vy * h;
				b.z = heightAt(s.t, b.x, b.y) + b.r;
				pebbleContact(s, b, near, imp);
				// Park it in the same step that drops it below the threshold, otherwise isSettled
				// reports "at rest" while a residual velocity is still on the boule.
				if (b.rolling && b.vx * b.vx + b.vy * b.vy < SETTLE * SETTLE) { b.vx = 0; b.vy = 0; b.vz = 0; }
			} else {
				b.vz -= G * h;
				b.x += b.vx * h;
				b.y += b.vy * h;
				b.z += b.vz * h;
				if (b.z <= heightAt(s.t, b.x, b.y) + b.r) {
					if (!res.landed) res.landed = true;
					groundContact(s, b, near, imp);
				}
			}
		}
		for (let i = 0; i < bs.length; i++)
			for (let k = i + 1; k < bs.length; k++) {
				if (!bs[i].live || !bs[k].live) continue;
				if (collide(s.t, bs[i], bs[k], imp)) res.hitBoule = true;
			}
		for (let i = 0; i < bs.length; i++) {
			const b = bs[i];
			if (!b.live || inPitch(b.x, b.y)) continue;
			const outSpeed = speed3(b); // what it hits the plank with; for the sound only
			b.live = false;
			b.vx = 0; b.vy = 0; b.vz = 0;
			res.out.push(i);
			imp?.push({ kind: 'out', x: b.x, y: b.y, z: b.z, speed: outSpeed, jack: b.side === -1 });
		}
	}
	return res;
}

export const isSettled = (bs: Boule[]): boolean =>
	bs.every((b) => !b.live || (speed3(b) < SETTLE && b.rolling));

/** Run to rest. `cap` guards against a pathological deal; returns the seconds simulated. */
export function settle(s: Sim, imp?: Impact[], cap = 20): number {
	const dt = 1 / 120;
	let t = 0;
	while (t < cap) {
		stepSim(s, dt, imp);
		t += dt;
		if (isSettled(s.bs)) break;
	}
	return t;
}

/**
 * Throw. `dir` is the unit heading in the ground plane, `elevation` the loft in radians
 * (driven by the camera pitch), `speed` in m/s. Velocities, not angles, travel on the wire.
 */
export function throwVelocity(dirX: number, dirY: number, speed: number, elevation: number):
	{ vx: number; vy: number; vz: number } {
	const c = Math.cos(elevation), sn = Math.sin(elevation);
	const m = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
	return { vx: (dirX / m) * speed * c, vy: (dirY / m) * speed * c, vz: speed * sn };
}
