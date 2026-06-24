import { describe, it, expect } from 'vitest';
import {
	CAR,
	generateTrack,
	createCar,
	stepCar,
	createLap,
	stepLap,
	type CarState,
	type LapState,
	type Track,
} from './engine';

const track = generateTrack(123);

const lateralMag = (c: CarState): number => Math.abs(c.vx * -Math.sin(c.heading) + c.vz * Math.cos(c.heading));

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

	it('steering induces lateral drift that then decays (grip)', () => {
		let c: CarState = { x: 0, z: 0, heading: 0, vx: 20, vz: 0, speed: 20 };
		c = stepCar(c, { steer: 1, brake: 0 }, 0.1, track);
		const lat1 = lateralMag(c);
		expect(lat1).toBeGreaterThan(0.3); // it slides sideways through the turn
		for (let i = 0; i < 90; i++) c = stepCar(c, { steer: 0, brake: 0 }, 1 / 60, track);
		expect(lateralMag(c)).toBeLessThan(lat1); // grip pulls it back in line
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
