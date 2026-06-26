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
	type Segment,
	type Slope,
} from './engine';
import { mulberry32 } from '../prng';

// Minimal hole for isolated physics tests (path is render-only; stepBall ignores it).
const mkHole = (segments: Segment[], cup = { x: 1e4, z: 1e4 }, cupR = 1.2, slopes: Slope[] = []): Hole => ({
	path: [],
	widths: [],
	halfWidth: 6,
	segments,
	obstacles: [],
	slopes,
	greenR: 6,
	bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
	start: { x: 0, z: 0 },
	cup,
	cupR,
	coreR: Math.max(PARAMS.ballR * 0.7, cupR * 0.4),
	par: 3,
});

const sim = (ball: Ball, hole: Hole, seconds: number) => {
	let b = ball;
	let sunk = false;
	for (let t = 0; t < seconds * 60 && !sunk; t++) {
		const r = stepBall(b, hole, 1 / 60);
		b = r.ball;
		sunk = r.sunk;
	}
	return { ball: b, sunk };
};

describe('golf engine (corridor)', () => {
	it('generates a valid, deterministic winding hole for each difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const a = generateHole(mulberry32(7), diff);
			const b = generateHole(mulberry32(7), diff);
			expect(a, `${key} deterministic`).toEqual(b);

			expect(a.path.length).toBeGreaterThan(20);
			expect(a.segments.length).toBeGreaterThan(20);
			expect(a.par).toBeGreaterThanOrEqual(2);
			expect(a.par).toBeLessThanOrEqual(6);
			for (const p of [...a.path, a.start, a.cup]) {
				expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
			}
			// tee and cup are far apart along the corridor
			expect(Math.hypot(a.cup.x - a.start.x, a.cup.z - a.start.z)).toBeGreaterThan(diff.length * 0.25);
			// every segment normal is unit length
			for (const s of a.segments) expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 5);
			// obstacles are generated and the bounds enclose the whole course
			expect(a.obstacles.length).toBeGreaterThanOrEqual(1);
			for (const o of a.obstacles) expect(o.pts.length).toBe(4);
			// variable widths (per path point, never below clearance) + a sloped green at the cup
			expect(a.widths.length).toBe(a.path.length);
			for (const w of a.widths) expect(w).toBeGreaterThanOrEqual(PARAMS.ballR + 1.4 - 1e-6);
			expect(Math.max(...a.widths) - Math.min(...a.widths)).toBeGreaterThan(0.5); // actually varies
			expect(a.slopes.some((s) => s.kind === 'radial')).toBe(true);
			expect(a.greenR).toBeGreaterThan(2);
			for (const p of a.path) {
				expect(p.x).toBeGreaterThanOrEqual(a.bounds.minX - 1e-6);
				expect(p.x).toBeLessThanOrEqual(a.bounds.maxX + 1e-6);
				expect(p.z).toBeGreaterThanOrEqual(a.bounds.minZ - 1e-6);
				expect(p.z).toBeLessThanOrEqual(a.bounds.maxZ + 1e-6);
			}
		}
	});

	it('aimToVelocity launches opposite the pull, clamps power, ignores micro drags', () => {
		const v = aimToVelocity({ x: 0, z: 10 })!;
		expect(v.vz).toBeLessThan(0);
		expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(10 * PARAMS.powerScale);
		const big = aimToVelocity({ x: 0, z: 100 })!;
		expect(Math.hypot(big.vx, big.vz)).toBeCloseTo(PARAMS.maxPull * PARAMS.powerScale);
		expect(aimToVelocity({ x: 0.1, z: 0 })).toBeNull();
	});

	it('bounces off an angled wall segment (normal velocity reverses)', () => {
		// Horizontal wall on the z=0 line, inside is +z.
		const seg: Segment = { ax: -6, az: 0, bx: 6, bz: 0, nx: 0, nz: 1 };
		const r = stepBall({ x: 0, z: 0.5, vx: 0, vz: -20 }, mkHole([seg]), 1 / 60);
		expect(r.ball.vz).toBeGreaterThan(0); // bounced back inward
	});

	it('the cup pulls a nearby ball toward its centre', () => {
		const hole = mkHole([], { x: 0, z: 0 }, 1.2);
		// fast ball skimming the rim at x=0.9, moving +z (centre is at −x)
		const r = stepBall({ x: 0.9, z: 0, vx: 0, vz: 20 }, hole, 1 / 60);
		expect(r.ball.vx).toBeLessThan(0); // attracted toward centre (−x)
		expect(r.sunk).toBe(false); // too fast + off-centre → not yet
	});

	it('a dead-centre pass drops in even at high speed', () => {
		const hole = mkHole([], { x: 0, z: 0 }, 1.2);
		const r = stepBall({ x: 0, z: 0.3, vx: 0, vz: -40 }, hole, 1 / 60);
		expect(r.sunk).toBe(true);
	});

	it('a slow ball settling in the cup drops in', () => {
		const hole = mkHole([], { x: 0, z: 0 }, 1.2);
		const { sunk } = sim({ x: 0, z: 2.0, vx: 0, vz: -8 }, hole, 4);
		expect(sunk).toBe(true);
	});

	it('friction brings the ball to rest', () => {
		const { ball } = sim({ x: 0, z: 0, vx: 10, vz: 0 }, mkHole([]), 4);
		expect(isSettled(ball)).toBe(true);
		expect(ballSpeed(ball)).toBe(0);
	});

	it('the sloped green guides a slow ball into the cup', () => {
		const green: Slope = { kind: 'radial', cx: 0, cz: 0, r: 6, ax: 0, az: 0, strength: 17 };
		// Same shot: stops short on flat ground, but the green bowl pulls it in.
		const flat = sim({ x: 0, z: 5, vx: 0, vz: -6 }, mkHole([], { x: 0, z: 0 }, 1.2, []), 5);
		const bowl = sim({ x: 0, z: 5, vx: 0, vz: -6 }, mkHole([], { x: 0, z: 0 }, 1.2, [green]), 5);
		expect(flat.sunk).toBe(false);
		expect(bowl.sunk).toBe(true);
	});

	it('a relief patch deflects the ball downhill', () => {
		const patch: Slope = { kind: 'dir', cx: 0, cz: 0, r: 6, ax: 1, az: 0, strength: 10 };
		// Travelling straight along +z through a +x slope → gains sideways (+x) velocity.
		const r = sim({ x: 0, z: -3, vx: 0, vz: 6 }, mkHole([], { x: 1e4, z: 1e4 }, 1.2, [patch]), 0.6);
		expect(r.ball.vx).toBeGreaterThan(0);
	});
});
