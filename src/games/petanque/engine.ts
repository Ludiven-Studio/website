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

import { type Terrain, heightAt, gradAt, pebblesNear, inPitch, hashN } from './terrain';

export const G = 9.81;
export const BOULE_R = 0.0375; // 75 mm competition boule
export const BOULE_M = 0.7;
export const JACK_R = 0.015;
export const JACK_M = 0.012;

const BOULE_REST = 0.90; // boule-boule restitution — this is what makes a carreau possible
const ROLL_VN = 0.35; // normal speed below which a bounce becomes a roll
const BOUNCE_VN = 1.6; // m/s — the rebound a boule tends to on clay, however hard it lands (13 cm ceiling)
const SLOPE_K = 5 / 7; // rolling sphere: only 5/7 of the slope acceleration reaches the centre
const PEBBLE_KICK = 0.55; // rad of deflection per unit bite
const PEBBLE_HOP = 0.15; // upward share of the speed when a boule climbs one
const SETTLE = 0.06; // m/s, below which a rolling boule is at rest
const MAX_SUB = 24;

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
}

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
}

export interface StepResult {
	hitBoule: boolean;
	landed: boolean; // a boule touched the ground for the first time this call
	out: number[]; // indices that left the pitch this call
}

export const makeBoule = (x: number, y: number, side: 0 | 1): Boule =>
	({ x, y, z: BOULE_R, vx: 0, vy: 0, vz: 0, r: BOULE_R, m: BOULE_M, side, live: true, rolling: true });

export const makeJack = (x: number, y: number): Boule =>
	({ x, y, z: JACK_R, vx: 0, vy: 0, vz: 0, r: JACK_R, m: JACK_M, side: -1, live: true, rolling: true });

/** Snap a boule onto the ground. Without this it is dropped from z = r and bounces on arrival. */
export function place(t: Terrain, b: Boule): Boule {
	b.z = heightAt(t, b.x, b.y) + b.r;
	b.rolling = true;
	return b;
}

export const speed2 = (b: Boule): number => Math.sqrt(b.vx * b.vx + b.vy * b.vy);
export const speed3 = (b: Boule): number => Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
export const dist2 = (a: Boule, b: Boule): number => {
	const dx = a.x - b.x, dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

export function cloneSim(s: Sim): Sim {
	return { t: s.t, rng: s.rng, bs: s.bs.map((b) => ({ ...b })) };
}

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

function groundContact(s: Sim, b: Boule, imp?: Impact[]): void {
	const surf = s.t.surface;
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
	   light and keeps its plain bounce. */
	if (b.side !== -1) {
		const cap = BOUNCE_VN * (surf.restitution / 0.30);
		back /= Math.sqrt(1 + (back / cap) * (back / cap));
	}
	b.vx = tx * surf.impactFriction + nx * back;
	b.vy = ty * surf.impactFriction + ny * back;
	b.vz = tz * surf.impactFriction + nz * back;
	deflect(b, grain(s) * surf.scatter * -vn);
	imp?.push({ kind: 'ground', x: b.x, y: b.y, z: b.z, speed: -vn });
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
		// signed offset across the direction of travel decides which way it is thrown
		const side = (-b.vy * dx + b.vx * dy) / (sp * reach);
		const bite = (p.r / b.r) * (1 - d / reach);
		deflect(b, side * bite * PEBBLE_KICK);
		b.vz += bite * sp * PEBBLE_HOP;
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
	const j = (-(1 + BOULE_REST) * vn) / (ia + ib);
	a.vx -= j * ia * nx; a.vy -= j * ia * ny; a.vz -= j * ia * nz;
	b.vx += j * ib * nx; b.vy += j * ib * ny; b.vz += j * ib * nz;
	a.rolling = false; b.rolling = false;
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
				const drag = s.t.surface.rollFriction * G;
				b.vx += (-G * gv.gx * SLOPE_K - (drag * b.vx) / sp) * h;
				b.vy += (-G * gv.gy * SLOPE_K - (drag * b.vy) / sp) * h;
				b.vz = 0;
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
					groundContact(s, b, imp);
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
