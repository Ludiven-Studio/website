import { describe, it, expect } from 'vitest';
import { dartScore, applyThrow, reticleAt, encodeScore, decodeScore, DIFFS, START_SCORE } from './engine';

describe('flechettes engine', () => {
	it('scores the real dartboard geometry', () => {
		expect(dartScore(0, 0)).toMatchObject({ value: 50, ring: 'bullseye' }); // bullseye
		expect(dartScore(0, -0.07)).toMatchObject({ value: 25, ring: 'bull' }); // outer bull
		expect(dartScore(0, -0.4)).toMatchObject({ value: 20, ring: 'single', sector: 20 }); // top single
		expect(dartScore(0, -0.6)).toMatchObject({ value: 60, ring: 'triple', sector: 20 }); // triple 20
		expect(dartScore(0, -0.98)).toMatchObject({ value: 40, ring: 'double', sector: 20 }); // double 20
		expect(dartScore(0.5, 0)).toMatchObject({ sector: 6 }); // 3 o'clock = 6
		expect(dartScore(0, 0.5)).toMatchObject({ sector: 3 }); // 6 o'clock = 3
		expect(dartScore(1.2, 0)).toMatchObject({ value: 0, ring: 'miss' }); // off the board
	});

	it('501: checkout needs a double, busts otherwise', () => {
		expect(applyThrow(40, dartScore(0, -0.98))).toEqual({ remaining: 0, finished: true, bust: false }); // D20 finishes
		expect(applyThrow(100, dartScore(0, -0.6))).toEqual({ remaining: 40, finished: false, bust: false }); // T20 → 40
		// reaching 0 on a single = bust (no double)
		expect(applyThrow(20, dartScore(0, -0.4))).toMatchObject({ bust: true, finished: false }); // 20 single → 0, bust
		// overshoot / leaving 1 = bust, score unchanged
		const r = applyThrow(18, dartScore(0, -0.6)); // 60 > 18 → negative
		expect(r.bust).toBe(true); expect(r.remaining).toBe(18);
		// bullseye counts as a double finish
		expect(applyThrow(50, dartScore(0, 0))).toEqual({ remaining: 0, finished: true, bust: false });
		// bull (25) cannot finish
		expect(applyThrow(25, dartScore(0, -0.07))).toMatchObject({ bust: true });
	});

	it('reticleAt is deterministic and stays within the amplitude box', () => {
		for (const key of Object.keys(DIFFS)) {
			const d = DIFFS[key];
			for (let t = 0; t < 2000; t += 137) {
				const a = reticleAt(123, 0, d, t);
				const b = reticleAt(123, 0, d, t);
				expect(a).toEqual(b);
				expect(Math.abs(a.x)).toBeLessThanOrEqual(d.amp * 1.2 + 1e-9);
				expect(Math.abs(a.y)).toBeLessThanOrEqual(d.amp * 1.2 + 1e-9);
			}
			// different darts → different oscillation
			expect(reticleAt(123, 0, d, 500)).not.toEqual(reticleAt(123, 1, d, 500));
		}
	});

	it('encodeScore/decodeScore round-trips and orders by darts then time', () => {
		expect(decodeScore(encodeScore(9, 42.3))).toEqual({ darts: 9, timeSec: 42.3 });
		expect(encodeScore(9, 99)).toBeLessThan(encodeScore(12, 1)); // fewer darts wins
		expect(encodeScore(9, 10)).toBeLessThan(encodeScore(9, 20)); // time breaks ties
		expect(START_SCORE).toBe(501);
	});
});
