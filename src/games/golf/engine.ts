/**
 * MINI-GOLF — pure engine (no rendering, no I/O).
 * A winding walled corridor from tee to cup. Slingshot aim (power ∝ pull, launch
 * opposite the drag); friction brings the ball to rest; it bounces off the lane
 * walls (arbitrary angles → curves). The cup is barely bigger than the ball and
 * pulls it toward the centre — dead-centre passes drop in even when fast.
 * Layout is generated deterministically from a seed (shared daily hole).
 */

import { mulberry32, type Rng } from '../prng';
import { encodePacked, decodePacked } from '../../lib/scoreFormat';

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
	alt: number[]; // altitude per path point (drives colour + relief)
	bank: number[]; // per-sample turn rate (banked curves: + = left turn)
	relief: Vec[]; // per-sample acceleration (downhill + banking)
	cutIdx: number; // last corridor sample before the circular green
	segments: Segment[]; // lane walls + tee cap + green ring + obstacle edges
	obstacles: Obstacle[]; // for rendering
	slopes: Slope[]; // radial green bowl
	greenR: number; // radius of the sloped green around the cup
	greenWall: Vec[]; // ordered points of the circular green wall (for rendering)
	bridge: { lo: number; hi: number } | null; // path sample range rendered as a plank bridge
	water: Vec[] | null; // decorative water rectangle under the bridge (4 corners)
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
	facile: { label: 'Facile', length: 135, bends: 7, width: 15, cupR: 1.35, obstacles: 1, slopes: 1 },
	moyen: { label: 'Moyen', length: 200, bends: 10, width: 13, cupR: 1.2, obstacles: 2, slopes: 2 },
	difficile: { label: 'Difficile', length: 265, bends: 13, width: 11, cupR: 1.05, obstacles: 3, slopes: 3 },
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
	const baseStep = diff.length / (diff.bends - 1);
	const SAMPLES = clamp(Math.round(diff.length / 1.6), 40, 200);
	const minSep = diff.width + 3; // the corridor must not fold onto itself
	// Only compare samples far enough apart in arc length that being close in space means a real fold.
	const gap = Math.max(8, Math.ceil((minSep * 1.5) / (diff.length / (SAMPLES - 1))));

	// Winding centerline: more bends, varied section lengths, sharper doglegs (no backtrack).
	const buildPath = (): PathPoint[] => {
		const base = -Math.PI / 2 + (rng() - 0.5) * 0.7;
		let heading = base, x = 0, z = 0;
		const ctrl: Vec[] = [{ x, z }];
		for (let i = 1; i < diff.bends; i++) {
			heading = clamp(heading + (rng() - 0.5) * 2.0, base - 1.5, base + 1.5);
			const stp = baseStep * (0.6 + rng() * 0.9);
			x += Math.cos(heading) * stp;
			z += Math.sin(heading) * stp;
			ctrl.push({ x, z });
		}
		const raw: Vec[] = [];
		for (let s = 0; s < SAMPLES; s++) raw.push(catmullOpen(ctrl, s / (SAMPLES - 1)));
		const pp: PathPoint[] = [];
		for (let i = 0; i < SAMPLES; i++) {
			const cur = raw[i], next = raw[Math.min(SAMPLES - 1, i + 1)], prev = raw[Math.max(0, i - 1)];
			let dx = next.x - prev.x, dz = next.z - prev.z;
			const len = Math.hypot(dx, dz) || 1;
			dx /= len; dz /= len;
			pp.push({ x: cur.x, z: cur.z, dirX: dx, dirZ: dz, nx: -dz, nz: dx });
		}
		return pp;
	};
	const selfIntersects = (pp: PathPoint[]): boolean => {
		for (let i = 0; i < pp.length; i++)
			for (let j = i + gap; j < pp.length; j++)
				if (Math.hypot(pp[i].x - pp[j].x, pp[i].z - pp[j].z) < minSep) return true;
		return false;
	};
	let path = buildPath();
	for (let attempt = 0; attempt < 40 && selfIntersects(path); attempt++) path = buildPath();

	// Variable half-width: smooth low-frequency variation (wider/narrower), tapering to a
	// narrow "mouth" near the cup so the corridor opens into a wider circular green.
	const minHalf = PARAMS.ballR + 1.4;
	const mouthHalf = PARAMS.ballR + 2.0;
	const ph1 = rng() * Math.PI * 2, ph2 = rng() * Math.PI * 2;
	const f1 = 1.7 + rng() * 1.2, f2 = 3.3 + rng() * 1.6;
	const widths: number[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t = i / (SAMPLES - 1);
		const factor = 1 + 0.34 * Math.sin(t * Math.PI * f1 + ph1) + 0.16 * Math.sin(t * Math.PI * f2 + ph2);
		let w = clamp(hw * factor, minHalf, hw * 1.6);
		const nearCup = Math.max(0, 1 - (SAMPLES - 1 - i) / (SAMPLES * 0.12));
		w = w * (1 - nearCup) + mouthHalf * nearCup;
		widths.push(Math.max(minHalf, w));
	}

	const left = path.map((p, i) => ({ x: p.x + p.nx * widths[i], z: p.z + p.nz * widths[i] }));
	const right = path.map((p, i) => ({ x: p.x - p.nx * widths[i], z: p.z - p.nz * widths[i] }));

	const startIdx = 1;
	const start: Vec = { x: path[startIdx].x, z: path[startIdx].z };
	const cup: Vec = { x: path[SAMPLES - 1].x, z: path[SAMPLES - 1].z };
	const cupR = diff.cupR;
	const coreR = Math.max(PARAMS.ballR * 0.7, cupR * 0.4);
	const greenR = clamp(hw, 5, 8);
	const par = clamp(Math.round(diff.length / 42) + 1, 2, 6);

	// The corridor runs until it meets the circular green; beyond, the green takes over.
	let cutIdx = SAMPLES - 1;
	while (cutIdx > 3 && Math.hypot(path[cutIdx].x - cup.x, path[cutIdx].z - cup.z) < greenR) cutIdx--;

	const segments: Segment[] = [];
	for (let i = 0; i < cutIdx; i++) {
		segments.push(makeSegment(left[i].x, left[i].z, left[i + 1].x, left[i + 1].z, path[i]));
		segments.push(makeSegment(right[i].x, right[i].z, right[i + 1].x, right[i + 1].z, path[i]));
	}
	segments.push(makeSegment(left[0].x, left[0].z, right[0].x, right[0].z, path[1])); // tee cap

	// Circular green wall (bumper following the circle) with an opening facing the corridor.
	const theta0 = Math.atan2(path[cutIdx].z - cup.z, path[cutIdx].x - cup.x);
	const openHalf = clamp(Math.asin(Math.min(1, (widths[cutIdx] + 0.6) / greenR)), 0.3, 0.95);
	const ringPt = (a: number): Vec => ({ x: cup.x + Math.cos(a) * greenR, z: cup.z + Math.sin(a) * greenR });
	const ARC = 40;
	const aStart = theta0 + openHalf, aEnd = theta0 + Math.PI * 2 - openHalf;
	const greenWall: Vec[] = [];
	for (let k = 0; k <= ARC; k++) greenWall.push(ringPt(aStart + ((aEnd - aStart) * k) / ARC));
	for (let k = 0; k < greenWall.length - 1; k++)
		segments.push(makeSegment(greenWall[k].x, greenWall[k].z, greenWall[k + 1].x, greenWall[k + 1].z, cup));
	// Seal the corridor mouth to the green opening edges.
	const op1 = greenWall[0], op2 = greenWall[greenWall.length - 1];
	const Lc = left[cutIdx], Rc = right[cutIdx];
	const lOpen = Math.hypot(Lc.x - op1.x, Lc.z - op1.z) <= Math.hypot(Lc.x - op2.x, Lc.z - op2.z) ? op1 : op2;
	const rOpen = lOpen === op1 ? op2 : op1;
	segments.push(makeSegment(Lc.x, Lc.z, lOpen.x, lOpen.z, cup));
	segments.push(makeSegment(Rc.x, Rc.z, rOpen.x, rOpen.z, cup));

	// Obstacles: decorative blocks flush against ONE wall, jutting into the lane (chicanes).
	// A passage on the opposite side always remains (protrusion < lane − ball clearance).
	const obstacles: Obstacle[] = [];
	const used: number[] = [];
	const loIdx = Math.round(SAMPLES * 0.18), hiIdx = Math.min(Math.round(SAMPLES * 0.82), cutIdx - 2);
	for (let attempt = 0; attempt < diff.obstacles * 40 && obstacles.length < diff.obstacles && hiIdx > loIdx; attempt++) {
		const idx = loIdx + Math.floor(rng() * (hiIdx - loIdx));
		if (used.some((u) => Math.abs(u - idx) < SAMPLES * 0.12)) continue;
		const p = path[idx];
		const lw = widths[idx];
		const along = 1.4 + rng() * 2.2;
		const protrude = Math.min(1.6 + rng() * 2.0, 2 * lw - (PARAMS.ballR * 2 + 2.2));
		if (protrude < 1.2) continue;
		const s = rng() < 0.5 ? 1 : -1; // which wall it sticks out from
		const naO = s * lw, naI = s * (lw - protrude); // outer edge at the wall, inner edge in-lane
		const cx = p.x + p.nx * (s * (lw - protrude / 2)), cz = p.z + p.nz * (s * (lw - protrude / 2));
		if (Math.hypot(cx - start.x, cz - start.z) < 9 || Math.hypot(cx - cup.x, cz - cup.z) < greenR + 6) continue;
		const corner = (ta: number, na: number): Vec => ({ x: p.x + p.dirX * ta + p.nx * na, z: p.z + p.dirZ * ta + p.nz * na });
		const pts = [corner(along, naO), corner(along, naI), corner(-along, naI), corner(-along, naO)];
		const center = { x: cx, z: cz };
		for (let k = 0; k < 4; k++) {
			const a = pts[k], b = pts[(k + 1) % 4];
			segments.push(makeSegment(a.x, a.z, b.x, b.z, center, false));
		}
		obstacles.push({ pts });
		used.push(idx);
	}

	const ds = diff.length / (SAMPLES - 1);

	// Bridge over a decorative water stream at a narrow section — also a hump to roll over.
	let bridge: { lo: number; hi: number } | null = null;
	let water: Vec[] | null = null;
	{
		const span = 3;
		const loB = Math.round(SAMPLES * 0.25), hiB = Math.min(Math.round(SAMPLES * 0.72), cutIdx - span - 1);
		let bestI = -1, bestW = Infinity;
		for (let i = loB; i <= hiB; i++) {
			if (obstacles.some((o) => o.pts.some((pt) => Math.hypot(pt.x - path[i].x, pt.z - path[i].z) < 6))) continue;
			let avg = 0;
			for (let k = -span; k <= span; k++) avg += widths[i + k];
			avg /= 2 * span + 1;
			if (avg < bestW) { bestW = avg; bestI = i; }
		}
		if (bestI >= 0) {
			bridge = { lo: bestI - span, hi: bestI + span };
			const m = path[bestI];
			const along = span * ds + 2.5;
			const across = widths[bestI] + 9;
			const c = (ta: number, na: number): Vec => ({ x: m.x + m.dirX * ta + m.nx * na, z: m.z + m.dirZ * ta + m.nz * na });
			water = [c(along, across), c(along, -across), c(-along, -across), c(-along, across)];
		}
	}

	// A "pump track" run of consecutive rollers somewhere along the corridor.
	const pumpStart = Math.round(SAMPLES * (0.2 + rng() * 0.25));
	const pumpLen = Math.round(SAMPLES * (0.18 + rng() * 0.14));
	const pumpCycles = 3 + Math.floor(rng() * 2);

	// Altitude: base undulation + green dip + pump rollers + the humpback bridge.
	const aph1 = rng() * Math.PI * 2, af1 = 1.2 + rng() * 1.1;
	const aph2 = rng() * Math.PI * 2, af2 = 2.5 + rng() * 1.4;
	const alt: number[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t = i / (SAMPLES - 1);
		let a = 1.9 * Math.sin(t * Math.PI * af1 + aph1) + 0.9 * Math.sin(t * Math.PI * af2 + aph2);
		const dCup = Math.hypot(path[i].x - cup.x, path[i].z - cup.z);
		if (dCup < greenR) a -= (1 - dCup / greenR) * 2.5;
		if (i >= pumpStart && i < pumpStart + pumpLen) {
			const u = (i - pumpStart) / pumpLen;
			a += 2.2 * Math.sin(u * Math.PI) * Math.sin(u * pumpCycles * Math.PI * 2);
		}
		if (bridge && i >= bridge.lo && i <= bridge.hi) {
			const u = (i - bridge.lo) / (bridge.hi - bridge.lo);
			a += 3.2 * Math.sin(u * Math.PI); // hump
		}
		alt.push(a);
	}
	const K = 42; // downhill push from the altitude gradient (clearly felt)
	const BANK = 28; // banked-turn cross slope → curved trajectories
	const angDiff = (a: number, b: number) => {
		let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
		if (d < -Math.PI) d += Math.PI * 2;
		return d;
	};
	const bank: number[] = [];
	const relief: Vec[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const ip = Math.max(0, i - 1), inx = Math.min(SAMPLES - 1, i + 1);
		const dAltds = (alt[inx] - alt[ip]) / (ds * Math.max(1, inx - ip));
		const dH = angDiff(Math.atan2(path[ip].dirZ, path[ip].dirX), Math.atan2(path[inx].dirZ, path[inx].dirX));
		bank.push(dH);
		relief.push({
			x: -K * dAltds * path[i].dirX + BANK * dH * path[i].nx,
			z: -K * dAltds * path[i].dirZ + BANK * dH * path[i].nz,
		});
	}

	const slopes: Slope[] = [{ kind: 'radial', cx: cup.x, cz: cup.z, r: greenR, strength: 17, ax: 0, az: 0 }];

	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (const pt of [...left.slice(0, cutIdx + 1), ...right.slice(0, cutIdx + 1), ...greenWall, ...obstacles.flatMap((o) => o.pts), ...(water ?? [])]) {
		if (pt.x < minX) minX = pt.x;
		if (pt.x > maxX) maxX = pt.x;
		if (pt.z < minZ) minZ = pt.z;
		if (pt.z > maxZ) maxZ = pt.z;
	}

	return {
		path, widths, halfWidth: hw, alt, bank, relief, cutIdx, segments, obstacles, slopes, greenR, greenWall,
		bridge, water, bounds: { minX, maxX, minZ, maxZ }, start, cup, cupR, coreR, par,
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

	// Altitude relief: a moving ball drifts downhill (nearest centerline sample's gradient).
	if (hole.relief.length) {
		let bi = 0, bd = Infinity;
		for (let i = 0; i < hole.path.length; i++) {
			const dx = hole.path[i].x - b.x, dz = hole.path[i].z - b.z;
			const dd = dx * dx + dz * dz;
			if (dd < bd) { bd = dd; bi = i; }
		}
		b.vx += hole.relief[bi].x * dt;
		b.vz += hole.relief[bi].z * dt;
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

		// Drop in once the ball is more than ~50% over the hole (its centre within the cup
		// radius), at ANY speed. A graze that keeps its centre outside the rim lips out.
		const dc = Math.hypot(hole.cup.x - b.x, hole.cup.z - b.z);
		if (dc < hole.cupR) {
			b.x = hole.cup.x;
			b.z = hole.cup.z;
			b.vx = 0;
			b.vz = 0;
			sunk = true;
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

/* ---------- leaderboard score (strokes, then time as a tiebreaker) ---------- */

/** One ascending number: fewer strokes ranks first; ties are broken by faster time. */
export function encodeScore(strokes: number, timeSec: number): number {
	return encodePacked(10_000_000, [strokes, Math.min(9_999_999, Math.max(0, Math.round(timeSec * 100)))]);
}

export function decodeScore(v: number): { strokes: number; timeSec: number } {
	const [strokes, t] = decodePacked(10_000_000, 2, v);
	return { strokes, timeSec: t / 100 };
}
