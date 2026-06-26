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
} from './engine';
import { mulberry32 } from '../prng';

// Minimal hole for isolated physics tests (path is render-only; stepBall ignores it).
const mkHole = (segments: Segment[], cup = { x: 1e4, z: 1e4 }, cupR = 1.2): Hole => ({
	path: [],
	halfWidth: 6,
	segments,
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
});
