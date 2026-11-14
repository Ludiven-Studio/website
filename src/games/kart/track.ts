// Closed race track: a Catmull-Rom loop through control points, resampled every STEP metres.
// The road floats in space; walls stand at the edge of the shoulder.

export interface TrackDef {
	name: string;
	/** Control points [x, z, y] in metres, in driving order. */
	points: [number, number, number][];
	halfWidth: number;
	shoulder: number;
	/** Item box rows: distance along the track (fraction of the lap), lateral offsets. */
	itemRows: { at: number; lanes: number[] }[];
	/** Boost pads: fraction of the lap, lateral offset. */
	pads: { at: number; lat: number }[];
}

export interface Track {
	def: TrackDef;
	n: number;
	length: number;
	halfWidth: number;
	/** Wall distance from the centre line. */
	wall: number;
	px: Float32Array;
	py: Float32Array;
	pz: Float32Array;
	/** Unit tangent (xz). */
	tx: Float32Array;
	tz: Float32Array;
	/** Distance along the track of each sample. */
	s: Float32Array;
}

export interface Where {
	i: number;
	frac: number;
	/** Signed distance from the centre line, positive to the left of the driving direction. */
	lat: number;
	/** Distance along the track, in [0, length). */
	s: number;
	y: number;
}

export const STEP = 2;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
	const t2 = t * t;
	const t3 = t2 * t;
	return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(def: TrackDef): Track {
	const P = def.points;
	const m = P.length;
	const dense: [number, number, number][] = [];
	const SUB = 60;
	for (let k = 0; k < m; k++) {
		const a = P[(k - 1 + m) % m], b = P[k], c = P[(k + 1) % m], d = P[(k + 2) % m];
		for (let j = 0; j < SUB; j++) {
			const t = j / SUB;
			dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t), catmull(a[2], b[2], c[2], d[2], t)]);
		}
	}
	// Resample at an even spacing along the xz arc.
	const cum = [0];
	for (let k = 1; k <= dense.length; k++) {
		const p = dense[k - 1], q = dense[k % dense.length];
		cum.push(cum[k - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
	}
	const total = cum[dense.length];
	const n = Math.round(total / STEP);
	const step = total / n;
	const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
	let k = 0;
	for (let i = 0; i < n; i++) {
		const target = i * step;
		while (cum[k + 1] < target) k++;
		const f = (target - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
		const p = dense[k], q = dense[(k + 1) % dense.length];
		px[i] = p[0] + (q[0] - p[0]) * f;
		pz[i] = p[1] + (q[1] - p[1]) * f;
		py[i] = p[2] + (q[2] - p[2]) * f;
	}
	const tx = new Float32Array(n), tz = new Float32Array(n), s = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = (i - 1 + n) % n, b = (i + 1) % n;
		const dx = px[b] - px[a], dz = pz[b] - pz[a];
		const l = Math.hypot(dx, dz) || 1;
		tx[i] = dx / l;
		tz[i] = dz / l;
		s[i] = i * step;
	}
	return { def, n, length: total, halfWidth: def.halfWidth, wall: def.halfWidth + def.shoulder, px, py, pz, tx, tz, s };
}

/** Left normal of sample i (xz): the tangent turned a quarter. */
export const normalX = (t: Track, i: number) => t.tz[i];
export const normalZ = (t: Track, i: number) => -t.tx[i];

export function locate(t: Track, x: number, z: number, hint = -1): Where {
	const n = t.n;
	let best = 0, bd = Infinity;
	if (hint < 0) {
		for (let i = 0; i < n; i++) {
			const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2;
			if (d < bd) { bd = d; best = i; }
		}
	} else {
		for (let o = -24; o <= 24; o++) {
			const i = (hint + o + n) % n;
			const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2;
			if (d < bd) { bd = d; best = i; }
		}
	}
	// Project on the segment toward the side the point lies on.
	let i = best;
	const j = (best + 1) % n;
	let ax = t.px[j] - t.px[i], az = t.pz[j] - t.pz[i];
	let f = ((x - t.px[i]) * ax + (z - t.pz[i]) * az) / (ax * ax + az * az);
	if (f < 0) {
		i = (best - 1 + n) % n;
		ax = t.px[best] - t.px[i];
		az = t.pz[best] - t.pz[i];
		f = ((x - t.px[i]) * ax + (z - t.pz[i]) * az) / (ax * ax + az * az);
	}
	f = Math.min(1, Math.max(0, f));
	const i2 = (i + 1) % n;
	const cx = t.px[i] + ax * f, cz = t.pz[i] + az * f;
	const nx = normalX(t, i), nz = normalZ(t, i);
	const lat = (x - cx) * nx + (z - cz) * nz;
	const step = t.length / n;
	const y = t.py[i] + (t.py[i2] - t.py[i]) * f;
	return { i, frac: f, lat, s: (i + f) * step, y };
}

/** Sample index at distance s along the track. */
export const indexAt = (t: Track, s: number) => ((Math.floor(s / (t.length / t.n)) % t.n) + t.n) % t.n;

/** Point at distance s, offset lat to the left. */
export function pointAt(t: Track, s: number, lat = 0): { x: number; y: number; z: number; i: number } {
	const step = t.length / t.n;
	const u = (((s % t.length) + t.length) % t.length) / step;
	const i = Math.floor(u) % t.n;
	const j = (i + 1) % t.n;
	const f = u - Math.floor(u);
	const x = t.px[i] + (t.px[j] - t.px[i]) * f + normalX(t, i) * lat;
	const z = t.pz[i] + (t.pz[j] - t.pz[i]) * f + normalZ(t, i) * lat;
	return { x, y: t.py[i] + (t.py[j] - t.py[i]) * f, z, i };
}

/** Heading (radians, forward = (cos, sin) in xz) of the track at sample i. */
export const headingAt = (t: Track, i: number) => Math.atan2(t.tz[((i % t.n) + t.n) % t.n], t.tx[((i % t.n) + t.n) % t.n]);

export const wrapAngle = (a: number) => {
	a = (a + Math.PI) % (Math.PI * 2);
	if (a < 0) a += Math.PI * 2;
	return a - Math.PI;
};

// The first track: a ring of asteroids around a gas giant. Driving order is clockwise seen from above.
export const NEBULA_RING: TrackDef = {
	name: 'Anneau de la Nébuleuse',
	halfWidth: 8,
	shoulder: 3,
	points: [
		[-90, 0, 0],
		[0, 0, 0],
		[90, 0, 0],
		[140, 12, 1],
		[160, 55, 4],
		[145, 100, 8],
		[100, 118, 9],
		[60, 108, 7],
		[30, 128, 6],
		[0, 118, 5],
		[-30, 138, 6],
		[-80, 155, 9],
		[-135, 145, 11],
		[-160, 105, 10],
		[-140, 72, 7],
		[-98, 72, 5],
		[-54, 62, 4],
		[-58, 30, 2],
		[-106, 31, 1],
		[-150, 22, 0],
		[-170, -10, 0],
		[-145, -38, 0],
	],
	itemRows: [
		{ at: 0.1, lanes: [-5, -2.5, 0, 2.5, 5] },
		{ at: 0.42, lanes: [-4, 0, 4] },
		{ at: 0.7, lanes: [-5, -2.5, 0, 2.5, 5] },
	],
	pads: [
		{ at: 0.04, lat: 3 },
		{ at: 0.55, lat: -2 },
		{ at: 0.92, lat: 0 },
	],
};
