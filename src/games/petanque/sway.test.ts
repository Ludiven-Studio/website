import { describe, it, expect } from 'vitest';
import { swayAt, swayAmp, SWAY_PERIOD_S, SWAY_EASE_S, SWAY_SPEED_SHARE, SWAY_TIRE_MAX } from './sway';

const AMP = swayAmp(0.95);

describe('the aim sway', () => {
	it('draws a figure 8: two lobes a period, crossing the centre twice', () => {
		// No rotation, no ease: sample one period after the ease and before any fatigue.
		const pts: { yaw: number; speed: number }[] = [];
		for (let i = 0; i <= 240; i++) pts.push(swayAt(SWAY_EASE_S + (i / 240) * SWAY_PERIOD_S, AMP, 0, 0));
		// Heading changes sign twice (two lobes), speed four times (the crossing in the middle).
		const signs = (k: 'yaw' | 'speed'): number => pts.slice(1).filter((p, i) => Math.sign(p[k]) !== Math.sign(pts[i][k]) && p[k] !== 0).length;
		expect(signs('yaw')).toBe(2);
		expect(signs('speed')).toBe(4);
	});

	it('starts from nothing, so pressing never jumps the aim', () => {
		expect(Math.abs(swayAt(0, AMP, 1.3, 0.7).yaw)).toBe(0);
		expect(Math.abs(swayAt(0.02, AMP, 1.3, 0.7).yaw)).toBeLessThan(AMP * 0.1);
	});

	it('stays bounded, fatigue included', () => {
		for (let sec = 0; sec < 20; sec += 0.01) {
			const s = swayAt(sec, AMP, 0.4, 2.1);
			expect(Math.abs(s.yaw)).toBeLessThanOrEqual(AMP * (1 + SWAY_TIRE_MAX) + 1e-12);
			expect(Math.abs(s.speed)).toBeLessThanOrEqual(AMP * (1 + SWAY_TIRE_MAX) + 1e-12);
		}
	});

	/* "Trop violent par moment": the old sway could leap. The new one moves at most a small, fixed
	   step per frame, anywhere in a long hold. */
	it('never jerks: the step per 60 Hz frame stays small', () => {
		let worst = 0;
		let prev = swayAt(0, AMP, 0.9, 0.3);
		for (let f = 1; f < 60 * 12; f++) {
			const cur = swayAt(f / 60, AMP, 0.9, 0.3);
			worst = Math.max(worst, Math.abs(cur.yaw - prev.yaw), Math.abs(cur.speed - prev.speed) / SWAY_SPEED_SHARE);
			prev = cur;
		}
		// One 8 is 2.4 s: the fastest point of a sine of amplitude A moves 2πA/2.4 per second.
		expect(worst).toBeLessThan((2 * Math.PI * AMP * (1 + SWAY_TIRE_MAX) * 1.6) / SWAY_PERIOD_S / 60);
	});
});
