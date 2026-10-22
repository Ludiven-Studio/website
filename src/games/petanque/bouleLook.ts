/**
 * PETANQUE — what a shop boule looks like: its engraving drawn on the sphere's UVs, its finish, its
 * inlay. A port of the Unity game's StriesTextures.cs, drawn at runtime into canvases instead of
 * being baked: equirectangular 512x256, rings are latitude lines, meridians longitude lines.
 */
import * as THREE from 'three';
import { FINISHES, type BouleLook, type Pattern } from './shop';

const W = 512, H = 256;
const HALF_WIDTH = 2.6; // px: the website's 4-5 px lines on a 256 px height
const DARK = 0.38; // albedo in a groove, as a share of the polish

const smooth = (t: number): number => t * t * (3 - 2 * t);
const ring = (y: number, v: number): number => Math.abs(y - v * H);
function meridian(x: number, u: number): number {
	const dx = Math.abs(x - u * W) % W;
	return Math.min(dx, W - dx);
}

/** 1 in the middle of a groove, 0 on the polish. */
export function groove(p: Pattern, x: number, y: number): number {
	let d = Infinity;
	const lat = (y / H - 0.5) * Math.PI;
	// Meridians converge at the poles: widen them in texture space so they keep one width on the ball.
	const merScale = 1 / Math.max(Math.cos(lat), 0.2);
	switch (p) {
		case 'une':
			d = ring(y, 0.5);
			break;
		case 'trois':
			d = Math.min(ring(y, 0.44), ring(y, 0.5), ring(y, 0.56));
			break;
		case 'cinq':
			for (let k = -2; k <= 2; k++) d = Math.min(d, ring(y, 0.5 + k * 0.05));
			break;
		case 'double':
			for (const v of [0.3, 0.34, 0.66, 0.7]) d = Math.min(d, ring(y, v));
			break;
		case 'croix':
			// The second great circle sits a quarter turn round, where the three-quarter view faces it.
			d = Math.min(ring(y, 0.5), Math.min(meridian(x, 0.25), meridian(x, 0.75)) / merScale);
			break;
		case 'meridiens':
			d = ring(y, 0.5);
			for (let k = 0; k < 6; k++) d = Math.min(d, meridian(x, k / 6) / merScale);
			break;
		case 'spirale': {
			const t = (y / H) * 3 - x / W; // three turns of a helix from pole to pole
			d = (Math.abs(t - Math.round(t)) * H) / 3;
			break;
		}
		case 'vagues': {
			const wave = Math.sin((x / W) * Math.PI * 12) * 9;
			d = Math.min(Math.abs(y - (0.5 * H + wave)), Math.abs(y - (0.38 * H - wave * 0.5)), Math.abs(y - (0.62 * H - wave * 0.5)));
			break;
		}
		case 'etoile':
			d = ring(y, 0.5);
			for (let k = 0; k < 5; k++) d = Math.min(d, meridian(x, k / 10) / merScale);
			break;
		case 'points':
			for (const v of [0.4, 0.5, 0.6]) {
				const cell = W / 24;
				const cx = (Math.floor(x / cell) + 0.5) * cell;
				const dx = ((x - cx) / Math.max(Math.cos(lat), 0.2)) * 0.5, dy = y - v * H;
				d = Math.min(d, Math.max(0, Math.sqrt(dx * dx + dy * dy) - 2.5));
			}
			break;
		case 'soleil':
			d = ring(y, 0.5);
			if (y < 0.3 * H || y > 0.7 * H) for (let k = 0; k < 12; k++) d = Math.min(d, meridian(x, k / 12) / merScale);
			d = Math.min(d, ring(y, 0.3), ring(y, 0.7));
			break;
		case 'lisse':
			break;
	}
	return Math.max(0, Math.min(1, 1 - d / HALF_WIDTH));
}

/** Rings lie round the equator, which from above is the silhouette: such a boule is turned so they
 *  cross the top, where the eye sees it. Meridians already meet at the top. */
export const tipsOver = (p: Pattern): boolean => p !== 'meridiens' && p !== 'etoile' && p !== 'soleil';

const fields = new Map<Pattern, Float32Array>();
function field(p: Pattern): Float32Array {
	let g = fields.get(p);
	if (!g) {
		g = new Float32Array(W * H);
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = smooth(groove(p, x, y));
		fields.set(p, g);
	}
	return g;
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** The polish colour and the groove colour, sRGB 0-255. */
function colours(look: BouleLook): [[number, number, number], [number, number, number]] {
	const polish = rgb(FINISHES[look.finish].color);
	const groove = look.inlay !== undefined ? rgb(look.inlay) : polish.map((v) => v * DARK) as [number, number, number];
	return [polish, groove];
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

const lookKey = (l: BouleLook): string => `${l.finish}|${l.pattern}|${l.inlay ?? ''}`;

/* Shared for the page's life: a handful of looks, a few hundred KB of GPU each at most. */
const albedos = new Map<string, THREE.CanvasTexture>();
const heights = new Map<Pattern, THREE.CanvasTexture>();

/** The look's own colours: its finish on the polish, its inlay (or a darker finish) in the grooves.
 *  Worn on a white base colour, so an inlay can be brighter than the steel. */
export function albedoTexture(look: BouleLook): THREE.CanvasTexture {
	const key = lookKey(look);
	let tex = albedos.get(key);
	if (tex) return tex;
	const [c, g] = canvasOf(W, H);
	const img = g.createImageData(W, H);
	const f = field(look.pattern);
	const [p, q] = colours(look);
	for (let i = 0; i < W * H; i++) {
		const k = f[i];
		img.data[i * 4] = p[0] + (q[0] - p[0]) * k;
		img.data[i * 4 + 1] = p[1] + (q[1] - p[1]) * k;
		img.data[i * 4 + 2] = p[2] + (q[2] - p[2]) * k;
		img.data[i * 4 + 3] = 255;
	}
	g.putImageData(img, 0, 0);
	tex = new THREE.CanvasTexture(c);
	tex.wrapS = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	albedos.set(key, tex);
	return tex;
}

/** The grooves cut in: white polish, black groove. Feeds the bump and, through the shader patch in
 *  render3d, the roughness (a groove is dull). */
export function heightTexture(p: Pattern): THREE.CanvasTexture {
	let tex = heights.get(p);
	if (tex) return tex;
	const [c, g] = canvasOf(W, H);
	const img = g.createImageData(W, H);
	const f = field(p);
	for (let i = 0; i < W * H; i++) {
		const v = 255 * (1 - f[i]);
		img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
		img.data[i * 4 + 3] = 255;
	}
	g.putImageData(img, 0, 0);
	tex = new THREE.CanvasTexture(c);
	tex.wrapS = THREE.RepeatWrapping;
	heights.set(p, tex);
	return tex;
}

const previews = new Map<string, string>();

/** The look as the shop row shows it, three-quarter view, as a data URL: drawn by hand (no WebGL
 *  context per row), the app's WritePreview. */
export function previewUrl(look: BouleLook, size = 96): string {
	const key = `${lookKey(look)}|${size}`;
	const hit = previews.get(key);
	if (hit) return hit;
	const fin = FINISHES[look.finish];
	const [p, q] = colours(look);
	const [c, g] = canvasOf(size, size);
	const img = g.createImageData(size, size);
	const light = new THREE.Vector3(-0.45, 0.6, 0.65).normalize();
	// The pole axis leans right and a little towards the eye, so rings cross the face as ellipses.
	const tip = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.85, 0.35, 0.4).normalize()).invert();
	const smoothness = 1 - fin.roughness;
	const shine = 8 + (48 - 8) * smoothness;
	const hi = [255, 255, 255].map((w, i) => w + (p[i] - w) * fin.metalness * 0.5);
	const n = new THREE.Vector3(), o = new THREE.Vector3(), r = new THREE.Vector3();
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const nx = ((x + 0.5) / size) * 2 - 1, ny = 1 - ((y + 0.5) / size) * 2;
			const r2 = nx * nx + ny * ny;
			const i = (y * size + x) * 4;
			if (r2 >= 1) { img.data[i + 3] = 0; continue; }
			n.set(nx, ny, Math.sqrt(1 - r2));
			o.copy(n).applyQuaternion(tip);
			const u = Math.atan2(o.z, o.x) / (2 * Math.PI) + 0.5;
			const v = Math.asin(Math.max(-1, Math.min(1, o.y))) / Math.PI + 0.5;
			const gr = smooth(groove(look.pattern, u * W, v * H));
			const diff = Math.max(0, n.dot(light));
			r.copy(light).negate().reflect(n);
			const spec = Math.pow(Math.max(0, r.z), shine) * (1 - gr) * (0.3 + 0.5 * smoothness);
			for (let k = 0; k < 3; k++) {
				const alb = p[k] + (q[k] - p[k]) * gr;
				img.data[i + k] = Math.min(255, alb * (0.35 + 0.65 * diff) + hi[k] * spec);
			}
			img.data[i + 3] = 255 * Math.max(0, Math.min(1, (1 - Math.sqrt(r2)) * size * 0.5));
		}
	}
	g.putImageData(img, 0, 0);
	const url = c.toDataURL('image/png');
	previews.set(key, url);
	return url;
}
