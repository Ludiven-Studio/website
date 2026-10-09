/**
 * Autostereogram engine (pure). Thimbleby, Inglis & Witten 1994 "Displaying 3D images:
 * algorithms for single-image random-dot stereograms", with a colour texture instead of
 * random dots. Depth z in [0, 1]: 0 = far plane (background), 1 = nearest.
 */

import type { Rng } from '../prng';

export type ViewMode = 'cross' | 'parallel';

export interface Tile {
	data: Uint8ClampedArray; // RGBA
	w: number;
	h: number;
}

export interface StereoOpts {
	/** Separation of the far plane, in pixels: the pattern period of the background. */
	far: number;
	/** Depth of field. 1/3 keeps the near plane at 80 % of the far period. */
	mu?: number;
	mode?: ViewMode;
}

export interface Subject {
	glyph: string;
	label: string;
	/** With its article, for "c'était …". */
	name: string;
}

export const MU = 1 / 3;

/** Parallel-viewing separation of depth z (E = 2 × far). */
export const separation = (z: number, far: number, mu = MU) => (far * 2 * (1 - mu * z)) / (2 - mu * z);

/** Separation of a depth in the given mode. Crossed eyes read depth backwards, so it is flipped. */
export const modeSeparation = (z: number, far: number, mode: ViewMode, mu = MU) =>
	separation(mode === 'cross' ? 1 - z : z, far, mu);

/** Render the stereogram into a fresh RGBA buffer (w × h). */
export function stereogram(depth: Float32Array, w: number, h: number, tile: Tile, opts: StereoOpts): Uint8ClampedArray<ArrayBuffer> {
	const mu = opts.mu ?? MU;
	const cross = opts.mode === 'cross';
	const far = opts.far;
	const E = 2 * far;
	const out = new Uint8ClampedArray(w * h * 4);
	const same = new Int32Array(w);
	const row = new Float32Array(w);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			same[x] = x;
			row[x] = cross ? 1 - depth[y * w + x] : depth[y * w + x];
		}
		for (let x = 0; x < w; x++) {
			const z = row[x];
			const s = Math.round(separation(z, far, mu));
			let left = x - ((s + (s & y & 1)) >> 1);
			let right = left + s;
			if (left < 0 || right >= w) continue;
			// Hidden-surface removal only holds for parallel geometry; crossed eyes skip it.
			if (!cross) {
				let visible = true;
				let zt = z;
				for (let t = 1; visible && zt < 1; t++) {
					zt = z + (2 * (2 - mu * z) * t) / (mu * E);
					visible = (x - t < 0 || row[x - t] < zt) && (x + t >= w || row[x + t] < zt);
				}
				if (!visible) continue;
			}
			for (let l = same[left]; l !== left && l !== right; l = same[left]) {
				if (l < right) left = l;
				else {
					same[left] = right;
					left = right;
					right = l;
				}
			}
			same[left] = right;
		}
		const ty = (y % tile.h) * tile.w;
		for (let x = w - 1; x >= 0; x--) {
			const o = (y * w + x) * 4;
			const src = same[x] === x ? (ty + (x % tile.w)) * 4 : (y * w + same[x]) * 4;
			const buf = same[x] === x ? tile.data : out;
			out[o] = buf[src];
			out[o + 1] = buf[src + 1];
			out[o + 2] = buf[src + 2];
			out[o + 3] = 255;
		}
	}
	return out;
}

export const PALETTES: [number, number, number][][] = [
	[[11, 61, 46], [31, 122, 77], [111, 191, 74], [200, 230, 90], [242, 212, 61]], // jungle
	[[6, 33, 61], [11, 79, 138], [30, 144, 200], [111, 211, 232], [232, 247, 255]], // ocean
	[[43, 15, 58], [122, 31, 92], [217, 67, 78], [242, 143, 59], [255, 213, 107]], // sunset
	[[255, 95, 162], [255, 209, 102], [6, 214, 160], [17, 138, 178], [131, 56, 236]], // candy
	[[59, 31, 14], [138, 59, 18], [200, 98, 27], [232, 163, 61], [246, 215, 123]], // autumn
];

/**
 * A horizontally seamless texture: soft colour waves under many small dots. The fine
 * dots are what the eyes lock onto; a smooth texture would give them nothing to fuse.
 */
export function makeTile(w: number, h: number, palette: [number, number, number][], rng: Rng, scale = 1): Tile {
	const data = new Uint8ClampedArray(w * h * 4);
	const k = palette.length;
	const p1 = rng() * Math.PI * 2;
	const p2 = rng() * Math.PI * 2;
	const fy = (2 + rng() * 3) / h;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			// Whole number of waves across the tile keeps it seamless.
			const u = Math.sin((x / w) * Math.PI * 2 + p1 + Math.sin(y * fy * Math.PI * 2 + p2) * 1.5);
			const t = ((u + 1) / 2) * (k - 1) * 0.6;
			const i = Math.min(k - 2, Math.floor(t));
			const f = t - i;
			const o = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) data[o + c] = palette[i][c] * (1 - f) + palette[i + 1][c] * f;
			data[o + 3] = 255;
		}
	const dots = Math.round((w * h) / (34 * scale * scale));
	for (let n = 0; n < dots; n++) {
		const cx = rng() * w;
		const cy = rng() * h;
		const r = (1.2 + rng() * 2.8) * scale;
		const col = palette[Math.floor(rng() * k)];
		const x0 = Math.floor(cx - r - 1);
		const x1 = Math.ceil(cx + r + 1);
		for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++)
			for (let xx = x0; xx <= x1; xx++) {
				const d = Math.hypot(xx + 0.5 - cx, y + 0.5 - cy);
				const a = Math.max(0, Math.min(1, r - d + 0.5));
				if (!a) continue;
				const o = (y * w + (((xx % w) + w) % w)) * 4;
				for (let c = 0; c < 3; c++) data[o + c] = data[o + c] * (1 - a) + col[c] * a;
			}
	}
	return { data, w, h };
}

/** Distance (px) from each inside pixel to the nearest outside one, chamfer 3-4. */
export function insideDistance(mask: Uint8Array, w: number, h: number): Float32Array {
	const INF = 1e9;
	const d = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
	const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (!d[i]) continue;
			d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
		}
	for (let y = h - 1; y >= 0; y--)
		for (let x = w - 1; x >= 0; x--) {
			const i = y * w + x;
			if (!d[i]) continue;
			d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
		}
	for (let i = 0; i < w * h; i++) d[i] /= 3;
	return d;
}

/**
 * Depth of a shape: a sharp step off the background, then a rounded dome of radius
 * `radius`, plus a little relief from the glyph's own shading so inner lines (an eye,
 * a shell's spiral) show up as grooves.
 */
export function shapeDepth(mask: Uint8Array, lum: Float32Array, w: number, h: number, radius: number): Float32Array {
	const dist = insideDistance(mask, w, h);
	let sum = 0;
	let count = 0;
	for (let i = 0; i < w * h; i++) if (mask[i]) { sum += lum[i]; count++; }
	const mean = count ? sum / count : 0;
	const z = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		if (!mask[i]) continue;
		const t = Math.min(1, dist[i] / radius);
		const dome = 1 - (1 - t) * (1 - t);
		z[i] = Math.max(0.3, Math.min(1, 0.5 + 0.4 * dome + 0.25 * (lum[i] - mean)));
	}
	return z;
}

export const SUBJECTS: Subject[] = [
	{ glyph: '❤️', label: 'Cœur', name: 'un cœur' },
	{ glyph: '🐘', label: 'Éléphant', name: 'un éléphant' },
	{ glyph: '🐬', label: 'Dauphin', name: 'un dauphin' },
	{ glyph: '🦋', label: 'Papillon', name: 'un papillon' },
	{ glyph: '🐌', label: 'Escargot', name: 'un escargot' },
	{ glyph: '🐢', label: 'Tortue', name: 'une tortue' },
	{ glyph: '🐓', label: 'Coq', name: 'un coq' },
	{ glyph: '🐇', label: 'Lapin', name: 'un lapin' },
	{ glyph: '🦕', label: 'Dinosaure', name: 'un dinosaure' },
	{ glyph: '🐈', label: 'Chat', name: 'un chat' },
	{ glyph: '🐟', label: 'Poisson', name: 'un poisson' },
	{ glyph: '🦀', label: 'Crabe', name: 'un crabe' },
	{ glyph: '🐙', label: 'Pieuvre', name: 'une pieuvre' },
	{ glyph: '⭐', label: 'Étoile', name: 'une étoile' },
	{ glyph: '🍎', label: 'Pomme', name: 'une pomme' },
	{ glyph: '🏠', label: 'Maison', name: 'une maison' },
	{ glyph: '⛵', label: 'Voilier', name: 'un voilier' },
	{ glyph: '🔑', label: 'Clé', name: 'une clé' },
	{ glyph: '🎸', label: 'Guitare', name: 'une guitare' },
	{ glyph: '✈️', label: 'Avion', name: 'un avion' },
];

export function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** The answer plus three other labels, shuffled. */
export function choicesFor(answer: number, rng: Rng, count = 4): number[] {
	const others = shuffle(SUBJECTS.map((_, i) => i).filter((i) => i !== answer), rng).slice(0, count - 1);
	return shuffle([answer, ...others], rng);
}
