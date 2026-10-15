// Analytic height field shared by physics, meshes and the map. x = east, z = south.

export const WATER_Y = -0.4;

export const START = { x: 4, z: 6.5 };
export const DEN = { x: 7, z: 14.5 };
export const HOUSE = { x: -6, z: -5, w: 5, d: 4 };
export const SALLY_SPOT = { x: -3.2, z: -1.6 };
export const PLATEAU = { x: 12, z: -10, r: 6, h: 2.4 };
export const POND = { x: -10, z: 8, r: 3.4 };
export const OAK = { x: 0, z: -52, valley: 16 };
export const OWL_SPOT = { x: 0, z: -44.5 };
export const RIVER = { x: 30, half: 7.5, depth: 1.8 };
export const LAKE = { x: 6, z: 48, r: 12 };
export const LAKE_ISLE = { x: 6, z: 48.5, r: 2.2 };
export const MOUNT = { x: 68, z: -28 };
export const MILL = { x: -38, z: 34 };
export const FOREST = { x: -48, z: -4 };
export const BOUNDS = { x0: -72, x1: 96, z0: -70, z1: 64 };

export const riverX = (z: number) => RIVER.x + 2.5 * Math.sin(z * 0.07);

export interface Islet { x: number; z: number; r: number }
// Islets hug the west bank so the east bank stays out of reach, even with a long jump.
export const ISLETS: Islet[] = [
	{ x: riverX(-24) - 2.2, z: -24, r: 1.5 },
	{ x: riverX(16) - 1.6, z: 16, r: 1.5 },
	{ x: riverX(-42) - 1.3, z: -42, r: 1.5 },
];
// Where the water starts, measured from the river's centre line.
export const BANK = 6.77;

// — Mountain: concentric terraces. Ring k spans radius [R_OUT - W(k+1), R_OUT - Wk). —
export const R_OUT = 26;
export const RING_W = 3;
export const R_TOP = 5;
export const ringLevel = (k: number) => 2 + 3 * k;
export const TOP_LEVEL = ringLevel(7);

export interface Ramp { k: number; a0: number; a1: number; from: number; to: number }
export const RAMPS: Ramp[] = [
	{ k: 0, a0: 2.5, a1: 2.95, from: 0, to: ringLevel(0) },
	{ k: 3, a0: -1.98, a1: -1.45, from: ringLevel(3), to: ringLevel(4) },
	{ k: 5, a0: 1.85, a1: 2.45, from: ringLevel(5), to: ringLevel(6) },
];
// Chasms: optional shortcuts across a ring. Falling in drops one ring.
export interface Gap { k: number; a: number; hw: number }
export const GAPS: Gap[] = [
	{ k: 2, a: 1.5, hw: 1.1 },
	{ k: 4, a: -0.6, hw: 1.15 },
	{ k: 6, a: 3.0, hw: 2.0 },
];

const smooth = (e0: number, e1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function mountPolar(x: number, z: number): { d: number; a: number } {
	const dx = x - MOUNT.x, dz = z - MOUNT.z;
	return { d: Math.hypot(dx, dz), a: Math.atan2(dz, dx) };
}

export function mountPoint(r: number, a: number): { x: number; z: number } {
	return { x: MOUNT.x + Math.cos(a) * r, z: MOUNT.z + Math.sin(a) * r };
}

export function ringOf(d: number): number {
	if (d >= R_OUT) return -1;
	if (d < R_TOP) return 7;
	return Math.min(6, Math.max(0, Math.floor((R_OUT - d) / RING_W)));
}

function mountainHeight(d: number, a: number): number {
	const k = ringOf(d);
	if (k === 7) return TOP_LEVEL;
	let h = ringLevel(k);
	for (const r of RAMPS) {
		if (r.k !== k) continue;
		const span = angDiff(r.a1, r.a0);
		const u = angDiff(a, r.a0) / span;
		// The last quarter is a flat landing, so the top is not a cliff edge.
		if (u >= 0 && u <= 1) h = r.from + (r.to - r.from) * smooth(0, 0.75, u);
	}
	for (const g of GAPS) {
		if (g.k === k && Math.abs(angDiff(a, g.a)) * d < g.hw) h = k > 0 ? ringLevel(k - 1) : 0;
	}
	return h;
}

const PATHS: [number, number, number, number][] = [
	[START.x, START.z, -2, 0],
	[-2, 0, HOUSE.x + 0.8, HOUSE.z + 2.6],
	[-2, 0, 0, -16],
	[0, -16, 0, -42],
	[-2, 0, -18, 2],
	[-18, 2, -29, -2],
	[START.x, START.z, 2, 21],
	[2, 21, 5, 33],
	[-2, 0, -14, 16],
	[-14, 16, -30, 30],
	[START.x, START.z, 14, 2],
	[14, 2, 20.5, -2.5],
	[37, -6, 47, -12],
];

export function distToPath(x: number, z: number): number {
	let best = Infinity;
	for (const [ax, az, bx, bz] of PATHS) {
		const abx = bx - ax, abz = bz - az;
		const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
		best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
	}
	return best;
}

export function plateauFactor(x: number, z: number): number {
	return smooth(PLATEAU.r + 0.45, PLATEAU.r - 0.35, Math.hypot(x - PLATEAU.x, z - PLATEAU.z));
}

// Opening in the oak valley ridge, on its south side.
export const OAK_GATE = { x: OAK.x, z: OAK.z + OAK.valley, hw: 3.6 };

export function groundHeight(x: number, z: number): number {
	const m = mountPolar(x, z);
	if (m.d < R_OUT) return mountainHeight(m.d, m.a);
	return baseHeight(x, z);
}

// Mountain-free terrain: the meadow mesh runs under the terraces with it.
export function baseHeight(x: number, z: number): number {
	let h = 0.18 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 0.1 * Math.sin((x + z) * 0.37);
	h += plateauFactor(x, z) * (PLATEAU.h + 0.1 * Math.sin(x * 0.9) * Math.cos(z * 0.7));
	h -= 0.5 * smooth(POND.r + 0.6, POND.r - 0.8, Math.hypot(x - POND.x, z - POND.z));
	const dh = Math.max(Math.abs(x - HOUSE.x) - HOUSE.w / 2 - 1, Math.abs(z - HOUSE.z) - HOUSE.d / 2 - 1);
	h *= 1 - smooth(1.5, 0, dh);

	// Oak valley: a gentle hill ringed by a steep ridge with one gate.
	const dOak = Math.hypot(x - OAK.x, z - OAK.z);
	h += 1.2 * smooth(13, 0, dOak);
	const gate = z > OAK.z && Math.abs(x - OAK.x) < OAK_GATE.hw ? smooth(OAK_GATE.hw, OAK_GATE.hw - 1.2, Math.abs(x - OAK.x)) : 0;
	h += (5 + 0.6 * Math.sin(Math.atan2(z - OAK.z, x - OAK.x) * 7)) * smooth(2.3, 0.7, Math.abs(dOak - OAK.valley)) * (1 - gate);

	// The world's rim rises into a wall. The river cuts through it, so it cannot be walked around.
	const out = Math.max(BOUNDS.x0 - x, x - BOUNDS.x1, BOUNDS.z0 - z, z - BOUNDS.z1);
	h += (9 + Math.sin(x * 0.3) * Math.cos(z * 0.27) * 2) * smooth(-3.5, 0.5, out);

	// River channel with islets.
	const dr = Math.abs(x - riverX(z));
	if (dr < RIVER.half + 0.5) {
		h = h + (-RIVER.depth - h) * smooth(RIVER.half, RIVER.half - 2.5, dr);
		for (const i of ISLETS) h = Math.max(h, -RIVER.depth + (RIVER.depth + 0.25) * smooth(i.r + 0.5, i.r - 0.3, Math.hypot(x - i.x, z - i.z)));
	}

	const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
	h = h + (-2.2 - h) * smooth(LAKE.r + 1.5, LAKE.r - 2, dl);
	h = Math.max(h, -2.2 + 2.5 * smooth(LAKE_ISLE.r + 0.6, LAKE_ISLE.r - 0.4, Math.hypot(x - LAKE_ISLE.x, z - LAKE_ISLE.z)));

	return h;
}

export function waterAt(x: number, z: number): boolean {
	if (Math.hypot(x - MOUNT.x, z - MOUNT.z) < R_OUT) return false;
	if (Math.abs(x - riverX(z)) < RIVER.half + 0.5) return true;
	return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.5;
}

// Slope (rise per metre) of the terrain at a point.
export function slopeAt(x: number, z: number): number {
	const e = 0.25;
	const gx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
	const gz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
	return Math.hypot(gx, gz);
}

export function regionName(x: number, z: number): string {
	if (Math.hypot(x - MOUNT.x, z - MOUNT.z) < R_OUT + 4) return 'Le Pic aux Étoiles';
	if (Math.hypot(x - OAK.x, z - OAK.z) < OAK.valley + 1) return 'Le Grand Chêne';
	if (x > riverX(z) - RIVER.half - 4) return 'La Rivière';
	if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) return 'Le Lac';
	if (Math.hypot(x - MILL.x, z - MILL.z) < 14) return 'Le Moulin';
	if (x < -26) return 'Le Bois';
	return 'La Prairie';
}
