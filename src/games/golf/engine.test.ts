import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	PARAMS,
	generateHole,
	stepBall,
	aimToVelocity,
	isSettled,
	ballSpeed,
	type Hole,
	type Ball,
} from './engine';
import { mulberry32 } from '../prng';

const distPointRect = (p: { x: number; z: number }, w: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
	const dx = Math.max(w.minX - p.x, 0, p.x - w.maxX);
	const dz = Math.max(w.minZ - p.z, 0, p.z - w.maxZ);
	return Math.hypot(dx, dz);
};

const sim = (ball: Ball, hole: Hole, seconds: number): { ball: Ball; sunk: boolean } => {
	let b = ball;
	let sunk = false;
	const dt = 1 / 60;
	for (let t = 0; t < seconds * 60 && !sunk; t++) {
		const r = stepBall(b, hole, dt);
		b = r.ball;
		sunk = r.sunk;
	}
	return { ball: b, sunk };
};

describe('golf engine', () => {
	it('generates a valid, deterministic hole for each difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const a = generateHole(mulberry32(42), diff);
			const b = generateHole(mulberry32(42), diff);
			expect(a, `${key} deterministic`).toEqual(b);

			const { w, h } = diff.half;
			for (const p of [a.start, a.cup]) {
				expect(Math.abs(p.x)).toBeLessThan(w);
				expect(Math.abs(p.z)).toBeLessThan(h);
			}
			// start and cup are far apart (opposite ends)
			expect(Math.hypot(a.cup.x - a.start.x, a.cup.z - a.start.z)).toBeGreaterThan(h);
			// walls stay in bounds and keep clear of start/cup
			for (const wl of a.walls) {
				expect(wl.minX).toBeGreaterThanOrEqual(-w);
				expect(wl.maxX).toBeLessThanOrEqual(w);
				expect(distPointRect(a.start, wl)).toBeGreaterThanOrEqual(5);
				expect(distPointRect(a.cup, wl)).toBeGreaterThanOrEqual(5);
			}
		}
	});

	it('aimToVelocity launches opposite the pull, clamps power, ignores micro drags', () => {
		const v = aimToVelocity({ x: 0, z: 10 })!;
		expect(v.vx).toBeCloseTo(0);
		expect(v.vz).toBeLessThan(0); // pulled +z → launches −z
		expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(10 * PARAMS.powerScale);
		// clamped at maxPull
		const big = aimToVelocity({ x: 0, z: 100 })!;
		expect(Math.hypot(big.vx, big.vz)).toBeCloseTo(PARAMS.maxPull * PARAMS.powerScale);
		// micro drag → no shot
		expect(aimToVelocity({ x: 0.1, z: 0 })).toBeNull();
	});

	it('bounces off a border (normal velocity reverses)', () => {
		const hole: Hole = { half: { w: 20, h: 26 }, start: { x: 0, z: 10 }, cup: { x: 0, z: -10 }, cupR: 1.3, walls: [], par: 3 };
		const r = stepBall({ x: 19.2, z: 0, vx: 20, vz: 0 }, hole, 1 / 60);
		expect(r.ball.vx).toBeLessThan(0);
		expect(r.ball.x).toBeLessThanOrEqual(20 - PARAMS.ballR + 1e-6);
	});

	it('bounces off an internal wall', () => {
		const wall = { minX: -3, maxX: 3, minZ: -1, maxZ: 1 };
		const hole: Hole = { half: { w: 20, h: 26 }, start: { x: 0, z: 10 }, cup: { x: 0, z: -10 }, cupR: 1.3, walls: [wall], par: 3 };
		const r = stepBall({ x: -3.5, z: 0, vx: 20, vz: 0 }, hole, 1 / 60);
		expect(r.ball.vx).toBeLessThan(0); // pushed back left
	});

	it('friction brings the ball to rest', () => {
		const hole: Hole = { half: { w: 40, h: 40 }, start: { x: -30, z: 0 }, cup: { x: 30, z: 0 }, cupR: 1, walls: [], par: 4 };
		const { ball } = sim({ x: 0, z: 0, vx: 10, vz: 0 }, hole, 4);
		expect(isSettled(ball)).toBe(true);
		expect(ballSpeed(ball)).toBe(0);
	});

	it('a well-judged straight putt drops in the cup', () => {
		const hole: Hole = { half: { w: 20, h: 26 }, start: { x: 0, z: 12 }, cup: { x: 0, z: -12 }, cupR: 1.3, walls: [], par: 3 };
		// distance 24; speed chosen to reach the cup arriving below captureSpeed
		const { sunk } = sim({ x: 0, z: 12, vx: 0, vz: -27 }, hole, 5);
		expect(sunk).toBe(true);
	});

	it('a ball crossing the cup too fast laps out (not captured)', () => {
		const hole: Hole = { half: { w: 20, h: 26 }, start: { x: 0, z: 12 }, cup: { x: 0, z: -12 }, cupR: 1.3, walls: [], par: 3 };
		// already over the cup but way faster than captureSpeed → not sunk this step
		const r = stepBall({ x: 0, z: -11.9, vx: 0, vz: -40 }, hole, 1 / 60);
		expect(ballSpeed({ x: 0, z: 0, vx: 0, vz: -40 } as Ball)).toBeGreaterThan(PARAMS.captureSpeed);
		expect(r.sunk).toBe(false);
	});
});
