import { describe, it, expect } from 'vitest';
import {
	ORDER,
	VIEW_W,
	VIEW_H,
	MIN_RATIO,
	MAX_RATIO,
	figure,
	errorPct,
	errorText,
	randomStart,
	meanAbsError,
	verdict,
	shuffled,
	type Shape,
} from './measure';
import { mulberry32 } from '../prng';

const size = (s: Shape) => (s.type === 'line' ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) : s.r);
const only = (shapes: Shape[], role: Shape['role']) => {
	const found = shapes.filter((s) => s.role === role);
	expect(found).toHaveLength(1);
	return found[0];
};

describe('oeil-mesureur geometry', () => {
	for (const kind of ORDER) {
		it(`${kind}: the target is ratio × the reference`, () => {
			for (const ratio of [MIN_RATIO, 0.83, 1, 1.21, MAX_RATIO]) {
				const { shapes } = figure(kind, ratio);
				const ref = size(only(shapes, 'reference'));
				const tgt = size(only(shapes, 'target'));
				expect(tgt / ref).toBeCloseTo(ratio, 9);
			}
		});

		it(`${kind}: stays inside the viewBox over the whole slider range`, () => {
			for (const ratio of [MIN_RATIO, 1, MAX_RATIO]) {
				const { shapes, guides } = figure(kind, ratio);
				for (const s of [...shapes, ...guides]) {
					const [x0, x1, y0, y1] =
						s.type === 'line'
							? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]
							: [s.cx - s.r, s.cx + s.r, s.cy - s.r, s.cy + s.r];
					expect(x0).toBeGreaterThanOrEqual(0);
					expect(y0).toBeGreaterThanOrEqual(0);
					expect(x1).toBeLessThanOrEqual(VIEW_W);
					expect(y1).toBeLessThanOrEqual(VIEW_H);
				}
			}
		});

		it(`${kind}: the guide shows the reference size at the target`, () => {
			const { shapes, guides } = figure(kind, 1.3);
			const ref = size(only(shapes, 'reference'));
			const circles = guides.filter((g) => g.type === 'circle');
			if (circles.length) {
				expect(size(circles[0])).toBeCloseTo(ref, 9);
				return;
			}
			// Line guides either mark the reference's two ends or stand its length upright.
			const [a, b] = guides;
			if (a.type !== 'line' || b.type !== 'line') throw new Error('line guides');
			const span = a.x1 === a.x2 && b.x1 === b.x2 ? Math.abs(b.x1 - a.x1) : size(a);
			expect(span).toBeCloseTo(ref, 9);
		});
	}

	it('ponzo: the adjusted bar never crosses the rails', () => {
		const { shapes } = figure('ponzo', MAX_RATIO);
		const bar = only(shapes, 'target');
		if (bar.type !== 'line') throw new Error('bar');
		const rail = shapes.find((s) => s.role === 'inducer')!;
		if (rail.type !== 'line') throw new Error('rail');
		const t = (bar.y1 - rail.y1) / (rail.y2 - rail.y1);
		const railX = rail.x1 + t * (rail.x2 - rail.x1);
		expect(bar.x1).toBeGreaterThan(railX);
	});
});

describe('oeil-mesureur scoring', () => {
	it('signs the error', () => {
		expect(errorPct(0.88)).toBeCloseTo(-12, 9);
		expect(errorPct(1.05)).toBeCloseTo(5, 9);
	});

	it('words the error by dimension and direction', () => {
		expect(errorText('muller-lyer', 0.88)).toBe('Tu as réglé le trait du bas 12,0 % trop court.');
		expect(errorText('ponzo', 1.1)).toBe('Tu as réglé le trait du haut 10,0 % trop long.');
		expect(errorText('ebbinghaus', 0.95)).toBe('Tu as réglé le disque de droite 5,0 % trop petit.');
		expect(errorText('delboeuf', 1.2)).toContain('trop grand');
		expect(errorText('vertical-horizontal', 1.004)).toContain('Pile poil');
	});

	it('starts 20 to 30 % off, inside the slider range', () => {
		const rng = mulberry32(7);
		let below = 0;
		for (let i = 0; i < 500; i++) {
			const s = randomStart(rng);
			const off = Math.abs(s - 1);
			expect(off).toBeGreaterThanOrEqual(0.2);
			expect(off).toBeLessThanOrEqual(0.3);
			expect(s).toBeGreaterThanOrEqual(MIN_RATIO);
			expect(s).toBeLessThanOrEqual(MAX_RATIO);
			if (s < 1) below++;
		}
		expect(below).toBeGreaterThan(150);
		expect(below).toBeLessThan(350);
	});

	it('averages absolute errors and grades them', () => {
		expect(meanAbsError([0.9, 1.1, 1])).toBeCloseTo(20 / 3, 9);
		expect(verdict(2).title).toBe('Œil de lynx');
		expect(verdict(5).title).toBe('Œil d\'aigle');
		expect(verdict(8).title).toBe('Œil de chouette');
		expect(verdict(12).title).toBe('Œil de cocotte');
		expect(verdict(30).title).toBe('Œil de taupe');
	});

	it('shuffles without losing a round', () => {
		expect([...shuffled(ORDER, mulberry32(3))].sort()).toEqual([...ORDER].sort());
	});
});
