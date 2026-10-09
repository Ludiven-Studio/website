import { describe, it, expect } from 'vitest';
import { SNAKE_UNIT, ringRadii, spiralShade, chaserGap } from './motion';

describe('illusory motion helpers', () => {
	it('snake unit shares fill one unit', () => {
		expect(SNAKE_UNIT.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
	});

	it('rings shrink geometrically from the rim', () => {
		const r = ringRadii(100, 20);
		expect(r[0]).toBe(100);
		expect(r.length).toBeGreaterThan(5);
		for (let i = 1; i < r.length; i++) expect(r[i] / r[i - 1]).toBeCloseTo(r[1] / r[0]);
		expect(r[r.length - 1]).toBeGreaterThan(20);
	});

	it('spiral is pure black or white away from its edges', () => {
		const lambda = 40;
		// On the +x axis the phase is r / lambda: black on the first half of each band.
		expect(spiralShade(lambda * 2.25, 0, 3, lambda)).toBe(0);
		expect(spiralShade(lambda * 2.75, 0, 3, lambda)).toBe(1);
		for (let i = 0; i < 200; i++) {
			const v = spiralShade(Math.cos(i) * i, Math.sin(i) * i, 3, lambda);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('the chaser gap steps round every 100 ms', () => {
		expect(chaserGap(0)).toBe(0);
		expect(chaserGap(99)).toBe(0);
		expect(chaserGap(100)).toBe(1);
		expect(chaserGap(1250)).toBe(0);
	});
});
