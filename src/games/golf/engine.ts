/**
 * MINI-GOLF — pure engine (no rendering, no I/O).
 * Top-down putting on a flat green: slingshot aim (power ∝ pull, launch opposite
 * the drag), friction brings the ball to rest, it bounces off the borders and a
 * few rectangular walls, and drops in the cup when it arrives slowly enough.
 * Hole layout is generated deterministically from a seed (shared daily hole).
 */

import type { Rng } from '../prng';

export interface Vec {
	x: number;
	z: number;
}

/** Axis-aligned rectangle obstacle (world coords). */
export interface Wall {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface Hole {
	half: { w: number; h: number }; // green half-extents (green spans [-w,w]×[-h,h])
	start: Vec;
	cup: Vec;
	cupR: number;
	walls: Wall[];
	par: number;
}

export interface Ball {
	x: number;
	z: number;
	vx: number;
	vz: number;
}

export interface BallParams {
	ballR: number;
	decel: number; // linear deceleration (units/s²) — friction
	restitution: number; // bounce energy kept (0..1)
	captureSpeed: number; // max speed to drop in the cup (else lip-out)
	settleSpeed: number; // below this the ball is considered stopped
	minPull: number; // ignore micro drags
	maxPull: number; // pull beyond this doesn't add power
	powerScale: number; // launch speed per unit of pull
}

export const PARAMS: BallParams = {
	ballR: 0.7,
	decel: 14,
	restitution: 0.7,
	captureSpeed: 9,
	settleSpeed: 0.25,
	minPull: 0.8,
	maxPull: 16,
	powerScale: 2.6,
};

export interface DiffLevel {
	label: string;
	half: { w: number; h: number };
	walls: number;
	cupR: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', half: { w: 18, h: 22 }, walls: 2, cupR: 1.6 },
	moyen: { label: 'Moyen', half: { w: 20, h: 26 }, walls: 4, cupR: 1.3 },
	difficile: { label: 'Difficile', half: { w: 22, h: 30 }, walls: 6, cupR: 1.1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Shortest distance from a point to an axis-aligned rectangle (0 if inside). */
function distPointRect(p: Vec, w: Wall): number {
	const dx = Math.max(w.minX - p.x, 0, p.x - w.maxX);
	const dz = Math.max(w.minZ - p.z, 0, p.z - w.maxZ);
	return Math.hypot(dx, dz);
}

function rectsOverlap(a: Wall, b: Wall, margin: number): boolean {
	return (
		a.minX - margin < b.maxX &&
		a.maxX + margin > b.minX &&
		a.minZ - margin < b.maxZ &&
		a.maxZ + margin > b.minZ
	);
}

/* ---------- generation ---------- */

export function generateHole(rng: Rng, diff: DiffLevel): Hole {
	const { w, h } = diff.half;
	const cupR = diff.cupR;
	const margin = 2.5 + cupR;

	const start: Vec = { x: (rng() * 2 - 1) * (w * 0.5), z: h - margin - rng() * 2 };
	const cup: Vec = { x: (rng() * 2 - 1) * (w * 0.5), z: -h + margin + rng() * 2 };

	const walls: Wall[] = [];
	let tries = 0;
	while (walls.length < diff.walls && tries < diff.walls * 40) {
		tries++;
		// Half-extents: one long axis, one thin axis; random orientation.
		const long = 2 + rng() * 6;
		const thin = 0.9 + rng() * 1.4;
		const vertical = rng() < 0.5;
		const hw = vertical ? thin : long;
		const hd = vertical ? long : thin;
		const cx = (rng() * 2 - 1) * (w - hw - 2);
		const cz = (rng() * 2 - 1) * (h * 0.55);
		const wall: Wall = { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
		const clear = 5;
		if (
			distPointRect(start, wall) >= clear &&
			distPointRect(cup, wall) >= clear &&
			!walls.some((o) => rectsOverlap(wall, o, 1.5))
		)
			walls.push(wall);
	}

	const dist = Math.hypot(cup.x - start.x, cup.z - start.z);
	const par = clamp(Math.round(dist / 16) + 1, 2, 5);

	return { half: { w, h }, start, cup, cupR, walls, par };
}

/* ---------- aiming ---------- */

/**
 * Slingshot: `pull` is the drag vector (pointer − ball). The ball launches OPPOSITE
 * the pull; power grows with pull length up to `maxPull`. Returns null for a micro drag.
 */
export function aimToVelocity(pull: Vec, P: BallParams = PARAMS): { vx: number; vz: number } | null {
	const mag = Math.hypot(pull.x, pull.z);
	if (mag < P.minPull) return null;
	const speed = Math.min(mag, P.maxPull) * P.powerScale;
	return { vx: -(pull.x / mag) * speed, vz: -(pull.z / mag) * speed };
}

export const ballSpeed = (b: Ball): number => Math.hypot(b.vx, b.vz);
export const isSettled = (b: Ball, P: BallParams = PARAMS): boolean => ballSpeed(b) < P.settleSpeed;

/* ---------- physics ---------- */

/** Circle vs AABB: push the ball out and reflect its normal velocity. Mutates `b`. */
function collideWall(b: Ball, w: Wall, r: number, restitution: number): void {
	const cx = clamp(b.x, w.minX, w.maxX);
	const cz = clamp(b.z, w.minZ, w.maxZ);
	let dx = b.x - cx;
	let dz = b.z - cz;
	let d = Math.hypot(dx, dz);
	if (d >= r) return; // no contact

	let nx: number;
	let nz: number;
	if (d > 1e-6) {
		nx = dx / d;
		nz = dz / d;
	} else {
		// Center inside the box → eject along the smallest penetration axis.
		const left = b.x - w.minX;
		const right = w.maxX - b.x;
		const top = b.z - w.minZ;
		const bottom = w.maxZ - b.z;
		const minH = Math.min(left, right);
		const minV = Math.min(top, bottom);
		if (minH < minV) {
			nx = left < right ? -1 : 1;
			nz = 0;
		} else {
			nx = 0;
			nz = top < bottom ? -1 : 1;
		}
		d = 0;
	}
	b.x += nx * (r - d);
	b.z += nz * (r - d);
	const vn = b.vx * nx + b.vz * nz;
	if (vn < 0) {
		b.vx -= (1 + restitution) * vn * nx;
		b.vz -= (1 + restitution) * vn * nz;
	}
}

/**
 * Advance the ball by `dt` seconds. Sub-steps to avoid tunnelling. Applies wall/border
 * bounces, friction and cup capture. Pure: returns a new ball + whether it was sunk.
 */
export function stepBall(
	ball: Ball,
	hole: Hole,
	dt: number,
	P: BallParams = PARAMS,
): { ball: Ball; sunk: boolean } {
	const b: Ball = { ...ball };
	if (isSettled(b, P)) {
		b.vx = 0;
		b.vz = 0;
		return { ball: b, sunk: false };
	}

	const sub = clamp(Math.ceil((ballSpeed(b) * dt) / P.ballR), 1, 8);
	const h = dt / sub;
	const { w, h: hh } = hole.half;
	const r = P.ballR;
	let sunk = false;

	for (let i = 0; i < sub && !sunk; i++) {
		b.x += b.vx * h;
		b.z += b.vz * h;

		if (b.x < -w + r) { b.x = -w + r; if (b.vx < 0) b.vx = -b.vx * P.restitution; }
		if (b.x > w - r) { b.x = w - r; if (b.vx > 0) b.vx = -b.vx * P.restitution; }
		if (b.z < -hh + r) { b.z = -hh + r; if (b.vz < 0) b.vz = -b.vz * P.restitution; }
		if (b.z > hh - r) { b.z = hh - r; if (b.vz > 0) b.vz = -b.vz * P.restitution; }

		for (const wl of hole.walls) collideWall(b, wl, r, P.restitution);

		// Friction (linear deceleration toward rest).
		const sp = ballSpeed(b);
		if (sp > 0) {
			const ns = Math.max(0, sp - P.decel * h);
			const k = ns / sp;
			b.vx *= k;
			b.vz *= k;
		}

		// Cup: drop only if arriving slowly enough (otherwise it laps the rim).
		const dc = Math.hypot(b.x - hole.cup.x, b.z - hole.cup.z);
		if (dc < hole.cupR && ballSpeed(b) < P.captureSpeed) {
			b.x = hole.cup.x;
			b.z = hole.cup.z;
			b.vx = 0;
			b.vz = 0;
			sunk = true;
		}

		if (ballSpeed(b) < P.settleSpeed) {
			b.vx = 0;
			b.vz = 0;
		}
	}

	return { ball: b, sunk };
}
