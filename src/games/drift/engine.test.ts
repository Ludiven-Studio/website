import { describe, it, expect } from 'vitest';
import {
	CAR,
	generateTrack,
	createCar,
	stepCar,
	createLap,
	stepLap,
	nearestIndex,
	type CarState,
	type LapState,
	type Track,
} from './engine';

const track = generateTrack(123);

const lateralMag = (c: CarState): number => Math.abs(c.vx * -Math.sin(c.heading) + c.vz * Math.cos(c.heading));

/** A car at the start line moving forward at ~30 u/s. */
const makeFast = (t: Track): CarState => {
	const p = t.points[t.checkpoints[0]];
	const h = Math.atan2(p.dirZ, p.dirX);
	return { x: p.x, z: p.z, heading: h, vx: Math.cos(h) * 30, vz: Math.sin(h) * 30, speed: 30, drifting: false, driftAmt: 0 };
};

/** Arm at the line, pass every checkpoint in order (incremental steps), then re-cross the line. */
const driveLap = (lap: LapState, t: Track, startMs: number, endMs: number): LapState => {
	let l = stepLap(lap, t.points.length - 1, 1, t, startMs); // cross start line
	for (let i = 1; i < t.points.length - 1; i += 2) l = stepLap(l, i, i + 2, t, startMs + i);
	return stepLap(l, t.points.length - 1, 1, t, endMs); // complete the lap
};

describe('drift engine', () => {
	it('generateTrack is deterministic from a seed', () => {
		expect(generateTrack(123)).toEqual(generateTrack(123));
		expect(generateTrack(1).points).not.toEqual(generateTrack(2).points);
	});

	it('track is a valid closed circuit with ordered checkpoints', () => {
		expect(track.width).toBeGreaterThan(0);
		expect(track.points.length).toBeGreaterThan(50);
		expect(track.checkpoints[0]).toBe(0);
		for (let i = 1; i < track.checkpoints.length; i++) {
			expect(track.checkpoints[i]).toBeGreaterThan(track.checkpoints[i - 1]);
			expect(track.checkpoints[i]).toBeLessThan(track.points.length);
		}
	});

	it('car accelerates from rest', () => {
		let c = createCar(track);
		for (let i = 0; i < 12; i++) c = stepCar(c, { steer: 0, brake: 0 }, 1 / 60, track);
		expect(c.speed).toBeGreaterThan(0);
	});

	it('braking slows the car', () => {
		let c = createCar(track);
		for (let i = 0; i < 20; i++) c = stepCar(c, { steer: 0, brake: 0 }, 1 / 60, track);
		const fast = c.speed;
		for (let i = 0; i < 20; i++) c = stepCar(c, { steer: 0, brake: 1 }, 1 / 60, track);
		expect(c.speed).toBeLessThan(fast);
	});

	it('forward speed stays bounded by maxSpeed', () => {
		let c = createCar(track);
		for (let i = 0; i < 600; i++) c = stepCar(c, { steer: 0, brake: 0 }, 1 / 60, track);
		expect(c.speed).toBeLessThanOrEqual(CAR.maxSpeed + 1e-6);
	});

	it('a brief turn does not drift (grip holds)', () => {
		let c = makeFast(track);
		c = stepCar(c, { steer: 1, brake: 0 }, 1 / 60, track); // a quick tap
		expect(c.drifting).toBe(false);
	});

	it('holding a hard turn at speed engages a drift with real lateral slide', () => {
		let brief = makeFast(track);
		brief = stepCar(brief, { steer: 1, brake: 0 }, 1 / 60, track);
		const briefLat = lateralMag(brief);

		let c = makeFast(track);
		for (let i = 0; i < 24; i++) c = stepCar(c, { steer: 1, brake: 0 }, 1 / 60, track); // ~0.4s held
		expect(c.drifting).toBe(true);
		expect(lateralMag(c)).toBeGreaterThan(briefLat); // it slides sideways once drifting
	});

	it('drift lingers and exits smoothly when steering is released', () => {
		let c = makeFast(track);
		for (let i = 0; i < 24; i++) c = stepCar(c, { steer: 1, brake: 0 }, 1 / 60, track);
		const peak = c.driftAmt;
		c = stepCar(c, { steer: 0, brake: 0 }, 1 / 60, track); // release for one frame
		expect(c.drifting).toBe(true); // still drifting just after release (lingers)
		expect(c.driftAmt).toBeLessThan(peak); // but already easing out, not snapping to 0
		expect(c.driftAmt).toBeGreaterThan(0);
	});

	it('cannot cross the barrier (stays within wallR of the centerline)', () => {
		let c = createCar(track);
		const wallR = track.width / 2 + CAR.wallMargin;
		let maxD = 0;
		for (let i = 0; i < 600; i++) {
			c = stepCar(c, { steer: 1, brake: 0 }, 1 / 60, track); // hard turn → push outward
			const p = track.points[nearestIndex(track, c.x, c.z)];
			maxD = Math.max(maxD, Math.hypot(p.x - c.x, p.z - c.z));
		}
		expect(maxD).toBeLessThanOrEqual(wallR + 0.5);
	});

	it('counts a full, valid lap and keeps the best time', () => {
		let lap = createLap();
		lap = driveLap(lap, track, 0, 5000);
		expect(lap.lastMs).toBe(5000);
		expect(lap.bestMs).toBe(5000);
		// A slower lap must not replace the best.
		lap = driveLap(lap, track, 5000, 13000);
		expect(lap.lastMs).toBe(8000);
		expect(lap.bestMs).toBe(5000);
	});

	it('does not count a lap when checkpoints are skipped', () => {
		let lap = createLap();
		lap = stepLap(lap, track.points.length - 1, 1, track, 0); // arm at the line
		lap = stepLap(lap, track.points.length - 1, 1, track, 4000); // re-cross without checkpoints
		expect(lap.bestMs).toBeNull();
	});
});
