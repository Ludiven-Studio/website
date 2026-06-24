/**
 * DRIFT — top-down arcade racing (pure engine, no rendering / no network).
 * A random closed track (deterministic from a seed → same circuit for everyone in a room),
 * an arcade car with automatic drift (lateral slip), and per-lap timing with ordered checkpoints.
 * three.js renders the state; Supabase Realtime syncs ghost cars elsewhere.
 */

import { mulberry32, type Rng } from '../prng';

export interface Vec2 {
	x: number;
	z: number;
}

export interface TrackPoint {
	x: number;
	z: number;
	dirX: number; // unit tangent
	dirZ: number;
	nx: number; // unit normal (left)
	nz: number;
}

export interface Track {
	seed: number;
	width: number; // full track width
	points: TrackPoint[]; // closed centerline (points[last] connects to points[0])
	length: number; // approx centerline length
	checkpoints: number[]; // indices into points, in lap order (index 0 = start/finish)
}

export interface CarParams {
	accel: number; // forward acceleration (auto-throttle)
	maxSpeed: number;
	brakeDecel: number;
	turnRate: number; // rad/s at full steer
	gripDrift: number; // lateral retention while drifting (≈1 → long slide)
	gripGrip: number; // lateral retention when gripping (low → snaps back, no slide)
	driftMinSpeed: number; // min forward speed to break into a drift
	driftRise: number; // how fast the drift engages while holding a hard turn (per s)
	driftFall: number; // how slowly it releases when you ease off (per s) → smooth exit
	offTrackMul: number; // speed/grip multiplier off-track
	wallMargin: number; // grass band width beyond the asphalt before a hard wall
}

export const CAR: CarParams = {
	accel: 26,
	maxSpeed: 46,
	brakeDecel: 60,
	turnRate: 3.0,
	gripDrift: 0.97,
	gripGrip: 0.5,
	driftMinSpeed: 12,
	driftRise: 8, // ~engages within ~0.1s of holding
	driftFall: 2.5, // ~lingers ~0.3s then eases out
	offTrackMul: 0.45,
	wallMargin: 4,
};

export interface CarState {
	x: number;
	z: number;
	heading: number; // radians, 0 = +x
	vx: number; // world velocity
	vz: number;
	speed: number; // signed forward speed (for HUD)
	drifting: boolean; // derived (driftAmt high) → emit trails / HUD
	driftAmt: number; // 0..1 continuous drift level: rises fast, falls slow (smooth exit)
}

export interface CarInput {
	steer: number; // -1..1
	brake: number; // 0..1
}

/* ----------------------------- Track ----------------------------- */

const TWO_PI = Math.PI * 2;

/** Catmull-Rom (closed) interpolation between control points. */
function catmullClosed(pts: Vec2[], t: number): Vec2 {
	const n = pts.length;
	const f = ((t % 1) + 1) % 1;
	const s = f * n;
	const i = Math.floor(s);
	const u = s - i;
	const p0 = pts[(i - 1 + n) % n];
	const p1 = pts[i % n];
	const p2 = pts[(i + 1) % n];
	const p3 = pts[(i + 2) % n];
	const u2 = u * u;
	const u3 = u2 * u;
	const a = -0.5 * u3 + u2 - 0.5 * u;
	const b = 1.5 * u3 - 2.5 * u2 + 1;
	const c = -1.5 * u3 + 2 * u2 + 0.5 * u;
	const d = 0.5 * u3 - 0.5 * u2;
	return {
		x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
		z: a * p0.z + b * p1.z + c * p2.z + d * p3.z,
	};
}

/** Random closed circuit from a seed. Mild jitter keeps it (near) non-self-intersecting. */
export function generateTrack(seed: number, rng: Rng = mulberry32(seed)): Track {
	const CONTROLS = 9;
	const BASE_R = 90;
	const SAMPLES = 220;
	const width = 13;

	// Control points around a circle with bounded radial + angular jitter.
	const ctrl: Vec2[] = [];
	for (let i = 0; i < CONTROLS; i++) {
		const ang = (i / CONTROLS) * TWO_PI + (rng() - 0.5) * (TWO_PI / CONTROLS) * 0.5;
		const r = BASE_R * (0.72 + rng() * 0.5);
		ctrl.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r });
	}

	// Sample a smooth closed centerline.
	const raw: Vec2[] = [];
	for (let s = 0; s < SAMPLES; s++) raw.push(catmullClosed(ctrl, s / SAMPLES));

	const points: TrackPoint[] = [];
	let length = 0;
	for (let i = 0; i < SAMPLES; i++) {
		const cur = raw[i];
		const next = raw[(i + 1) % SAMPLES];
		let dx = next.x - cur.x;
		let dz = next.z - cur.z;
		const len = Math.hypot(dx, dz) || 1;
		dx /= len;
		dz /= len;
		length += len;
		points.push({ x: cur.x, z: cur.z, dirX: dx, dirZ: dz, nx: -dz, nz: dx }); // left normal
	}

	// Evenly spaced checkpoints, index 0 = start/finish line.
	const CP = 12;
	const checkpoints: number[] = [];
	for (let c = 0; c < CP; c++) checkpoints.push(Math.round((c / CP) * SAMPLES) % SAMPLES);

	return { seed, width, points, length, checkpoints };
}

/** Nearest centerline sample to a point (linear scan; tracks are small). */
export function nearestIndex(track: Track, x: number, z: number): number {
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < track.points.length; i++) {
		const p = track.points[i];
		const d = (p.x - x) ** 2 + (p.z - z) ** 2;
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

/** True if (x,z) is on the asphalt (within half-width of the nearest centerline point). */
export function onTrack(track: Track, x: number, z: number): boolean {
	const i = nearestIndex(track, x, z);
	const p = track.points[i];
	const d = Math.hypot(p.x - x, p.z - z);
	return d <= track.width / 2;
}

/* ----------------------------- Car ----------------------------- */

export function createCar(track: Track): CarState {
	const p = track.points[track.checkpoints[0]];
	return { x: p.x, z: p.z, heading: Math.atan2(p.dirZ, p.dirX), vx: 0, vz: 0, speed: 0, drifting: false, driftAmt: 0 };
}

/** Advance the car by dt seconds. Auto-throttle; `steer` turns; lateral velocity slips then decays (drift). */
export function stepCar(car: CarState, input: CarInput, dt: number, track: Track, P: CarParams = CAR): CarState {
	const onIt = onTrack(track, car.x, car.z);
	const mul = onIt ? 1 : P.offTrackMul;

	// Steering scales a bit with speed so a parked car still pivots a little.
	const heading = car.heading + input.steer * P.turnRate * dt;

	const fx = Math.cos(heading);
	const fz = Math.sin(heading);

	// Decompose velocity into forward / lateral relative to the new heading.
	let fwd = car.vx * fx + car.vz * fz;
	const latX = car.vx - fwd * fx;
	const latZ = car.vz - fwd * fz;

	// Auto-accelerate toward maxSpeed; brake decelerates.
	if (input.brake > 0) fwd -= P.brakeDecel * input.brake * dt;
	else fwd += P.accel * mul * dt;
	const vmax = P.maxSpeed * mul;
	if (fwd > vmax) fwd = vmax;
	if (fwd < 0) fwd = 0;

	// Continuous drift level: rises fast while a hard turn is held at speed, falls slowly when eased off
	// → quick engage, lingers, and exits smoothly (no abrupt regrip).
	const wantDrift = Math.abs(input.steer) > 0.6 && fwd > P.driftMinSpeed;
	const rate = wantDrift ? P.driftRise : P.driftFall;
	const target = wantDrift ? 1 : 0;
	const driftAmt = Math.max(0, Math.min(1, car.driftAmt + (target - car.driftAmt) * Math.min(1, rate * dt)));
	const drifting = driftAmt > 0.4;

	// Lateral grip blends continuously with driftAmt → smooth slide in/out. Grass is always slippery.
	const retain = !onIt ? 0.95 : P.gripGrip + (P.gripDrift - P.gripGrip) * driftAmt;
	const grip = Math.pow(retain, dt * 60);
	const lvx = latX * grip;
	const lvz = latZ * grip;

	let vx = fx * fwd + lvx;
	let vz = fz * fwd + lvz;
	let nx2 = car.x + vx * dt;
	let nz2 = car.z + vz * dt;

	// Hard barrier: cannot go beyond the grass — slide along the wall instead of flying off.
	const wallR = track.width / 2 + P.wallMargin;
	const ni = nearestIndex(track, nx2, nz2);
	const np = track.points[ni];
	const ox = nx2 - np.x;
	const oz = nz2 - np.z;
	const od = Math.hypot(ox, oz);
	if (od > wallR) {
		const ux = ox / od;
		const uz = oz / od;
		nx2 = np.x + ux * wallR;
		nz2 = np.z + uz * wallR;
		const outward = vx * ux + vz * uz;
		if (outward > 0) {
			vx -= outward * ux; // cancel the into-wall component → scrub along it
			vz -= outward * uz;
		}
	}

	return { x: nx2, z: nz2, heading, vx, vz, speed: fwd, drifting, driftAmt };
}

/* ----------------------------- Lap timing ----------------------------- */

export interface LapState {
	nextCp: number; // index into track.checkpoints expected next
	startedMs: number | null; // time the current lap began (start-line cross), null until armed
	bestMs: number | null;
	lastMs: number | null;
}

export function createLap(): LapState {
	return { nextCp: 1, startedMs: null, bestMs: null, lastMs: null };
}

/**
 * Update lap state after moving from prev→cur. `nowMs` is the elapsed clock.
 * Counts a lap only when all checkpoints were passed in order before re-crossing the start line.
 */
export function stepLap(lap: LapState, prevIdx: number, curIdx: number, track: Track, nowMs: number): LapState {
	const cps = track.checkpoints;
	const passed = (cpIdx: number) => {
		// crossed sample index cpIdx between prev and cur (forward), handling wrap at 0.
		if (prevIdx === curIdx) return false;
		if (prevIdx < curIdx) return cpIdx > prevIdx && cpIdx <= curIdx;
		return cpIdx > prevIdx || cpIdx <= curIdx; // wrapped past the end
	};

	let { nextCp, startedMs, bestMs, lastMs } = lap;

	// Start/finish line (checkpoint 0).
	if (passed(cps[0])) {
		if (startedMs != null && nextCp === 0) {
			// Completed a full, valid lap.
			const t = nowMs - startedMs;
			lastMs = t;
			if (bestMs == null || t < bestMs) bestMs = t;
		}
		startedMs = nowMs; // (re)arm the lap timer
		nextCp = 1;
	}

	// Intermediate checkpoints must be taken in order.
	if (startedMs != null && nextCp > 0 && nextCp < cps.length && passed(cps[nextCp])) {
		nextCp += 1;
		if (nextCp >= cps.length) nextCp = 0; // all intermediates done → only the line remains
	}

	return { nextCp, startedMs, bestMs, lastMs };
}
