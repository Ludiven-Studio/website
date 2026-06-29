import { describe, it, expect } from 'vitest';
import {
	makeTable, generateRack, stepBalls, aimToVelocity, isSettled,
	encodeScore, decodeScore, BALL_R, DIFFS, type Ball,
} from './engine';
import { mulberry32 } from '../prng';

const ball = (over: Partial<Ball>): Ball => ({ x: 0, y: 0, vx: 0, vy: 0, r: BALL_R, kind: 'color', color: 0, potted: false, ...over });

describe('billard engine', () => {
	it('head-on equal-mass collision conserves momentum and transfers most speed', () => {
		const t = makeTable();
		const a = ball({ x: 60, y: 50, vx: 100, vy: 0, color: 0 });
		const b = ball({ x: 60 + 2 * BALL_R - 0.5, y: 50, vx: 0, vy: 0, color: 1 });
		const beforePx = a.vx + b.vx;
		stepBalls([a, b], t, 1 / 240);
		expect(Math.abs(a.vx + b.vx - beforePx), 'momentum x ~conserved (minus a little friction)').toBeLessThan(1);
		expect(b.vx, 'struck ball moves forward').toBeGreaterThan(80);
		expect(a.vx, 'cue ball slows a lot').toBeLessThan(20);
		expect(Math.abs(a.vy) + Math.abs(b.vy), 'no spurious sideways').toBeLessThan(1);
	});

	it('rebounds off a cushion (reverses normal velocity, keeps energy fraction)', () => {
		const t = makeTable();
		const b = ball({ x: t.w - BALL_R - 0.2, y: 50, vx: 120, vy: 0 });
		stepBalls([b], t, 1 / 120);
		expect(b.vx, 'x velocity reversed').toBeLessThan(0);
		expect(Math.abs(b.vx), 'damped').toBeLessThan(120);
	});

	it('pots a colour ball that reaches a pocket and reports its colour', () => {
		const t = makeTable();
		const p = t.pockets[1]; // top-right corner
		const b = ball({ x: p.x - 10, y: p.y + 10, vx: 120, vy: -120, color: 2 });
		const potted: number[] = [];
		for (let i = 0; i < 120 && !b.potted; i++) potted.push(...stepBalls([b], t, 1 / 60).pottedColors);
		expect(b.potted).toBe(true);
		expect(potted).toContain(2);
	});

	it('flags a scratch when the cue ball is potted', () => {
		const t = makeTable();
		const p = t.pockets[0];
		const cue = ball({ x: p.x + 10, y: p.y + 10, vx: -120, vy: -120, kind: 'cue', color: -1 });
		let scratched = false;
		for (let i = 0; i < 120 && !cue.potted; i++) scratched = stepBalls([cue], t, 1 / 60).scratched || scratched;
		expect(cue.potted).toBe(true);
		expect(scratched).toBe(true);
	});

	it('isSettled reflects whether every ball is at rest', () => {
		expect(isSettled([ball({ vx: 0, vy: 0 })])).toBe(true);
		expect(isSettled([ball({ vx: 50, vy: 0 })])).toBe(false);
		expect(isSettled([ball({ vx: 50, vy: 0, potted: true })])).toBe(true);
	});

	it('a ball eventually comes to rest from friction', () => {
		const t = makeTable();
		const b = ball({ x: 100, y: 50, vx: 40, vy: 0 });
		for (let i = 0; i < 600 && !isSettled([b]); i++) stepBalls([b], t, 1 / 60);
		expect(isSettled([b])).toBe(true);
	});

	it('aimToVelocity ignores tiny pulls, caps power, and shoots opposite the pull', () => {
		expect(aimToVelocity({ x: 1, y: 0 })).toBeNull();
		const v = aimToVelocity({ x: 30, y: 0 })!;
		expect(v.vx, 'opposite direction').toBeLessThan(0);
		const vMax = aimToVelocity({ x: 999, y: 0 })!;
		const vBig = aimToVelocity({ x: 60, y: 0 })!;
		expect(Math.hypot(vMax.vx, vMax.vy)).toBeCloseTo(Math.hypot(vBig.vx, vBig.vy), 5); // capped
	});

	it('generateRack is deterministic and places cue + N colour balls (3/4/5) with no overlap, in bounds', () => {
		const t = makeTable();
		for (const key of Object.keys(DIFFS)) {
			const n = DIFFS[key].balls;
			const a = generateRack(t, mulberry32(123), DIFFS[key]);
			const b = generateRack(t, mulberry32(123), DIFFS[key]);
			expect(a).toEqual(b);
			expect(a.length).toBe(n + 1);
			expect(a.filter((x) => x.kind === 'cue').length).toBe(1);
			expect(new Set(a.filter((x) => x.kind === 'color').map((x) => x.color))).toEqual(new Set(Array.from({ length: n }, (_, i) => i)));
			for (const ba of a) {
				expect(ba.x).toBeGreaterThanOrEqual(0);
				expect(ba.x).toBeLessThanOrEqual(t.w);
				expect(ba.y).toBeGreaterThanOrEqual(0);
				expect(ba.y).toBeLessThanOrEqual(t.h);
				for (const p of t.pockets) expect(Math.hypot(ba.x - p.x, ba.y - p.y), 'not inside a pocket mouth').toBeGreaterThan(p.r);
			}
			for (let i = 0; i < a.length; i++)
				for (let j = i + 1; j < a.length; j++)
					expect(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y), 'no overlap').toBeGreaterThan(2 * BALL_R - 0.01);
		}
	});

	it('encodeScore/decodeScore round-trips and orders by strokes then time', () => {
		expect(decodeScore(encodeScore(5, 42.3))).toEqual({ strokes: 5, timeSec: 42.3 });
		expect(encodeScore(4, 99)).toBeLessThan(encodeScore(5, 1)); // fewer strokes wins
		expect(encodeScore(5, 10)).toBeLessThan(encodeScore(5, 20)); // time breaks ties
	});
});
