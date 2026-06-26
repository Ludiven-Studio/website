/**
 * MINI-GOLF — pure engine (no rendering, no I/O).
 * A winding walled corridor from tee to cup. Slingshot aim (power ∝ pull, launch
 * opposite the drag); friction brings the ball to rest; it bounces off the lane
 * walls (arbitrary angles → curves). The cup is barely bigger than the ball and
 * pulls it toward the centre — dead-centre passes drop in even when fast.
 * Layout is generated deterministically from a seed (shared daily hole).
 */

import { mulberry32, type Rng } from '../prng';

export interface Vec {
	x: number;
	z: number;
}

/** Centerline sample: position, tangent (dir), left normal (n). */
export interface PathPoint {
	x: number;
	z: number;
	dirX: number;
	dirZ: number;
	nx: number;
	nz: number;
}

/** Wall segment with an inward unit normal (points toward the lane centre). */
export interface Segment {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	nx: number;
	nz: number;
}

/** Free-standing obstacle inside the lane (convex polygon corners). */
export interface Obstacle {
	pts: Vec[];
}

/**
 * Sloped zone that nudges the ball while it is inside.
 * - 'radial': the putting green — accelerates toward (cx,cz) ∝ distance/r (bowl).
 * - 'dir': a relief patch — constant downhill accel (ax,az), fading at the rim.
 */
export interface Slope {
	kind: 'radial' | 'dir';
	cx: number;
	cz: number;
	r: number;
	ax: number;
	az: number;
	strength: number;
}

export interface Hole {
	path: PathPoint[]; // centerline (tee → cup)
	widths: number[]; // half-width per path point (wider/narrower sections)
	halfWidth: number; // representative width (kept for convenience)
	segments: Segment[]; // lane walls + end caps + obstacle edges
	obstacles: Obstacle[]; // for rendering
	slopes: Slope[]; // green + relief patches
	greenR: number; // radius of the sloped green around the cup
	bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
	start: Vec;
	cup: Vec;
	cupR: number; // visual hole radius (barely > ball)
	coreR: number; // dead-centre radius → always drops
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
	decel: number; // friction deceleration (units/s²)
	restitution: number; // wall bounce energy kept
	captureSpeed: number; // drop in the cup below this speed
	magnet: number; // cup attraction acceleration near the rim (units/s²)
	settleSpeed: number;
	minPull: number;
	maxPull: number;
	powerScale: number;
}

export const PARAMS: BallParams = {
	ballR: 0.7,
	decel: 7,
	restitution: 0.7,
	captureSpeed: 8,
	magnet: 42,
	settleSpeed: 0.25,
	minPull: 0.8,
	maxPull: 16,
	powerScale: 2.7,
};

export interface DiffLevel {
	label: string;
	length: number; // approx corridor length
	bends: number; // control points
	width: number; // base lane width
	cupR: number;
	obstacles: number; // free-standing islands inside the lane
	slopes: number; // relief patches along the course
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', length: 120, bends: 5, width: 15, cupR: 1.35, obstacles: 1, slopes: 1 },
	moyen: { label: 'Moyen', length: 175, bends: 7, width: 13, cupR: 1.2, obstacles: 2, slopes: 2 },
	difficile: { label: 'Difficile', length: 230, bends: 9, width: 11, cupR: 1.05, obstacles: 3, slopes: 3 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------- generation ---------- */

/** Open Catmull-Rom through control points (clamped endpoints). */
function catmullOpen(pts: Vec[], t: number): Vec {
	const n = pts.length;
	const s = clamp(t, 0, 1) * (n - 1);
	let i = Math.floor(s);
	if (i > n - 2) i = n - 2;
	const u = s - i;
	const p0 = pts[Math.max(0, i - 1)];
	const p1 = pts[i];
	const p2 = pts[i + 1];
	const p3 = pts[Math.min(n - 1, i + 2)];
	const u2 = u * u, u3 = u2 * u;
	const a = -0.5 * u3 + u2 - 0.5 * u;
	const b = 1.5 * u3 - 2.5 * u2 + 1;
	const c = -1.5 * u3 + 2 * u2 + 0.5 * u;
	const d = 0.5 * u3 - 0.5 * u2;
	return {
		x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
		z: a * p0.z + b * p1.z + c * p2.z + d * p3.z,
	};
}

/** Oriented segment; normal points toward `ref` (lane walls) or away from it (obstacles). */
function makeSegment(ax: number, az: number, bx: number, bz: number, ref: Vec, inward = true): Segment {
	const dx = bx - ax, dz = bz - az;
	const len = Math.hypot(dx, dz) || 1;
	let nx = -dz / len, nz = dx / len;
	const towardRef = (ref.x - ax) * nx + (ref.z - az) * nz >= 0;
	if (towardRef !== inward) { nx = -nx; nz = -nz; }
	return { ax, az, bx, bz, nx, nz };
}

export function generateHole(rng: Rng, diff: DiffLevel): Hole {
	const hw = diff.width / 2;
	const step = diff.length / (diff.bends - 1);
	const base = -Math.PI / 2 + (rng() - 0.5) * 0.6; // generally heading −z
	let heading = base;
	let x = 0, z = 0;
	const ctrl: Vec[] = [{ x, z }];
	for (let i = 1; i < diff.bends; i++) {
		heading = clamp(heading + (rng() - 0.5) * 1.5, base - 1.2, base + 1.2); // doglegs, no backtrack
		x += Math.cos(heading) * step;
		z += Math.sin(heading) * step;
		ctrl.push({ x, z });
	}

	const SAMPLES = clamp(Math.round(diff.length / 1.6), 40, 180);
	const raw: Vec[] = [];
	for (let s = 0; s < SAMPLES; s++) raw.push(catmullOpen(ctrl, s / (SAMPLES - 1)));

	const path: PathPoint[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const cur = raw[i];
		const next = raw[Math.min(SAMPLES - 1, i + 1)];
		const prev = raw[Math.max(0, i - 1)];
		let dx = next.x - prev.x, dz = next.z - prev.z;
		const len = Math.hypot(dx, dz) || 1;
		dx /= len; dz /= len;
		path.push({ x: cur.x, z: cur.z, dirX: dx, dirZ: dz, nx: -dz, nz: dx });
	}

	// Variable half-width: smooth low-frequency variation (wider/narrower), widened near the cup.
	const cupIdx = SAMPLES - 2;
	const minHalf = PARAMS.ballR + 1.4;
	const ph1 = rng() * Math.PI * 2, ph2 = rng() * Math.PI * 2;
	const f1 = 1.7 + rng() * 1.2, f2 = 3.3 + rng() * 1.6;
	const widths: number[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t = i / (SAMPLES - 1);
		let factor = 1 + 0.34 * Math.sin(t * Math.PI * f1 + ph1) + 0.16 * Math.sin(t * Math.PI * f2 + ph2);
		const nearCup = Math.max(0, 1 - Math.abs(i - cupIdx) / (SAMPLES * 0.12));
		factor = Math.max(factor, 1 + 0.5 * nearCup); // room for the green at the cup
		widths.push(clamp(hw * factor, minHalf, hw * 1.6));
	}

	const left = path.map((p, i) => ({ x: p.x + p.nx * widths[i], z: p.z + p.nz * widths[i] }));
	const right = path.map((p, i) => ({ x: p.x - p.nx * widths[i], z: p.z - p.nz * widths[i] }));

	const segments: Segment[] = [];
	for (let i = 0; i < SAMPLES - 1; i++) {
		segments.push(makeSegment(left[i].x, left[i].z, left[i + 1].x, left[i + 1].z, path[i]));
		segments.push(makeSegment(right[i].x, right[i].z, right[i + 1].x, right[i + 1].z, path[i]));
	}
	// End caps (tee + cup), normals pointing into the lane.
	segments.push(makeSegment(left[0].x, left[0].z, right[0].x, right[0].z, path[1]));
	const e = SAMPLES - 1;
	segments.push(makeSegment(left[e].x, left[e].z, right[e].x, right[e].z, path[e - 1]));

	const startIdx = 1;
	const start: Vec = { x: path[startIdx].x, z: path[startIdx].z };
	const cup: Vec = { x: path[cupIdx].x, z: path[cupIdx].z };
	const coreR = Math.max(PARAMS.ballR * 0.7, diff.cupR * 0.4);
	const par = clamp(Math.round(diff.length / 42) + 1, 2, 6);

	// Obstacles: central islands (a fork that rejoins) or side chicanes. A passage of at
	// least ball-diameter + margin always remains, so the lane is never fully blocked.
	const clearR = PARAMS.ballR + 1.0;
	const obstacles: Obstacle[] = [];
	const used: number[] = [];
	const loIdx = Math.round(SAMPLES * 0.18), hiIdx = Math.round(SAMPLES * 0.82);
	for (let attempt = 0; attempt < diff.obstacles * 40 && obstacles.length < diff.obstacles; attempt++) {
		const idx = loIdx + Math.floor(rng() * (hiIdx - loIdx));
		if (used.some((u) => Math.abs(u - idx) < SAMPLES * 0.12)) continue;
		const p = path[idx];
		const lw = widths[idx]; // local half-width
		const along = 1.6 + rng() * 2.4;
		const central = rng() < 0.5;
		let across: number, off: number;
		if (central) {
			across = clamp(1.5 + rng() * 1.4, 1.0, lw - clearR - 0.4);
			if (across < 1.0) continue;
			off = 0;
		} else {
			across = 1.3 + rng() * 1.6;
			if (across > lw - 1.4) continue;
			off = (rng() < 0.5 ? 1 : -1) * (lw - across - (0.7 + rng() * 0.9));
		}
		const cx = p.x + p.nx * off, cz = p.z + p.nz * off;
		if (Math.hypot(cx - start.x, cz - start.z) < 9 || Math.hypot(cx - cup.x, cz - cup.z) < 9) continue;
		const corner = (ta: number, na: number): Vec => ({ x: cx + p.dirX * ta + p.nx * na, z: cz + p.dirZ * ta + p.nz * na });
		const pts = [corner(along, across), corner(along, -across), corner(-along, -across), corner(-along, across)];
		const center = { x: cx, z: cz };
		for (let k = 0; k < 4; k++) {
			const a = pts[k], b = pts[(k + 1) % 4];
			segments.push(makeSegment(a.x, a.z, b.x, b.z, center, false)); // outward normal
		}
		obstacles.push({ pts });
		used.push(idx);
	}

	// Sloped green around the cup (bowl), plus a few gentle relief patches along the course.
	const greenR = clamp(widths[cupIdx] - 0.4, 3, 7);
	const slopes: Slope[] = [{ kind: 'radial', cx: cup.x, cz: cup.z, r: greenR, strength: 17, ax: 0, az: 0 }];
	const usedS: number[] = [];
	for (let attempt = 0; attempt < diff.slopes * 30 && slopes.length < diff.slopes + 1; attempt++) {
		const idx = loIdx + Math.floor(rng() * (hiIdx - loIdx));
		if (usedS.some((u) => Math.abs(u - idx) < SAMPLES * 0.1)) continue;
		const p = path[idx];
		if (Math.hypot(p.x - cup.x, p.z - cup.z) < greenR + 4) continue;
		const ang = rng() * Math.PI * 2;
		slopes.push({ kind: 'dir', cx: p.x, cz: p.z, r: 4 + rng() * 3, ax: Math.cos(ang), az: Math.sin(ang), strength: 5 + rng() * 4 });
		usedS.push(idx);
	}

	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (const pt of [...left, ...right, ...obstacles.flatMap((o) => o.pts)]) {
		if (pt.x < minX) minX = pt.x;
		if (pt.x > maxX) maxX = pt.x;
		if (pt.z < minZ) minZ = pt.z;
		if (pt.z > maxZ) maxZ = pt.z;
	}

	return {
		path, widths, halfWidth: hw, segments, obstacles, slopes, greenR,
		bounds: { minX, maxX, minZ, maxZ }, start, cup, cupR: diff.cupR, coreR, par,
	};
}

/* ---------- aiming ---------- */

/** Slingshot: `pull` = pointer − ball. Launches OPPOSITE the pull; power ∝ pull (capped). */
export function aimToVelocity(pull: Vec, P: BallParams = PARAMS): { vx: number; vz: number } | null {
	const mag = Math.hypot(pull.x, pull.z);
	if (mag < P.minPull) return null;
	const speed = Math.min(mag, P.maxPull) * P.powerScale;
	return { vx: -(pull.x / mag) * speed, vz: -(pull.z / mag) * speed };
}

export const ballSpeed = (b: Ball): number => Math.hypot(b.vx, b.vz);
export const isSettled = (b: Ball, P: BallParams = PARAMS): boolean => ballSpeed(b) < P.settleSpeed;

/* ---------- physics ---------- */

/** Circle vs segment (capsule): push the ball out and reflect its normal velocity. Mutates `b`. */
function collideSegment(b: Ball, s: Segment, r: number, restitution: number): void {
	const abx = s.bx - s.ax, abz = s.bz - s.az;
	const ab2 = abx * abx + abz * abz || 1;
	const t = clamp(((b.x - s.ax) * abx + (b.z - s.az) * abz) / ab2, 0, 1);
	const cx = s.ax + abx * t, cz = s.az + abz * t;
	let dx = b.x - cx, dz = b.z - cz;
	let d = Math.hypot(dx, dz);
	if (d >= r) return;
	let nx: number, nz: number;
	if (d > 1e-6) { nx = dx / d; nz = dz / d; } else { nx = s.nx; nz = s.nz; d = 0; }
	b.x += nx * (r - d);
	b.z += nz * (r - d);
	const vn = b.vx * nx + b.vz * nz;
	if (vn < 0) {
		b.vx -= (1 + restitution) * vn * nx;
		b.vz -= (1 + restitution) * vn * nz;
	}
}

/** Advance the ball by `dt` seconds. Sub-steps to avoid tunnelling. Pure. */
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

	// Fine enough that a full-speed ball can't skip the cup core.
	const sub = clamp(Math.ceil((ballSpeed(b) * dt) / hole.coreR), 1, 16);
	const h = dt / sub;
	const r = P.ballR;
	let sunk = false;

	for (let i = 0; i < sub && !sunk; i++) {
		b.x += b.vx * h;
		b.z += b.vz * h;

		for (const s of hole.segments) collideSegment(b, s, r, P.restitution);

		// Slopes / relief: green bowl pulls toward the cup; relief patches push downhill.
		for (const sl of hole.slopes) {
			const sdx = sl.cx - b.x, sdz = sl.cz - b.z;
			const sd = Math.hypot(sdx, sdz);
			if (sd >= sl.r) continue;
			if (sl.kind === 'radial') {
				if (sd > 1e-4) {
					const f = sl.strength * (sd / sl.r) * h; // ∝ distance from centre (bowl)
					b.vx += (sdx / sd) * f;
					b.vz += (sdz / sd) * f;
				}
			} else {
				const f = sl.strength * (1 - sd / sl.r) * h;
				b.vx += sl.ax * f;
				b.vz += sl.az * f;
			}
		}

		// Cup magnet: pull toward the centre when over the hole (curves fast balls).
		const dcx = hole.cup.x - b.x, dcz = hole.cup.z - b.z;
		const dc = Math.hypot(dcx, dcz);
		if (dc < hole.cupR) {
			if (dc > 1e-4) {
				const f = P.magnet * (1 - dc / hole.cupR) * h;
				b.vx += (dcx / dc) * f;
				b.vz += (dcz / dc) * f;
			}
			// Dead-centre → always in; otherwise needs to be slow enough.
			if (dc < hole.coreR || ballSpeed(b) < P.captureSpeed) {
				b.x = hole.cup.x;
				b.z = hole.cup.z;
				b.vx = 0;
				b.vz = 0;
				sunk = true;
			}
		}

		// Friction.
		const sp = ballSpeed(b);
		if (sp > 0) {
			const ns = Math.max(0, sp - P.decel * h);
			const k = ns / sp;
			b.vx *= k;
			b.vz *= k;
		}
		if (ballSpeed(b) < P.settleSpeed) {
			b.vx = 0;
			b.vz = 0;
		}
	}

	return { ball: b, sunk };
}

/** Convenience for callers that want a fresh deterministic hole from a seed. */
export const holeFromSeed = (seed: number, diff: DiffLevel): Hole => generateHole(mulberry32(seed), diff);
