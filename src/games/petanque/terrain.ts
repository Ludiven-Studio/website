/**
 * PETANQUE — the ground. A seeded heightfield plus the pebbles lying on it.
 *
 * Everything here is a pure function of (position, seed): no stateful PRNG is used while
 * stepping the physics, so two lockstep peers replaying the same throws cannot diverge.
 * Distances are metres, the pitch spans x in [0, W] and y in [0, L].
 */

export const PITCH_W = 4; // across
export const PITCH_L = 15; // along the throwing axis
export const CELL = 0.05; // heightfield spacing

export interface Surface {
	id: SurfaceId;
	label: string;
	rollFriction: number; // µ, rolling deceleration = µ·g
	restitution: number; // normal energy kept on a ground bounce
	impactFriction: number; // tangential speed kept on a ground bounce
	scatter: number; // rad of lateral deviation per m/s of impact speed
	pebbles: number;
	pebbleR: [number, number];
	grit: number; // micro-gravel under a rolling boule, felt on uneven pitches only
}

export type SurfaceId = 'terre-battue' | 'gravier-fin' | 'gravier-gros' | 'sable';

/** Starting values. The real numbers come out of scripts/petanque-tune.mts (measurement A). */
export const SURFACES: Record<SurfaceId, Surface> = {
	'terre-battue': { id: 'terre-battue', label: 'Terre battue', rollFriction: 0.26, restitution: 0.30, impactFriction: 0.72, scatter: 0.0025, pebbles: 110, pebbleR: [0.003, 0.007], grit: 0.5 },
	'gravier-fin': { id: 'gravier-fin', label: 'Gravier fin', rollFriction: 0.20, restitution: 0.22, impactFriction: 0.62, scatter: 0.004, pebbles: 900, pebbleR: [0.006, 0.014], grit: 1 },
	'gravier-gros': { id: 'gravier-gros', label: 'Gravier gros', rollFriction: 0.27, restitution: 0.18, impactFriction: 0.54, scatter: 0.016, pebbles: 1500, pebbleR: [0.010, 0.024], grit: 1.6 },
	sable: { id: 'sable', label: 'Sable', rollFriction: 0.85, restitution: 0.06, impactFriction: 0.30, scatter: 0.003, pebbles: 120, pebbleR: [0.004, 0.009], grit: 0.3 },
};

/* An uneven pitch lays two other grounds over its own in patches: loose coarse gravel (gathering at
   the planks and the far ends), bald packed earth, soft sand. */
const PATCHES: Record<SurfaceId, [SurfaceId, SurfaceId]> = {
	'terre-battue': ['gravier-gros', 'sable'],
	'gravier-fin': ['gravier-gros', 'sable'],
	'gravier-gros': ['terre-battue', 'sable'],
	sable: ['terre-battue', 'gravier-gros'],
};

export const SURFACE_IDS: SurfaceId[] = ['terre-battue', 'gravier-fin', 'gravier-gros', 'sable'];

export interface Pebble {
	x: number;
	y: number;
	r: number;
}

export interface Terrain {
	surface: Surface;
	amp: number; // peak height deviation of the noise, metres
	nx: number; // node counts (cells + 1)
	ny: number;
	hs: Float32Array; // nx * ny heights
	pebbles: Pebble[];
	pgCell: number; // pebble grid spacing
	pgNx: number;
	pgNy: number;
	pg: number[][]; // pebble indices per grid cell
	seed: number;
	/* Uneven pitches only (a difficulty was given); absent, the pitch is the website's even one. */
	rough?: number; // the difficulty as 0..1
	patches?: [Surface, Surface];
	pw?: Float32Array; // patch weights, two per height node
}

/** What the ground is like at one spot: its own surface blended with the patches lying there. */
export interface GroundSample {
	rollFriction: number;
	restitution: number;
	impactFriction: number;
	scatter: number;
	grit: number;
}

/* ---------- deterministic noise (pattern copied from components/terrainNoise.ts) ---------- */

function hash2(ix: number, iy: number, seed: number): number {
	let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
	const x0 = Math.floor(x), y0 = Math.floor(y);
	const fx = x - x0, fy = y - y0;
	const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
	const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
	const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
	return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, y: number, seed: number): number {
	let amp = 1, freq = 1, sum = 0, norm = 0;
	for (let o = 0; o < 3; o++) {
		sum += amp * vnoise(x * freq, y * freq, seed + o * 101);
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
}

/** Unit value keyed on a position and a salt. Used for per-impact grain deviation. */
export const noiseUnit = (x: number, y: number, seed: number): number =>
	hash2(Math.round(x * 1000), Math.round(y * 1000), seed);

/** Unit value keyed on a counter. The grain is random-looking but replays identically. */
export const hashN = (n: number, seed: number): number => hash2(n, 0x9e37, seed);

/* ---------- generation ---------- */

// Two scales, and the split matters. High-frequency bumps cancel out over a 2 m roll, so a
// grain-only heightfield leaves `amp` a dead knob (measured: drift identical at 1.2 and 5.5 cm).
// The broad undulations are what actually carry a boule off line, like real bosses and creux.
const MACRO_NF = 0.15; // ~6.7 m wavelength
const MICRO_NF = 0.9; // ~1.1 m, then halved per octave
const MICRO_SHARE = 0.3;

export interface TerrainOpts {
	slope?: number; // override the global tilt (0 = dead level); default 0.5-1.5 %
	noPebbles?: boolean; // measurement control only
	/** 0-100, how far the pitch is from an even, raked ground: tilt, bosses and craters, patches of
	 *  other grounds, stones, micro-gravel. Absent = the even pitch every website mode plays on. */
	difficulty?: number;
}

/** Relief amplitude for a difficulty, to the millimetre: 1 cm for a raked pitch, 6.5 at 100. */
export const ampFor = (difficulty: number): number =>
	Math.round((0.010 + (0.055 * clamp(difficulty, 0, 100)) / 100) * 1000) / 1000;

export function makeTerrain(seed: number, surface: Surface, amp: number, opts: TerrainOpts = {}): Terrain {
	const nx = Math.round(PITCH_W / CELL) + 1;
	const ny = Math.round(PITCH_L / CELL) + 1;
	const hs = new Float32Array(nx * ny);
	const rough = opts.difficulty === undefined ? undefined : clamp(opts.difficulty, 0, 100) / 100;

	// The faux plat: one gentle global tilt on top of the noise; steeper on a rougher pitch.
	const slopeDir = hash2(7, 13, seed) * Math.PI * 2;
	const slope = opts.slope ?? (rough === undefined
		? 0.005 + hash2(11, 3, seed) * 0.010
		: (0.002 + 0.016 * rough) * (0.6 + 0.8 * hash2(11, 3, seed)));
	const sx = Math.cos(slopeDir) * slope, sy = Math.sin(slopeDir) * slope;

	for (let j = 0; j < ny; j++) {
		const y = j * CELL;
		for (let i = 0; i < nx; i++) {
			const x = i * CELL;
			const macro = (vnoise(x * MACRO_NF, y * MACRO_NF, seed) - 0.5) * 2;
			const micro = (fbm(x * MICRO_NF, y * MICRO_NF, seed + 7717) - 0.5) * 2;
			hs[j * nx + i] = amp * (macro * (1 - MICRO_SHARE) + micro * MICRO_SHARE) + x * sx + y * sy;
		}
	}

	const t: Terrain = {
		surface, amp, nx, ny, hs, seed,
		pebbles: [], pgCell: 0.25, pgNx: 0, pgNy: 0, pg: [],
	};
	if (rough === undefined) {
		scatterPebbles(t, opts.noPebbles ? 0 : t.surface.pebbles);
		return t;
	}
	t.rough = rough;
	t.patches = [SURFACES[PATCHES[surface.id][0]], SURFACES[PATCHES[surface.id][1]]];
	shapeRelief(t, rough);
	t.pw = layPatches(t, rough);
	scatterUneven(t, opts.noPebbles ? 0 : 1);
	return t;
}

/* Mini dénivelés: a few broad bosses and creux, then the small craters plombées leave where boules
   come down, between 3.5 and 11.5 m, thickest mid-pitch. */
function shapeRelief(t: Terrain, k: number): void {
	const nb = Math.round(16 * k);
	for (let i = 0; i < nb; i++) {
		const r = 0.3 + 0.5 * hash2(i, 0xb3, t.seed);
		const h = (0.004 + 0.016 * k) * (0.5 + 0.5 * hash2(i, 0xb4, t.seed)) * (hash2(i, 0xb5, t.seed) < 0.5 ? -1 : 1);
		dent(t, hash2(i, 0xb1, t.seed) * PITCH_W, hash2(i, 0xb2, t.seed) * PITCH_L, r, h);
	}
	const nc = Math.round(40 * k);
	for (let i = 0; i < nc; i++) {
		const x = 0.5 + 3 * hash2(i, 0xc1, t.seed);
		const y = 3.5 + 4 * (hash2(i, 0xc2, t.seed) + hash2(i, 0xc3, t.seed));
		const r = 0.08 + 0.06 * hash2(i, 0xc4, t.seed);
		dent(t, x, y, r, -(0.003 + 0.008 * k) * (0.6 + 0.4 * hash2(i, 0xc5, t.seed)));
	}
}

/** A smooth bump of height h (negative: a hollow) and radius r round (cx, cy). */
function dent(t: Terrain, cx: number, cy: number, r: number, h: number): void {
	const i0 = Math.max(0, Math.floor((cx - r) / CELL)), i1 = Math.min(t.nx - 1, Math.ceil((cx + r) / CELL));
	const j0 = Math.max(0, Math.floor((cy - r) / CELL)), j1 = Math.min(t.ny - 1, Math.ceil((cy + r) / CELL));
	const r2 = r * r;
	for (let j = j0; j <= j1; j++)
		for (let i = i0; i <= i1; i++) {
			const dx = i * CELL - cx, dy = j * CELL - cy;
			const q = 1 - (dx * dx + dy * dy) / r2;
			if (q > 0) t.hs[j * t.nx + i] += h * q * q;
		}
}

/* One noise layer per patch ground, cut at a level that lets more through as the difficulty rises,
   with soft edges. Two patches never stack past a full share. */
const PATCH_NF = 0.55; // ~1.8 m blobs
const PATCH_NF2 = 1.6; // their ragged edge
const PATCH_SOFT = 0.07;

function layPatches(t: Terrain, k: number): Float32Array {
	const pw = new Float32Array(t.nx * t.ny * 2);
	// Squared: a sand patch on clay already changes the run a lot, so they stay rare below 40.
	const cut = 0.92 - 0.4 * k * k;
	for (let j = 0; j < t.ny; j++) {
		const y = j * CELL;
		for (let i = 0; i < t.nx; i++) {
			const x = i * CELL;
			let wa = 0, wb = 0;
			for (let l = 0; l < 2; l++) {
				const s = t.seed + 3001 + l * 977;
				const f = 0.65 * vnoise(x * PATCH_NF, y * PATCH_NF, s) + 0.35 * vnoise(x * PATCH_NF2, y * PATCH_NF2, s + 53)
					+ (t.patches![l].id === 'gravier-gros' ? 0.2 * k * toPlanks(x, y) : 0);
				const u = clamp((f - cut) / PATCH_SOFT, 0, 1);
				if (l === 0) wa = u * u * (3 - 2 * u); else wb = u * u * (3 - 2 * u);
			}
			const sum = wa + wb;
			if (sum > 1) { wa /= sum; wb /= sum; }
			pw[(j * t.nx + i) * 2] = wa;
			pw[(j * t.nx + i) * 2 + 1] = wb;
		}
	}
	return pw;
}

/** 1 against the planks and the far ends, where boules push loose stones; 0 a metre or two in. */
function toPlanks(x: number, y: number): number {
	const side = 1 - Math.min(x, PITCH_W - x) / 0.9;
	const end = 1 - Math.min(y, PITCH_L - y) / 1.8;
	return clamp(side > end ? side : end, 0, 1);
}

/* Stones: each ground's own, fewer on a raked pitch, then loose coarse stones strewn everywhere as
   the pitch gets rougher, the lane included. */
const LOOSE = 1000; // at full difficulty, growing as its square

function scatterUneven(t: Terrain, on: number): void {
	const [a, b] = t.patches!;
	const top = Math.max(t.surface.pebbles, a.pebbles, b.pebbles);
	const k = t.rough!;
	const n = Math.round(top * (0.4 + 0.6 * k) * on);
	const w = { a: 0, b: 0 };
	for (let i = 0; i < n; i++) {
		const x = hash2(i, 0x51ed, t.seed) * PITCH_W;
		const y = hash2(i, 0x2f9b, t.seed) * PITCH_L;
		patchAt(t, x, y, w);
		const own = 1 - w.a - w.b;
		if (hash2(i, 0x3d7a, t.seed) * top >= t.surface.pebbles * own + a.pebbles * w.a + b.pebbles * w.b) continue;
		const pick = hash2(i, 0x6b2f, t.seed);
		const src = pick < w.a ? a : pick < w.a + w.b ? b : t.surface;
		t.pebbles.push({ x, y, r: src.pebbleR[0] + hash2(i, 0x7c1d, t.seed) * (src.pebbleR[1] - src.pebbleR[0]) });
	}
	const loose = Math.round(LOOSE * k * k * on);
	const [lo, hi] = SURFACES['gravier-gros'].pebbleR;
	for (let i = 0; i < loose; i++) {
		const x = hash2(i, 0x1a3f, t.seed) * PITCH_W;
		const y = hash2(i, 0x4e6b, t.seed) * PITCH_L;
		t.pebbles.push({ x, y, r: lo + hash2(i, 0x5c71, t.seed) * (hi - lo) });
	}
	indexPebbles(t);
}

function scatterPebbles(t: Terrain, n: number): void {
	const { pebbleR } = t.surface;
	for (let k = 0; k < n; k++) {
		const x = hash2(k, 0x51ed, t.seed) * PITCH_W;
		const y = hash2(k, 0x2f9b, t.seed) * PITCH_L;
		const r = pebbleR[0] + hash2(k, 0x7c1d, t.seed) * (pebbleR[1] - pebbleR[0]);
		t.pebbles.push({ x, y, r });
	}
	indexPebbles(t);
}

function indexPebbles(t: Terrain): void {
	t.pgNx = Math.ceil(PITCH_W / t.pgCell);
	t.pgNy = Math.ceil(PITCH_L / t.pgCell);
	t.pg = Array.from({ length: t.pgNx * t.pgNy }, () => [] as number[]);
	for (let k = 0; k < t.pebbles.length; k++) {
		const p = t.pebbles[k];
		const gi = Math.min(t.pgNx - 1, Math.floor(p.x / t.pgCell));
		const gj = Math.min(t.pgNy - 1, Math.floor(p.y / t.pgCell));
		t.pg[gj * t.pgNx + gi].push(k);
	}
}

/* ---------- sampling ---------- */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Bilinear height. Outside the pitch the edge value is extended. */
export function heightAt(t: Terrain, x: number, y: number): number {
	const gx = clamp(x / CELL, 0, t.nx - 1.0001);
	const gy = clamp(y / CELL, 0, t.ny - 1.0001);
	const i = Math.floor(gx), j = Math.floor(gy);
	const fx = gx - i, fy = gy - j;
	const o = j * t.nx + i;
	const h00 = t.hs[o], h10 = t.hs[o + 1];
	const h01 = t.hs[o + t.nx], h11 = t.hs[o + t.nx + 1];
	return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

/** Analytic gradient of the same bilinear patch — this is what makes a faux plat felt. */
export function gradAt(t: Terrain, x: number, y: number, out: { gx: number; gy: number }): void {
	const px = clamp(x / CELL, 0, t.nx - 1.0001);
	const py = clamp(y / CELL, 0, t.ny - 1.0001);
	const i = Math.floor(px), j = Math.floor(py);
	const fx = px - i, fy = py - j;
	const o = j * t.nx + i;
	const h00 = t.hs[o], h10 = t.hs[o + 1];
	const h01 = t.hs[o + t.nx], h11 = t.hs[o + t.nx + 1];
	out.gx = ((h10 - h00) * (1 - fy) + (h11 - h01) * fy) / CELL;
	out.gy = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) / CELL;
}

/** Pebble indices in the 3x3 grid block around (x, y). */
export function pebblesNear(t: Terrain, x: number, y: number, out: number[]): void {
	out.length = 0;
	const gi = Math.floor(x / t.pgCell), gj = Math.floor(y / t.pgCell);
	for (let dj = -1; dj <= 1; dj++) {
		const j = gj + dj;
		if (j < 0 || j >= t.pgNy) continue;
		for (let di = -1; di <= 1; di++) {
			const i = gi + di;
			if (i < 0 || i >= t.pgNx) continue;
			const cell = t.pg[j * t.pgNx + i];
			for (let k = 0; k < cell.length; k++) out.push(cell[k]);
		}
	}
}

export const inPitch = (x: number, y: number): boolean =>
	x >= 0 && x <= PITCH_W && y >= 0 && y <= PITCH_L;

/** Bilinear share of each patch ground at (x, y): `a` for patches[0], `b` for patches[1]. */
export function patchAt(t: Terrain, x: number, y: number, out: { a: number; b: number }): void {
	const pw = t.pw;
	if (!pw) { out.a = 0; out.b = 0; return; }
	const gx = clamp(x / CELL, 0, t.nx - 1.0001);
	const gy = clamp(y / CELL, 0, t.ny - 1.0001);
	const i = Math.floor(gx), j = Math.floor(gy);
	const fx = gx - i, fy = gy - j;
	const o = (j * t.nx + i) * 2, o2 = o + t.nx * 2;
	out.a = (pw[o] * (1 - fx) + pw[o + 2] * fx) * (1 - fy) + (pw[o2] * (1 - fx) + pw[o2 + 2] * fx) * fy;
	out.b = (pw[o + 1] * (1 - fx) + pw[o + 3] * fx) * (1 - fy) + (pw[o2 + 1] * (1 - fx) + pw[o2 + 3] * fx) * fy;
}

const share = { a: 0, b: 0 };

/** The ground under (x, y). An even pitch is its surface everywhere, value for value. */
export function surfaceAt(t: Terrain, x: number, y: number, out: GroundSample): GroundSample {
	const s = t.surface;
	if (!t.pw) {
		out.rollFriction = s.rollFriction;
		out.restitution = s.restitution;
		out.impactFriction = s.impactFriction;
		out.scatter = s.scatter;
		out.grit = s.grit;
		return out;
	}
	patchAt(t, x, y, share);
	const [a, b] = t.patches!;
	const wa = share.a, wb = share.b, w = 1 - wa - wb;
	out.rollFriction = s.rollFriction * w + a.rollFriction * wa + b.rollFriction * wb;
	out.restitution = s.restitution * w + a.restitution * wa + b.restitution * wb;
	out.impactFriction = s.impactFriction * w + a.impactFriction * wa + b.impactFriction * wb;
	out.scatter = s.scatter * w + a.scatter * wa + b.scatter * wb;
	out.grit = s.grit * w + a.grit * wa + b.grit * wb;
	return out;
}

/** The micro-gravel's push under a rolling boule, -1..1, on 8 cm cells keyed on the spot, so a
 *  replay meets the same stones. */
export const gritAt = (t: Terrain, x: number, y: number): number =>
	(vnoise(x * 12.5, y * 12.5, t.seed + 0x5a17) - 0.5) * 2;
