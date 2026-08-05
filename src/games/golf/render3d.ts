import * as THREE from 'three';
import { PARAMS, type Hole } from './engine';
import { mulberry32 } from '../prng';

/* =====================================================
   MINI-GOLF — 3D course renderer, shared by the shipped game and the /labo proto.
   The engine is untouched and still 2D: the ball moves in XZ. `hole.alt` and
   `hole.bank`, which the old top-down view drew as a colour ramp, are used here as
   real heights, so the course has relief, banked turns, walls with sides and a cup
   the ball drops into.
   ===================================================== */

// A sharp corner reaches bank 1.39 rad/sample, which as a cross slope would be a wall.
// Cap it: past this the turn is banked as hard as it can be drawn.
const BANK_CAP = 0.35;
const SOCLE_H = 1.2; // taller than the drawn ball, so the collision edge always has a face behind it
const LIP = 0.6; // how far the kerb's outer face hangs below the floor
const DECK = 1.3; // bridge deck thickness — below it the arch is open water
const APRON = 10; // where the grass bank beyond the paving lands

export const WALL_H = 1.4;
export const PAVE = 4.5; // paved band around the lane, like the real courses
export const DROP = 3.4; // how far the grass bank falls — also the headroom under the bridge
export const BALL_VIS = 0.8; // the drawn ball is smaller than the physics one — it read as a boulder
export const CUP_D = 1.8; // cup depth — deep enough that the ball visibly disappears into it
export const SINK_MS = 420;

export interface Build3DOpts {
	relief: number;
	bank: number;
	/** Scatter attempts for the planting. 0 = bare course. */
	decor?: number;
}

const bankCache = new WeakMap<Hole, number[]>();

/**
 * Smoothed cross slope. Raw `hole.bank` swings sample to sample — on a hairpin it goes
 * 0.33, 0.13, -0.10, 0.50 — which as a surface came out as a zigzag fan, not a banked turn.
 */
export function bankAt(hole: Hole, i: number): number {
	let s = bankCache.get(hole);
	if (!s) {
		const R = 4, n = hole.bank.length;
		s = hole.bank.map((_, k) => {
			let sum = 0, c = 0;
			for (let j = Math.max(0, k - R); j <= Math.min(n - 1, k + R); j++) { sum += hole.bank[j]; c++; }
			return Math.max(-BANK_CAP, Math.min(BANK_CAP, sum / c));
		});
		bankCache.set(hole, s);
	}
	return s[i];
}

/**
 * Lane surface at sample `i`, `u` = lateral position (-1 right … +1 left).
 * The two axes are scaled apart on purpose: `rel` flattens the hole along its length,
 * `bk` keeps the turns banked. The engine already pushes the ball sideways in a turn
 * (its own BANK term) — this is what makes that push visible.
 */
export const laneY = (hole: Hole, i: number, u: number, rel: number, bk: number): number =>
	hole.alt[i] * rel - u * bk * bankAt(hole, i);

/** Nearest centerline sample — same lookup stepBall uses for the relief. */
export function nearestSample(hole: Hole, x: number, z: number): number {
	let bi = 0, bd = Infinity;
	for (let i = 0; i < hole.path.length; i++) {
		const dx = hole.path[i].x - x, dz = hole.path[i].z - z;
		const dd = dx * dx + dz * dz;
		if (dd < bd) { bd = dd; bi = i; }
	}
	return bi;
}

/** Surface height under any point: lane (banked) outside the green, dish inside it. */
export function surfaceY(hole: Hole, x: number, z: number, rel: number, bk: number): number {
	const dCup = Math.hypot(x - hole.cup.x, z - hole.cup.z);
	if (dCup < hole.greenR) {
		const centre = hole.alt[hole.alt.length - 1];
		const rim = hole.alt[hole.cutIdx];
		return (centre + (rim - centre) * (dCup / hole.greenR)) * rel;
	}
	const i = nearestSample(hole, x, z);
	const p = hole.path[i];
	const u = ((x - p.x) * p.nx + (z - p.z) * p.nz) / (hole.widths[i] || 1);
	return laneY(hole, i, Math.max(-1.4, Math.min(1.4, u)), rel, bk);
}

/** Lawn height around the course — where the grassy bank lands. */
export const groundYOf = (hole: Hole, relief: number): number => Math.min(...hole.alt) * relief - DROP;

/**
 * Distance that fits the course rectangle in frame. A bounding sphere would waste most
 * of the screen: these holes are long and narrow, and the tilt shortens them further —
 * the along-view extent only costs `sin(pitch)` of screen height.
 */
export const CORNERS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function fitDist(cam: THREE.PerspectiveCamera, hx: number, hz: number, pitch: number, az: number): number {
	const ca = Math.cos(az), sa = Math.sin(az);
	let fwd = 0, side = 0;
	for (const [sx, sz] of CORNERS) {
		const dx = sx * hx, dz = sz * hz;
		fwd = Math.max(fwd, Math.abs(dx * ca + dz * sa));
		side = Math.max(side, Math.abs(-dx * sa + dz * ca));
	}
	const vFov = (cam.fov * Math.PI) / 180;
	const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
	return Math.max(
		(fwd * Math.sin(pitch) * 1.04) / Math.tan(vFov / 2),
		(side * 1.04) / Math.tan(hFov / 2),
		18,
	);
}

/**
 * Azimuth that frames the course tightest, searched around `base`. Looking straight down a
 * long hole leaves the whole width of the canvas empty; turning ~50° reads the same way
 * and brings the camera a fifth closer. Ties keep the smallest turn.
 */
export function bestAz(cam: THREE.PerspectiveCamera, hx: number, hz: number, base: number, pitch: number): number {
	let best = base, bestD = Infinity;
	for (let k = 0; k <= 12; k++) {
		for (const s of k === 0 ? [0] : [-1, 1]) {
			const az = base + (s * k * Math.PI) / 36; // ±60°, 5° apart
			const d = fitDist(cam, hx, hz, pitch, az);
			if (d < bestD - 1e-6) { bestD = d; best = az; }
		}
	}
	return best;
}

/** Free every geometry and material a built hole owns. */
export function disposeHole(grp: THREE.Group) {
	const mats = new Set<THREE.Material>();
	grp.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh) return;
		m.geometry.dispose();
		for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
	});
	for (const m of mats) m.dispose();
}

const stripGeom = (pos: number[]): THREE.BufferGeometry => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.computeVertexNormals();
	return g;
};

/* =====================================================
   Obstacle props. The engine only knows a 4-corner footprint and the ball never
   leaves the ground, so anything above ball height may overhang freely. A stone
   socle always fills the exact footprint: whatever is built on top never has to
   explain a bounce.
   Every prop is modelled around its own origin — socle top, +X along the lane,
   +Z facing the lane interior.
   ===================================================== */

type MatFn = (color: number, rough?: number) => THREE.MeshStandardMaterial;

/** A prop the ball can pass under, and which must get out of the way when it does. */
interface Overhead { mat: THREE.MeshStandardMaterial; x: number; z: number }

/** Gable roof, base at y=0, ridge along X. */
function gableGeom(hx: number, hz: number, h: number): THREE.BufferGeometry {
	const p: number[] = [];
	const quad = (a: number[], b: number[], c: number[], d: number[]) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
	quad([-hx, 0, -hz], [hx, 0, -hz], [hx, h, 0], [-hx, h, 0]);
	quad([-hx, 0, hz], [-hx, h, 0], [hx, h, 0], [hx, 0, hz]);
	p.push(-hx, 0, -hz, -hx, h, 0, -hx, 0, hz);
	p.push(hx, 0, -hz, hx, 0, hz, hx, h, 0);
	return stripGeom(p);
}

function buildCottage(mat: MatFn, L: number, D: number, rnd: () => number): THREE.Group {
	const g = new THREE.Group();
	const hx = L / 2 - 0.12, hz = D / 2 - 0.12;
	const h = 1.7 + rnd() * 0.5;
	const body = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, h, hz * 2), mat(rnd() < 0.5 ? 0xf2e7d3 : 0xe7d4b9, 0.85));
	body.position.y = h / 2;
	g.add(body);

	const roofH = 0.55 + Math.min(hz, 1.1);
	const roof = new THREE.Mesh(gableGeom(hx + 0.28, hz + 0.28, roofH), mat(0xb1503c, 0.9));
	roof.position.y = h;
	g.add(roof);

	const doorH = Math.min(1.0, h * 0.62);
	const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, doorH, 0.08), mat(0x5a3d2b, 0.8));
	door.position.set(0, doorH / 2, hz + 0.02);
	g.add(door);

	const glass = mat(0xf7d774, 0.5);
	if (hx > 1.0) for (const s of [-1, 1]) {
		const win = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.06), glass);
		win.position.set(s * Math.min(hx - 0.3, 1.1), h * 0.62, hz + 0.02);
		g.add(win);
	}

	const chim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), mat(0x9a6b5c, 0.95));
	chim.position.set(hx * 0.55, h + roofH * 0.55, 0);
	g.add(chim);
	return g;
}

function buildWindmill(mat: MatFn, L: number, D: number, rnd: () => number, spin: THREE.Object3D[]): THREE.Group {
	const g = new THREE.Group();
	const r = Math.min(L, D) / 2 - 0.1;
	const h = 3.0 + rnd() * 0.6;
	const tower = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, h, 12), mat(0xefe4d0, 0.85));
	tower.position.y = h / 2;
	g.add(tower);
	const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, 0.85, 12), mat(0x8a4a3a, 0.9));
	cap.position.y = h + 0.42;
	g.add(cap);

	const wood = mat(0x8b5e3c, 0.85), cloth = mat(0xf7f3e7, 0.9);
	const hubY = h * 0.88;
	// the lowest sail tip must stay above the drawn ball, or the sails saw through it
	const bl = Math.max(1.1, Math.min(2.4, SOCLE_H + hubY - 1.7));
	const sails = new THREE.Group();
	sails.position.set(0, hubY, r * 0.8);
	const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 8), wood);
	hub.rotation.x = Math.PI / 2;
	sails.add(hub);
	for (let k = 0; k < 4; k++) {
		const blade = new THREE.Group();
		blade.rotation.z = (k * Math.PI) / 2;
		const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, bl, 0.07), wood);
		arm.position.y = bl / 2;
		blade.add(arm);
		const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.46, bl * 0.68), cloth);
		sail.position.set(0.3, bl * 0.56, 0.05);
		blade.add(sail);
		sails.add(blade);
	}
	g.add(sails);
	spin.push(sails);
	return g;
}

function buildTower(mat: MatFn, L: number, D: number, rnd: () => number): THREE.Group {
	const g = new THREE.Group();
	const r = Math.min(L, D) / 2 - 0.1;
	const h = 2.6 + rnd() * 0.6;
	const stone = mat(0xbdb3a4, 0.95);
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 10), stone);
	shaft.position.y = h / 2;
	g.add(shaft);
	const cornice = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.2, 10), stone);
	cornice.position.y = h;
	g.add(cornice);
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI * 2) / 8;
		const m = new THREE.Mesh(new THREE.BoxGeometry(r * 0.4, 0.44, r * 0.4), stone);
		m.position.set(Math.cos(a) * r * 0.78, h + 0.32, Math.sin(a) * r * 0.78);
		m.rotation.y = -a;
		g.add(m);
	}
	const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), mat(0x6b5a48, 0.8));
	pole.position.y = h + 0.9;
	g.add(pole);
	const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4), mat(0xd7443a, 0.9));
	flag.position.set(0.35, h + 1.35, 0);
	g.add(flag);
	return g;
}

/** Pier standing mid-lane, carrying a deck the ball rolls under. `spanHalf` reaches the paving. */
function buildFootbridge(mat: MatFn, L: number, D: number, spanHalf: number): THREE.Group {
	const g = new THREE.Group();
	const stone = mat(0xc3b8a6, 0.95);
	// Own material, not a cached one: the deck fades when the ball rolls under it, and the
	// socles must not fade with it.
	const wood = new THREE.MeshStandardMaterial({
		color: 0x9a6b43, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, transparent: true,
	});
	g.userData.fadeMat = wood;
	const deckY = 2.7; // above the socle: headroom that reads as an overpass, not a lid
	const colH = deckY - 0.35;
	const col = new THREE.Mesh(new THREE.BoxGeometry(L * 0.6, colH, D * 0.6), stone);
	col.position.y = colH / 2;
	g.add(col);
	const cap = new THREE.Mesh(new THREE.BoxGeometry(L * 0.88, 0.24, D * 0.88), stone);
	cap.position.y = deckY - 0.36;
	g.add(cap);

	const wide = L + 1.0;
	const deck = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.26, spanHalf * 2), wood);
	deck.position.y = deckY;
	g.add(deck);
	// The span ends over the paved band, well above it — without an abutment each end
	// hangs in mid-air. Buried a little, since the band is never perfectly level.
	const abH = deckY + SOCLE_H + 1.0;
	for (const s of [-1, 1]) {
		const ab = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.9, abH, 1.7), stone);
		ab.position.set(0, deckY - 0.13 - abH / 2, s * (spanHalf - 1.1));
		g.add(ab);
	}
	for (const s of [-1, 1]) {
		const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, spanHalf * 2), wood);
		rail.position.set((s * wide) / 2, deckY + 0.78, 0);
		g.add(rail);
		for (let k = -3; k <= 3; k++) {
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.78, 0.11), wood);
			post.position.set((s * wide) / 2, deckY + 0.39, (k / 3) * spanHalf * 0.92);
			g.add(post);
		}
	}
	return g;
}

/** Per-frame prop life: the sails turn, and a deck the ball is under fades out of the way. */
export function animateHole(group: THREE.Group, timeMs: number, bx: number, bz: number): void {
	const spin = group.userData.spin as THREE.Object3D[] | undefined;
	if (spin) for (const s of spin) s.rotation.z = timeMs * 0.0006;
	const fade = group.userData.fade as Overhead[] | undefined;
	if (fade) for (const f of fade) {
		const d = Math.hypot(bx - f.x, bz - f.z);
		f.mat.opacity = Math.max(0.18, Math.min(1, (d - 3.5) / 6));
	}
}

/** Stable per-obstacle variety: the same hole always plants the same buildings. */
function propSeed(x: number, z: number): number {
	let h = Math.imul(Math.round(x * 16) ^ 0x9e3779b9, 2654435761);
	h = Math.imul(h ^ (Math.round(z * 16) + 0x85ebca6b), 2246822519);
	return (h ^ (h >>> 15)) >>> 0;
}

interface Sprout {
	key: string;
	geo: THREE.BufferGeometry;
	mat: THREE.Material;
	shadow: boolean;
	pos: [number, number, number];
	scale: [number, number, number];
}

/**
 * Planting, as instanced meshes. One mesh per plant put the draw call count in the
 * hundreds, which a phone feels; there are only a handful of distinct shapes.
 */
function plant(hole: Hole, gy: number, tries: number, stream: { x: number; z: number; r: number } | null): THREE.Group {
	const decor = new THREE.Group();
	decor.name = 'decor'; // kept apart so the occlusion probe can tell course from scenery
	if (tries <= 0) return decor;

	const rnd = mulberry32(hole.par * 7919 + hole.path.length);
	const icoGeo = new THREE.IcosahedronGeometry(1, 0);
	const coneGeo = new THREE.ConeGeometry(1, 3, 7);
	const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2, 6);
	const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3a6b33, roughness: 1, flatShading: true });
	const darkMat = new THREE.MeshStandardMaterial({ color: 0x27502c, roughness: 1, flatShading: true });
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 });
	const petalMats = [0xe8556d, 0xf2b134, 0xe8e0f0, 0xc86bd8, 0xf07f3c].map(
		(c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }),
	);

	const W = hole.widths;
	const bo = hole.bounds;
	const spanX = bo.maxX - bo.minX, spanZ = bo.maxZ - bo.minZ;
	const out: Sprout[] = [];
	for (let n = 0; n < tries; n++) {
		const x = bo.minX - 200 + rnd() * (spanX + 400);
		const z = bo.minZ - 200 + rnd() * (spanZ + 400);
		const i = nearestSample(hole, x, z);
		const clear = Math.min(
			Math.hypot(hole.path[i].x - x, hole.path[i].z - z) - W[i],
			Math.hypot(x - hole.cup.x, z - hole.cup.z) - hole.greenR,
		);
		if (clear < PAVE + 2) continue;
		if (stream && Math.hypot(x - stream.x, z - stream.z) < stream.r * 0.75) continue;
		if (clear < APRON + 7) {
			// Flower bed: a green tuft with a few petals on top.
			const s = 0.7 + rnd() * 0.5;
			out.push({ key: 'tuft', geo: icoGeo, mat: shrubMat, shadow: false, pos: [x, gy + s * 0.3, z], scale: [s, s * 0.6, s] });
			const pi = Math.floor(rnd() * petalMats.length);
			for (let k = 0; k < 3; k++) {
				const ps = 0.26 + rnd() * 0.16;
				out.push({
					key: `petal${pi}`, geo: icoGeo, mat: petalMats[pi], shadow: false,
					pos: [x + (rnd() - 0.5) * s * 1.8, gy + s * 0.7 + rnd() * 0.4, z + (rnd() - 0.5) * s * 1.8],
					scale: [ps, ps, ps],
				});
			}
		} else if (clear < 70) {
			const s = 1.6 + rnd() * 2.6;
			const dark = rnd() < 0.5;
			out.push({
				key: dark ? 'shrubD' : 'shrubL', geo: icoGeo, mat: dark ? darkMat : shrubMat, shadow: true,
				pos: [x, gy + s * 0.55, z], scale: [s, s * 0.8, s],
			});
		} else if (rnd() < 0.45) {
			// A real tree is many times the lane width — at the old scale they read as bushes.
			const s = 7 + rnd() * 7;
			out.push({ key: 'trunk', geo: trunkGeo, mat: trunkMat, shadow: false, pos: [x, gy + s, z], scale: [s, s, s] });
			const round = rnd() < 0.55;
			out.push({
				key: round ? 'crownR' : 'crownC', geo: round ? icoGeo : coneGeo, mat: darkMat, shadow: true,
				pos: [x, gy + s * 2 + s * (round ? 1.2 : 2.8), z],
				scale: round ? [s * 1.5, s * 1.5, s * 1.5] : [s * 1.5, s * 1.9, s * 1.5],
			});
		}
	}

	const buckets = new Map<string, Sprout[]>();
	for (const s of out) {
		const b = buckets.get(s.key);
		if (b) b.push(s); else buckets.set(s.key, [s]);
	}
	const m = new THREE.Matrix4();
	for (const b of buckets.values()) {
		const im = new THREE.InstancedMesh(b[0].geo, b[0].mat, b.length);
		im.castShadow = b[0].shadow;
		for (let i = 0; i < b.length; i++) {
			m.makeScale(...b[i].scale).setPosition(...b[i].pos);
			im.setMatrixAt(i, m);
		}
		im.instanceMatrix.needsUpdate = true;
		decor.add(im);
	}
	// A bucket may end up empty; its shared geometry is still disposed through some mesh.
	for (const geo of [icoGeo, coneGeo, trunkGeo]) if (!decor.children.some((c) => (c as THREE.Mesh).geometry === geo)) geo.dispose();
	for (const mat of [shrubMat, darkMat, trunkMat, ...petalMats]) {
		if (!decor.children.some((c) => (c as THREE.Mesh).material === mat)) mat.dispose();
	}
	return decor;
}

export function buildHole3D(hole: Hole, opts: Build3DOpts): THREE.Group {
	const { relief, bank: bankv } = opts;
	const grp = new THREE.Group();
	const { path, cutIdx: cut } = hole;
	const W = hole.widths;
	const Y = (a: number) => a * relief; // relief = 0 reproduces the old flat course

	const altMin = Math.min(...hole.alt), altMax = Math.max(...hole.alt);
	const range = altMax - altMin || 1;
	const col = (a: number): [number, number, number] => {
		const t = Math.max(0, Math.min(1, (a - altMin) / range));
		return [0.16 + t * 0.44, 0.42 + t * 0.48, 0.26 + t * 0.4];
	};

	// DoubleSide throughout: the corridor strips wind downward, and three.js flips the
	// normal per-face for lighting only when the material is double-sided.
	const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
	const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide });
	// Props share materials by colour, and only ever create the ones they use — an unused
	// material would never sit on a mesh, so disposeHole could not find it.
	const propMats = new Map<string, THREE.MeshStandardMaterial>();
	const pmat: MatFn = (color, rough = 0.9) => {
		const k = `${color}|${rough}`;
		let m = propMats.get(k);
		if (!m) {
			m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, side: THREE.DoubleSide });
			propMats.set(k, m);
		}
		return m;
	};

	const centreA = hole.alt[hole.alt.length - 1], rimA = hole.alt[cut];

	// ---- Lane floor: the two edges sit at different HEIGHTS, so banked turns bank.
	const fpos: number[] = [], fcol: number[] = [];
	const edge = (i: number, side: 1 | -1) => {
		const p = path[i], w = W[i];
		return {
			x: p.x + p.nx * w * side,
			y: laneY(hole, i, side, relief, bankv),
			z: p.z + p.nz * w * side,
			c: col(hole.alt[i]),
		};
	};
	for (let i = 0; i < cut; i++) {
		const lp = edge(i, 1), rp = edge(i, -1), lq = edge(i + 1, 1), rq = edge(i + 1, -1);
		fpos.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z, lq.x, lq.y, lq.z);
		fcol.push(...lp.c, ...rp.c, ...lq.c);
		fpos.push(rp.x, rp.y, rp.z, rq.x, rq.y, rq.z, lq.x, lq.y, lq.z);
		fcol.push(...rp.c, ...rq.c, ...lq.c);
	}
	// ---- Throat. The engine seals the corridor mouth to the green opening with two collision
	// walls but no surface, so the lane and the green read as two loose slabs. Fill the gap.
	const gw0 = hole.greenWall[0], gw1 = hole.greenWall[hole.greenWall.length - 1];
	const mouthL = edge(cut, 1), mouthR = edge(cut, -1);
	const openL = Math.hypot(mouthL.x - gw0.x, mouthL.z - gw0.z) <= Math.hypot(mouthL.x - gw1.x, mouthL.z - gw1.z) ? gw0 : gw1;
	const openR = openL === gw0 ? gw1 : gw0;
	const THROAT = 6;
	const thr = (side: 1 | -1, u: number) => {
		const m = side === 1 ? mouthL : mouthR, o = side === 1 ? openL : openR;
		return {
			x: m.x + (o.x - m.x) * u,
			y: m.y + (Y(rimA) - m.y) * u + 0.01,
			z: m.z + (o.z - m.z) * u,
			c: col(rimA),
		};
	};
	for (let k = 0; k < THROAT; k++) {
		const lp = thr(1, k / THROAT), rp = thr(-1, k / THROAT);
		const lq = thr(1, (k + 1) / THROAT), rq = thr(-1, (k + 1) / THROAT);
		fpos.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z, lq.x, lq.y, lq.z);
		fcol.push(...lp.c, ...rp.c, ...lq.c);
		fpos.push(rp.x, rp.y, rp.z, rq.x, rq.y, rq.z, lq.x, lq.y, lq.z);
		fcol.push(...rp.c, ...rq.c, ...lq.c);
	}

	const fgeom = new THREE.BufferGeometry();
	fgeom.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
	fgeom.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
	fgeom.computeVertexNormals();
	const floor = new THREE.Mesh(fgeom, floorMat);
	floor.receiveShadow = true;
	grp.add(floor);

	// ---- Green: a real dish, low at the cup and rising to the rim. It starts at the cup
	// radius, not at 0 — a full disc paved over the cup and there was no hole to sink into.
	const RINGS = 12, SEG = 48;
	const gpos: number[] = [], gcol: number[] = [];
	const gp = (ri: number, si: number) => {
		const d = hole.cupR + (ri / RINGS) * (hole.greenR - hole.cupR);
		const ang = (si / SEG) * Math.PI * 2;
		const a = centreA + (rimA - centreA) * (d / hole.greenR);
		return { x: hole.cup.x + Math.cos(ang) * d, y: Y(a) + 0.02, z: hole.cup.z + Math.sin(ang) * d, c: col(a) };
	};
	for (let ri = 0; ri < RINGS; ri++) {
		for (let si = 0; si < SEG; si++) {
			const a = gp(ri, si), b = gp(ri + 1, si), c = gp(ri + 1, si + 1), d = gp(ri, si + 1);
			gpos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
			gcol.push(...a.c, ...b.c, ...c.c);
			gpos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
			gcol.push(...a.c, ...c.c, ...d.c);
		}
	}
	const ggeom = new THREE.BufferGeometry();
	ggeom.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
	ggeom.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
	ggeom.computeVertexNormals();
	const greenMesh = new THREE.Mesh(ggeom, floorMat);
	greenMesh.receiveShadow = true;
	grp.add(greenMesh);

	// ---- Walls: extruded (inner face + top + outer face) instead of a flat ribbon.
	const t = 1.0;
	const wpos: number[] = [];
	const quad = (
		a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => { wpos.push(...a, ...b, ...c, ...a, ...c, ...d); };
	// The kerb hangs a short lip below the floor, then a flat paved band and a grass bank
	// carry the course down to the lawn — the layout of the real courses in the photos.
	// A single skirt to the lowest point turned the hole into a stone block.
	const ppos: number[] = [], apos: number[] = [];
	const push = (
		out: number[], a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
	const aquad = (
		a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => push(apos, a, b, c, d);
	const gy = groundYOf(hole, relief);
	const wallRun = (pts: { ix: number; iz: number; ox: number; oz: number; y: number; over?: boolean }[]) => {
		for (let k = 0; k < pts.length - 1; k++) {
			const p = pts[k], q = pts[k + 1];
			const pt = p.y + WALL_H, qt = q.y + WALL_H;
			// Over the water the flank stops at the deck underside, leaving the arch open.
			const pb = p.over ? p.y - DECK : p.y - LIP, qb = q.over ? q.y - DECK : q.y - LIP;
			quad([p.ix, p.y, p.iz], [p.ix, pt, p.iz], [q.ix, qt, q.iz], [q.ix, q.y, q.iz]); // inner
			quad([p.ix, pt, p.iz], [p.ox, pt, p.oz], [q.ox, qt, q.oz], [q.ix, qt, q.iz]); // top
			quad([p.ox, pb, p.oz], [q.ox, qb, q.oz], [q.ox, qt, q.oz], [p.ox, pt, p.oz]); // outer
			if (p.over || q.over) continue; // no paving or grass over the water
			// Paving then grass bank, both sliding outward along the kerb normal.
			const pd = Math.hypot(p.ox - p.ix, p.oz - p.iz) || 1, qd = Math.hypot(q.ox - q.ix, q.oz - q.iz) || 1;
			const pnx = (p.ox - p.ix) / pd, pnz = (p.oz - p.iz) / pd;
			const qnx = (q.ox - q.ix) / qd, qnz = (q.oz - q.iz) / qd;
			const ppx = p.ox + pnx * PAVE, ppz = p.oz + pnz * PAVE;
			const qpx = q.ox + qnx * PAVE, qpz = q.oz + qnz * PAVE;
			push(ppos, [p.ox, p.y - LIP, p.oz], [ppx, p.y - LIP, ppz], [qpx, q.y - LIP, qpz], [q.ox, q.y - LIP, q.oz]);
			aquad(
				[ppx, p.y - LIP, ppz], [p.ox + pnx * APRON, p.y - DROP, p.oz + pnz * APRON],
				[q.ox + qnx * APRON, q.y - DROP, q.oz + qnz * APRON], [qpx, q.y - LIP, qpz],
			);
		}
	};
	for (const side of [1, -1] as const) {
		const run = [];
		for (let i = 0; i <= cut; i++) {
			const p = path[i], w = W[i];
			run.push({
				ix: p.x + p.nx * w * side, iz: p.z + p.nz * w * side,
				ox: p.x + p.nx * (w + t) * side, oz: p.z + p.nz * (w + t) * side,
				y: laneY(hole, i, side, relief, bankv),
				over: !!hole.bridge && i >= hole.bridge.lo && i <= hole.bridge.hi,
			});
		}
		wallRun(run);
	}
	// Kerb across the throat, so the lane wall runs unbroken into the green ring.
	const kOut = 1 + t / hole.greenR;
	for (const side of [1, -1] as const) {
		const p = path[cut], w = W[cut];
		const o = side === 1 ? openL : openR;
		wallRun([
			{
				ix: p.x + p.nx * w * side, iz: p.z + p.nz * w * side,
				ox: p.x + p.nx * (w + t) * side, oz: p.z + p.nz * (w + t) * side,
				y: laneY(hole, cut, side, relief, bankv),
			},
			{
				ix: o.x, iz: o.z,
				ox: hole.cup.x + (o.x - hole.cup.x) * kOut, oz: hole.cup.z + (o.z - hole.cup.z) * kOut,
				y: Y(rimA),
			},
		]);
	}
	// Tee cap: closes the corridor behind the ball.
	const p0 = path[0], y0 = Y(hole.alt[0]);
	const bx = -p0.dirX * t, bz = -p0.dirZ * t;
	const teeL = { x: p0.x + p0.nx * (W[0] + t), z: p0.z + p0.nz * (W[0] + t) };
	const teeR = { x: p0.x - p0.nx * (W[0] + t), z: p0.z - p0.nz * (W[0] + t) };
	quad([teeL.x, y0 - LIP, teeL.z], [teeL.x, y0 + WALL_H, teeL.z], [teeR.x, y0 + WALL_H, teeR.z], [teeR.x, y0 - LIP, teeR.z]);
	quad([teeL.x, y0 + WALL_H, teeL.z], [teeL.x + bx, y0 + WALL_H, teeL.z + bz], [teeR.x + bx, y0 + WALL_H, teeR.z + bz], [teeR.x, y0 + WALL_H, teeR.z]);
	push(ppos,
		[teeL.x, y0 - LIP, teeL.z], [teeR.x, y0 - LIP, teeR.z],
		[teeR.x + bx * PAVE, y0 - LIP, teeR.z + bz * PAVE], [teeL.x + bx * PAVE, y0 - LIP, teeL.z + bz * PAVE],
	);
	aquad(
		[teeL.x + bx * PAVE, y0 - LIP, teeL.z + bz * PAVE], [teeR.x + bx * PAVE, y0 - LIP, teeR.z + bz * PAVE],
		[teeR.x + bx * APRON, y0 - DROP, teeR.z + bz * APRON], [teeL.x + bx * APRON, y0 - DROP, teeL.z + bz * APRON],
	);

	// Green bumper ring, following the dish rim.
	const gw = hole.greenWall;
	const ringRun = gw.map((p) => {
		const k = 1 + t / hole.greenR;
		return {
			ix: p.x, iz: p.z,
			ox: hole.cup.x + (p.x - hole.cup.x) * k, oz: hole.cup.z + (p.z - hole.cup.z) * k,
			y: Y(rimA),
		};
	});
	wallRun(ringRun);
	const walls = new THREE.Mesh(stripGeom(wpos), wallMat);
	walls.castShadow = true;
	walls.receiveShadow = true;
	grp.add(walls);
	const paving = new THREE.Mesh(stripGeom(ppos), new THREE.MeshStandardMaterial({
		color: 0xa79c8d, roughness: 1, side: THREE.DoubleSide,
	}));
	paving.receiveShadow = true;
	grp.add(paving);
	const apron = new THREE.Mesh(stripGeom(apos), new THREE.MeshStandardMaterial({
		color: 0x3c7040, roughness: 1, side: THREE.DoubleSide,
	}));
	apron.receiveShadow = true;
	grp.add(apron);

	// ---- Cup: a real sunk cylinder, not a dark disc.
	const cupY = Y(centreA) + 0.02;
	grp.userData.cupY = cupY;
	const cupWall = new THREE.Mesh(
		new THREE.CylinderGeometry(hole.cupR, hole.cupR, CUP_D, 28, 1, true),
		new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 1, side: THREE.BackSide }),
	);
	cupWall.position.set(hole.cup.x, cupY - CUP_D / 2, hole.cup.z);
	grp.add(cupWall);
	const cupFloor = new THREE.Mesh(
		new THREE.CircleGeometry(hole.cupR, 28),
		new THREE.MeshBasicMaterial({ color: 0x0a0806 }),
	);
	cupFloor.rotation.x = -Math.PI / 2;
	cupFloor.position.set(hole.cup.x, cupY - CUP_D, hole.cup.z);
	grp.add(cupFloor);
	// The rim sits on top of the dish, which now starts at the cup radius — a thin ring at
	// the same height just z-fought with it and the hole lost its edge.
	const cupRing = new THREE.Mesh(
		new THREE.RingGeometry(hole.cupR, hole.cupR + 0.34, 28),
		new THREE.MeshBasicMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide }),
	);
	cupRing.rotation.x = -Math.PI / 2;
	cupRing.position.set(hole.cup.x, cupY + 0.06, hole.cup.z);
	cupRing.renderOrder = 1;
	grp.add(cupRing);

	// ---- Flag: an actual vertical pole, the main landmark once the camera tilts.
	const pole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.09, 0.09, 7, 8),
		new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
	);
	pole.position.set(hole.cup.x, cupY + 3.5, hole.cup.z);
	pole.castShadow = true;
	grp.add(pole);
	const cloth = new THREE.Mesh(
		new THREE.PlaneGeometry(2.2, 1.3),
		new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide, roughness: 0.8 }),
	);
	cloth.position.set(hole.cup.x + 1.1, cupY + 6.3, hole.cup.z);
	grp.add(cloth);

	// ---- Obstacles: a stone socle on the exact footprint, a little building on top.
	const spin: THREE.Object3D[] = [];
	const fade: Overhead[] = [];
	for (const ob of hole.obstacles) {
		const q = ob.pts;
		const base = q.map((p) => surfaceY(hole, p.x, p.z, relief, bankv));
		// flat top even on a banked lane, so the building above sits level
		const topY = Math.max(...base) + SOCLE_H;
		const opos: number[] = [];
		for (let k = 0; k < 4; k++) {
			const a = q[k], b = q[(k + 1) % 4];
			opos.push(a.x, base[k], a.z, a.x, topY, a.z, b.x, topY, b.z);
			opos.push(a.x, base[k], a.z, b.x, topY, b.z, b.x, base[(k + 1) % 4], b.z);
		}
		opos.push(q[0].x, topY, q[0].z, q[1].x, topY, q[1].z, q[2].x, topY, q[2].z);
		opos.push(q[0].x, topY, q[0].z, q[2].x, topY, q[2].z, q[3].x, topY, q[3].z);
		const socle = new THREE.Mesh(stripGeom(opos), pmat(0x9c9184, 0.95));
		socle.castShadow = true;
		socle.receiveShadow = true;
		grp.add(socle);

		const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
		const cz = (q[0].z + q[1].z + q[2].z + q[3].z) / 4;
		const L = Math.hypot(q[2].x - q[1].x, q[2].z - q[1].z); // along the lane
		const D = Math.hypot(q[1].x - q[0].x, q[1].z - q[0].z); // across it
		const ax = (q[2].x - q[1].x) / L, az = (q[2].z - q[1].z) / L;
		const ix = (q[1].x - q[0].x) / D, iz = (q[1].z - q[0].z) / D; // toward the lane interior
		let th = Math.atan2(-az, ax);
		if (Math.sin(th) * ix + Math.cos(th) * iz < 0) th += Math.PI; // local +Z must face the lane
		const rnd = mulberry32(propSeed(cx, cz));

		let prop: THREE.Group;
		if (ob.kind === 'pier') {
			prop = buildFootbridge(pmat, L, D, W[nearestSample(hole, cx, cz)] + PAVE);
			fade.push({ mat: prop.userData.fadeMat as THREE.MeshStandardMaterial, x: cx, z: cz });
		} else if (D < 1.9 || L / D > 2.4) prop = buildCottage(pmat, L, D, rnd); // a tower would not cover a long thin footprint
		else if (rnd() < 0.5) prop = buildWindmill(pmat, L, D, rnd, spin);
		else prop = buildTower(pmat, L, D, rnd);
		prop.position.set(cx, topY, cz);
		prop.rotation.y = th;
		prop.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
		grp.add(prop);
	}
	if (spin.length) grp.userData.spin = spin;
	if (fade.length) grp.userData.fade = fade;

	// ---- Water + bridge, from the engine's own data (the flat game already drew them).
	// A pond dug under the arch, not a river across the scene: it only has to explain the
	// hump, and a short hole with a river through it looked absurd.
	let stream: { x: number; z: number; r: number } | null = null;
	if (hole.water && hole.bridge) {
		const { lo, hi } = hole.bridge;
		const mid = Math.round((lo + hi) / 2);
		const pm = path[mid];
		// Deck underside, so the arch is a real opening rather than a hole in the wall.
		const spos: number[] = [];
		for (let i = lo; i < hi; i++) {
			const a = edge(i, 1), b = edge(i, -1), c = edge(i + 1, 1), d = edge(i + 1, -1);
			push(spos, [a.x, a.y - DECK, a.z], [b.x, b.y - DECK, b.z], [d.x, d.y - DECK, d.z], [c.x, c.y - DECK, c.z]);
		}
		grp.add(new THREE.Mesh(stripGeom(spos), wallMat));

		const along = Math.hypot(path[hi].x - path[lo].x, path[hi].z - path[lo].z) * 0.5 + 4;
		const across = W[mid] + PAVE + 10;
		grp.userData.pond = { x: pm.x, z: pm.z, r: Math.max(along, across) * 1.12 };
		// The lawn is one big plane we cannot cut, so the basin is built up rather than dug:
		// water just above the grass, held by a low stone kerb.
		const surf = gy + 0.04;
		const kerbTop = gy + 0.55;
		const rim = (ang: number, k: number, y: number): [number, number, number] => [
			pm.x + pm.dirX * along * k * Math.cos(ang) + pm.nx * across * k * Math.sin(ang),
			y,
			pm.z + pm.dirZ * along * k * Math.cos(ang) + pm.nz * across * k * Math.sin(ang),
		];
		stream = { x: pm.x, z: pm.z, r: Math.max(along, across) };
		const SEGP = 32;
		const wp: number[] = [], bp: number[] = [];
		for (let k = 0; k < SEGP; k++) {
			const a0 = (k / SEGP) * Math.PI * 2, a1 = ((k + 1) / SEGP) * Math.PI * 2;
			wp.push(pm.x, surf, pm.z, ...rim(a0, 1, surf), ...rim(a1, 1, surf));
			push(bp, rim(a0, 1, surf), rim(a1, 1, surf), rim(a1, 1, kerbTop), rim(a0, 1, kerbTop));
			push(bp, rim(a0, 1, kerbTop), rim(a1, 1, kerbTop), rim(a1, 1.1, kerbTop), rim(a0, 1.1, kerbTop));
			push(bp, rim(a0, 1.1, kerbTop), rim(a1, 1.1, kerbTop), rim(a1, 1.1, gy - 0.2), rim(a0, 1.1, gy - 0.2));
		}
		grp.add(new THREE.Mesh(stripGeom(bp), new THREE.MeshStandardMaterial({
			color: 0x9d9284, roughness: 1, side: THREE.DoubleSide,
		})));
		grp.add(new THREE.Mesh(stripGeom(wp), new THREE.MeshStandardMaterial({
			color: 0x2f7fd6, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
		})));
	}

	// ---- Planting. At a low camera the course floats on an empty plain. Flowers hug the
	// paving, shrubs sit behind them, trees stay well back — close conifers looked like toys.
	grp.add(plant(hole, gy, opts.decor ?? 1400, stream));

	return grp;
}

/** Ball visual radius — the drawn sphere, not the physics one. */
export const BALL_R_VIS = PARAMS.ballR * BALL_VIS;
