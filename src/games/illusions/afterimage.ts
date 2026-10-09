/**
 * Afterimage ("Couleurs fantômes") — pure colour maths + the scenes.
 * The inducer is the scene with its chroma inverted in CIELAB and its lightness kept
 * (Sadowski's "Spanish castle" recipe): staring at it fatigues each cone class in the
 * complementary direction, and a luminance-matched grey version then looks coloured.
 */

export type Rgb = [number, number, number]; // 0..1, gamma-encoded sRGB
type Lab = [number, number, number];

export interface Shape {
	el: 'rect' | 'circle' | 'ellipse' | 'polygon' | 'path';
	fill: string;
	a: Record<string, number | string>;
}

export interface Scene {
	id: string;
	name: string;
	emoji: string;
	shapes: Shape[];
}

export const VIEW_W = 400;
export const VIEW_H = 250;
/** Fixation point, shared by every scene so the eyes never have to move. */
export const FIX: [number, number] = [200, 125];

export function hexToRgb(hex: string): Rgb {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: Rgb): string {
	return `#${rgb
		.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
		.join('')}`;
}

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

// D65 white.
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);

export function rgbToLab(rgb: Rgb): Lab {
	const [r, g, b] = rgb.map(toLin);
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
	const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
	const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
	const fy = f(y);
	return [116 * fy - 16, 500 * (f(x) - fy), 200 * (fy - f(z))];
}

/** Unclamped: a channel outside 0..1 means the colour is out of the sRGB gamut. */
export function labToRgb([l, a, bb]: Lab): Rgb {
	const fy = (l + 16) / 116;
	const x = fInv(fy + a / 500) * XN;
	const y = fInv(fy) * YN;
	const z = fInv(fy - bb / 200) * ZN;
	const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
	const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
	const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
	return [fromLin(r), fromLin(g), fromLin(b)];
}

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** Same lightness, chroma flipped (and boosted), pulled back into gamut along the chroma axis. */
export function complement(hex: string, boost = 1.2): string {
	const [l, a, b] = rgbToLab(hexToRgb(hex));
	let lo = 0;
	let hi = boost;
	if (inGamut(labToRgb([l, -a * hi, -b * hi]))) lo = hi;
	else
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut(labToRgb([l, -a * mid, -b * mid]))) lo = mid;
			else hi = mid;
		}
	return rgbToHex(labToRgb([l, -a * lo, -b * lo]));
}

/** Neutral grey with the same CIELAB lightness. */
export function gray(hex: string): string {
	const [l] = rgbToLab(hexToRgb(hex));
	return rgbToHex(labToRgb([l, 0, 0]));
}

const R = (x: number, y: number, width: number, height: number, fill: string): Shape => ({
	el: 'rect',
	fill,
	a: { x, y, width, height },
});
const C = (cx: number, cy: number, r: number, fill: string): Shape => ({ el: 'circle', fill, a: { cx, cy, r } });
const E = (cx: number, cy: number, rx: number, ry: number, fill: string): Shape => ({
	el: 'ellipse',
	fill,
	a: { cx, cy, rx, ry },
});
const P = (points: string, fill: string): Shape => ({ el: 'polygon', fill, a: { points } });
const D = (d: string, fill: string): Shape => ({ el: 'path', fill, a: { d } });

const flower = (x: number, y: number, petal: string): Shape[] => [
	C(x - 5, y, 5, petal),
	C(x + 5, y, 5, petal),
	C(x, y - 5, 5, petal),
	C(x, y + 5, 5, petal),
	C(x, y, 3.5, '#ffd31a'),
];

export const SCENES: Scene[] = [
	{
		id: 'paysage',
		name: 'Paysage',
		emoji: '🏡',
		shapes: [
			R(0, 0, VIEW_W, VIEW_H, '#4fb0f0'),
			C(330, 58, 34, '#ffd23f'),
			E(110, 50, 38, 14, '#ffffff'),
			E(140, 42, 26, 14, '#ffffff'),
			E(90, 205, 200, 95, '#6fbf3f'),
			E(330, 228, 230, 88, '#2f9a3a'),
			R(0, 212, VIEW_W, 38, '#3fae3f'),
			R(57, 140, 14, 62, '#7a4520'),
			C(64, 124, 32, '#1f8a2a'),
			R(150, 118, 100, 90, '#f2b84b'),
			P('138,122 200,74 262,122', '#d92b25'),
			R(188, 160, 24, 48, '#8a4a1e'),
			R(160, 138, 22, 20, '#2f7fe0'),
			R(218, 138, 22, 20, '#2f7fe0'),
			...flower(30, 226, '#e8262b'),
			...flower(110, 234, '#ff4fa3'),
			...flower(290, 230, '#e8262b'),
			...flower(350, 236, '#9b3fd6'),
			...flower(370, 214, '#ff4fa3'),
		],
	},
	{
		id: 'drapeau',
		name: 'Drapeau',
		emoji: '🚩', // flag emoji render as letters on Windows
		shapes: [R(0, 0, 134, VIEW_H, '#0055a4'), R(134, 0, 132, VIEW_H, '#ffffff'), R(266, 0, 134, VIEW_H, '#ef4135')],
	},
	{
		id: 'fruits',
		name: 'Fruits',
		emoji: '🍎',
		shapes: [
			R(0, 0, VIEW_W, VIEW_H, '#ffe9b8'),
			R(0, 192, VIEW_W, 58, '#a0582a'),
			D('M262 92 C300 100 330 128 334 170 C318 140 292 118 258 108 Z', '#ffd600'),
			C(98, 150, 13, '#7b2d8e'),
			C(118, 142, 13, '#7b2d8e'),
			C(108, 164, 13, '#7b2d8e'),
			C(128, 162, 13, '#7b2d8e'),
			C(88, 170, 13, '#7b2d8e'),
			C(150, 142, 36, '#ff8a00'),
			E(272, 150, 28, 36, '#8cc63e'),
			C(212, 132, 34, '#d81e1e'),
			E(222, 94, 11, 6, '#2e9b2e'),
			D('M60 168 L340 168 C330 214 290 232 200 232 C110 232 70 214 60 168 Z', '#2f62d4'),
		],
	},
	{
		id: 'montgolfiere',
		name: 'Montgolfière',
		emoji: '🎈',
		shapes: [
			R(0, 0, VIEW_W, VIEW_H, '#4aaeff'),
			E(80, 60, 44, 16, '#ffffff'),
			E(110, 52, 30, 15, '#ffffff'),
			E(320, 190, 40, 14, '#ffffff'),
			E(200, 262, 260, 50, '#3caa3c'),
			P('163,158 237,158 219,190 181,190', '#e5232b'),
			E(200, 102, 66, 72, '#e5232b'),
			E(200, 102, 48, 72, '#ffd21f'),
			E(200, 102, 30, 72, '#21a64a'),
			E(200, 102, 12, 72, '#7a32c8'),
			R(184, 190, 2, 12, '#5a3a1a'),
			R(214, 190, 2, 12, '#5a3a1a'),
			R(182, 200, 36, 24, '#9a5a24'),
		],
	},
];
