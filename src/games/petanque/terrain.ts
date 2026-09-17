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
}

export type SurfaceId = 'terre-battue' | 'gravier-fin' | 'gravier-gros' | 'sable';

/** Starting values. The real numbers come out of scripts/petanque-tune.mts (measurement A). */
export const SURFACES: Record<SurfaceId, Surface> = {
	'terre-battue': { id: 'terre-battue', label: 'Terre battue', rollFriction: 0.26, restitution: 0.30, impactFriction: 0.72, scatter: 0.0025, pebbles: 110, pebbleR: [0.003, 0.007] },
	'gravier-fin': { id: 'gravier-fin', label: 'Gravier fin', rollFriction: 0.20, restitution: 0.22, impactFriction: 0.62, scatter: 0.004, pebbles: 900, pebbleR: [0.006, 0.014] },
	'gravier-gros': { id: 'gravier-gros', label: 'Gravier gros', rollFriction: 0.27, restitution: 0.18, impactFriction: 0.54, scatter: 0.016, pebbles: 1500, pebbleR: [0.010, 0.024] },
	sable: { id: 'sable', label: 'Sable', rollFriction: 0.85, restitution: 0.06, impactFriction: 0.30, scatter: 0.003, pebbles: 120, pebbleR: [0.004, 0.009] },
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
}

export function makeTerrain(seed: number, surface: Surface, amp: number, opts: TerrainOpts = {}): Terrain {
	const nx = Math.round(PITCH_W / CELL) + 1;
	const ny = Math.round(PITCH_L / CELL) + 1;
	const hs = new Float32Array(nx * ny);

	// The faux plat: one gentle global tilt on top of the noise.
	const slopeDir = hash2(7, 13, seed) * Math.PI * 2;
	const slope = opts.slope ?? 0.005 + hash2(11, 3, seed) * 0.010;
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
	scatterPebbles(t, opts.noPebbles ? 0 : t.surface.pebbles);
	return t;
}

function scatterPebbles(t: Terrain, n: number): void {
	const { pebbleR } = t.surface;
	for (let k = 0; k < n; k++) {
		const x = hash2(k, 0x51ed, t.seed) * PITCH_W;
		const y = hash2(k, 0x2f9b, t.seed) * PITCH_L;
		const r = pebbleR[0] + hash2(k, 0x7c1d, t.seed) * (pebbleR[1] - pebbleR[0]);
		t.pebbles.push({ x, y, r });
	}
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
