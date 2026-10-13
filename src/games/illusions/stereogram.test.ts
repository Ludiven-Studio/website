import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { SUBJECTS, choicesFor, insideDistance, makeTile, modeSeparation, separation, stereogram } from './stereogram';

const W = 240;
const H = 40;
const FAR = 48;

/** Pixel equality of two RGB triplets in an RGBA buffer. */
const same = (px: Uint8ClampedArray, a: number, b: number) =>
	px[a * 4] === px[b * 4] && px[a * 4 + 1] === px[b * 4 + 1] && px[a * 4 + 2] === px[b * 4 + 2];

describe('stereogram', () => {
	const tile = makeTile(FAR, H, [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]], mulberry32(3));

	it('a flat background repeats with the far period', () => {
		const px = stereogram(new Float32Array(W * H), W, H, tile, { far: FAR, mode: 'parallel' });
		for (let y = 0; y < H; y++)
			for (let x = 0; x + FAR < W; x++) expect(same(px, y * W + x, y * W + x + FAR)).toBe(true);
	});

	it('a raised square links its pixels at the nearer separation', () => {
		const depth = new Float32Array(W * H);
		for (let y = 10; y < 30; y++) for (let x = 100; x < 140; x++) depth[y * W + x] = 1;
		const s = Math.round(separation(1, FAR));
		expect(s).toBeLessThan(FAR);
		const px = stereogram(depth, W, H, tile, { far: FAR, mode: 'parallel' });
		const y = 20;
		const x = 120; // centre of the square: both eyes see it
		const left = x - ((s + (s & y & 1)) >> 1);
		expect(same(px, y * W + left, y * W + left + s)).toBe(true);
	});

	it('crossed eyes flip the depth: the shape gets the wider period', () => {
		expect(modeSeparation(1, FAR, 'cross')).toBeGreaterThan(modeSeparation(0, FAR, 'cross'));
		expect(modeSeparation(1, FAR, 'parallel')).toBeLessThan(modeSeparation(0, FAR, 'parallel'));
	});

	it('inside distance grows towards the middle of a shape', () => {
		const w = 21;
		const mask = new Uint8Array(w * w).fill(1);
		const d = insideDistance(mask, w, w);
		expect(d[10 * w + 10]).toBeGreaterThan(d[10 * w + 2]);
		expect(d[10 * w + 0]).toBeCloseTo(1, 0);
	});

	it('choices hold the answer and three distinct others', () => {
		for (let a = 0; a < SUBJECTS.length; a++) {
			const c = choicesFor(a, mulberry32(a + 1));
			expect(c).toHaveLength(4);
			expect(c).toContain(a);
			expect(new Set(c).size).toBe(4);
		}
	});
});
