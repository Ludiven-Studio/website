import { describe, it, expect } from 'vitest';
import { SCENES, complement, gray, hexToRgb, rgbToLab } from './afterimage';

const lightness = (hex: string) => rgbToLab(hexToRgb(hex))[0];

describe('afterimage colours', () => {
	it('grey keeps the lightness and drops the chroma', () => {
		for (const hex of ['#ff0000', '#0055a4', '#ffd23f', '#2f9a3a']) {
			const g = gray(hex);
			const [r, gg, b] = hexToRgb(g);
			expect(r).toBeCloseTo(gg, 2);
			expect(gg).toBeCloseTo(b, 2);
			expect(Math.abs(lightness(g) - lightness(hex))).toBeLessThan(1);
		}
	});

	it('complement keeps the lightness and flips the hue', () => {
		const red = hexToRgb(complement('#ef4135'));
		expect(red[1]).toBeGreaterThan(red[0]); // red → cyan-ish
		expect(red[2]).toBeGreaterThan(red[0]);
		const blue = hexToRgb(complement('#0055a4'));
		expect(blue[0]).toBeGreaterThan(blue[2]); // blue → yellow-orange
		for (const hex of ['#ef4135', '#0055a4', '#3fae3f', '#ffd600'])
			expect(Math.abs(lightness(complement(hex)) - lightness(hex))).toBeLessThan(1.5);
	});

	it('complement twice comes back when no gamut clamp was needed', () => {
		const hex = '#8a7a6a';
		const back = complement(complement(hex, 1), 1);
		const [a, b] = [hexToRgb(hex), hexToRgb(back)];
		for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(2 / 255);
	});

	it('neutrals stay neutral, every output is a valid colour', () => {
		expect(complement('#ffffff')).toBe('#ffffff');
		expect(complement('#000000')).toBe('#000000');
		for (const s of SCENES)
			for (const sh of s.shapes) {
				expect(complement(sh.fill)).toMatch(/^#[0-9a-f]{6}$/);
				expect(gray(sh.fill)).toMatch(/^#[0-9a-f]{6}$/);
			}
	});
});
