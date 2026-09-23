/**
 * PETANQUE — 3D drawing layer (three.js). The engine stays pure: this file only turns the
 * heightfield, the pebbles and the boules into a lit scene, and predicts the arc.
 *
 * Engine coords (x: 0..PITCH_W, y: 0..PITCH_L, z = height in metres) map to world
 * (x = ex - PITCH_W/2, y = ez, z = ey - PITCH_L/2). World +Y is up, as three.js expects.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
	type Terrain, type SurfaceId, PITCH_W, PITCH_L, CELL, heightAt, hashN,
} from './terrain';
import {
	type Sim, type Boule, BOULE_R, JACK_R, cloneSim, stepSim, speed2, speed3, isSettled,
} from './engine';

export const wx = (ex: number): number => ex - PITCH_W / 2;
export const wz = (ey: number): number => ey - PITCH_L / 2;

const SEG_X = 56; // ground mesh resolution — 7 cm steps, finer than the eye can read at this scale
const SEG_Z = 210;
const SURROUND = 26; // radius of the flat apron the pitch sits in
const BORDER_H = 0.08; // the wooden planks around a real boulodrome
const BORDER_W = 0.09;

export const SIDE_COLORS = [0xd9dee6, 0x8a5a3c]; // steel boules vs bronze boules
export const JACK_COLOR = 0xe8732a;

const SURFACE_TINT: Record<SurfaceId, [number, number]> = {
	'terre-battue': [0xb5763f, 0x8a5426],
	'gravier-fin': [0x9a988f, 0x77746c],
	'gravier-gros': [0x6f6a61, 0x4a463f],
	sable: [0xe0c489, 0xc4a468],
};

/* ---------- textures ---------- */

// ComfyUI tiles (scripts/comfy-petanque.mjs, gated by measure-petanque-tex.mjs). Loaded once for
// the session and shared by every deal; the procedural grain below stays as the map until the
// file lands, and for good when it never does (offline before the image cache has it).
const tilePool = new Map<string, Promise<THREE.Texture>>();

function loadTile(file: string): Promise<THREE.Texture> {
	const url = `/assets/jeux/petanque/${file}`;
	let p = tilePool.get(url);
	if (!p) {
		p = new THREE.TextureLoader().loadAsync(url).then((t) => {
			t.wrapS = t.wrapT = THREE.RepeatWrapping;
			t.colorSpace = THREE.SRGBColorSpace;
			t.anisotropy = 8;
			return t;
		});
		p.catch(() => tilePool.delete(url)); // a failed load may succeed on the next deal
		tilePool.set(url, p);
	}
	return p;
}

const hexOf = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/**
 * Seamless grain for one surface. Deliberately grain only — no painted shadows and no painted
 * stones: the light comes from three.js and the stones are real geometry that really deviates a
 * boule. A painted stone would lie to the player.
 */
function groundTexture(id: SurfaceId, grains: number, dot: number): THREE.CanvasTexture {
	const S = 256;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const [base, dark] = SURFACE_TINT[id];
	g.fillStyle = hexOf(base);
	g.fillRect(0, 0, S, S);
	let h = 0x2f6b21;
	const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) | 0; return ((h >>> 8) & 0xffffff) / 0xffffff; };
	for (let k = 0; k < grains; k++) {
		const x = rnd() * S, y = rnd() * S, r = dot * (0.4 + rnd());
		g.fillStyle = rnd() < 0.5 ? hexOf(dark) : '#ffffff';
		g.globalAlpha = 0.10 + rnd() * 0.16;
		g.beginPath();
		// Draw every dot four times across the seam so the tile wraps without a visible grid.
		for (const ox of [0, x > S - r * 2 ? -S : S]) for (const oy of [0, y > S - r * 2 ? -S : S]) {
			g.moveTo(x + ox + r, y + oy);
			g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
		}
		g.fill();
	}
	g.globalAlpha = 1;
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 8;
	return tex;
}

/** A soft round blot. The painted shadow under the decor, and the contact shadow under a boule. */
function blobTexture(): THREE.CanvasTexture {
	const S = 128;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
	// Not a linear falloff: a linear one has a visible rim where it reaches zero, and a rim is the
	// one thing a shadow must not have — it reads as a painted disc, which is what this replaces.
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.45, 'rgba(255,255,255,0.78)');
	grad.addColorStop(0.75, 'rgba(255,255,255,0.26)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, S, S);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

let blobMap: THREE.CanvasTexture | null = null;
const blob = (): THREE.CanvasTexture => (blobMap ??= blobTexture());

/** A boule's fine machined grooves, as a bump-ish roughness pattern. */
function bouleTexture(): THREE.CanvasTexture {
	const S = 128;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	g.fillStyle = '#b4b4b4';
	g.fillRect(0, 0, S, S);
	g.strokeStyle = 'rgba(255,255,255,0.55)';
	g.lineWidth = 1;
	for (let i = 0; i < S; i += 4) {
		g.beginPath();
		g.moveTo(0, i);
		g.lineTo(S, i + S * 0.25);
		g.stroke();
	}
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	return tex;
}

/* ---------- the sun ---------- */

const D2R = Math.PI / 180;
export const SUN_EL_MIN = 10 * D2R;
export const SUN_EL_MAX = 46 * D2R;
const SUN_NOMINAL = 35 * D2R; // the elevation every number in addLights was measured at
const DIRECT_FLAT = 2.6 * Math.sin(SUN_NOMINAL); // what an up-facing normal got at that elevation

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export interface SunSetup {
	el: number; // rad above the horizon
	az: number; // rad in the ground plane, 0 = +X (across the lane), ±PI/2 = down the lane
	dir: THREE.Vector3; // unit, from the pitch TOWARDS the sun
	color: THREE.Color;
	intensity: number;
	skyColor: THREE.Color;
	groundColor: THREE.Color;
	hemi: number;
	turbidity: number;
	rayleigh: number;
	clouds: number;
	cloudSeed: number;
}

/**
 * One sun per deal, off the terrain seed. Both ends of the range are constraints, not taste:
 *
 * - it stops climbing at 46 deg. A boule's cast shadow is offset by r/tan(elevation), so past ~50 deg
 *   it retreats under the boule and the body goes back to reading as a sticker — the complaint the
 *   fixed 35 deg sun was chosen to answer in the first place (the table in addLights).
 * - a LOW sun stays near the lateral. The lane runs along Z and the ends alternate, so "behind the
 *   player" is not a stable half of the sky: a sunset nobody has to squint into has to be off BOTH
 *   ends, which leaves the sides. The budget opens as the sun climbs and is gone by the top.
 *
 * Consequence, measured rather than assumed (scripts/measure-petanque-sun.mjs): the sun is never on
 * screen. The lateral rule holds it 48 deg off the lane at best, the field covers ~29, and the game
 * view is aimed at the ground — 0 of 70 reachable positions land in frame, even tilted fully up.
 * That is why there is no lens flare: it could not fire. Move the azimuth and that changes.
 *
 * Below 20 deg the scene really does dim: full compensation would need intensity 8.6 at 10 deg, which
 * blows out every surface that faces the sun to buy a flat ground that never changes. Capped instead,
 * and the sky bounce warms and lifts to meet it — a sunset is supposed to be darker than an afternoon.
 */
export function sunFor(seed: number): SunSetup {
	const el = mix(SUN_EL_MIN, SUN_EL_MAX, hashN(11, seed));
	const k = (el - SUN_EL_MIN) / (SUN_EL_MAX - SUN_EL_MIN);
	const spread = mix(42, 90, k) * D2R; // how far off the lateral the azimuth may stray
	const az = (hashN(12, seed) * 2 - 1) * spread + (hashN(13, seed) < 0.5 ? 0 : Math.PI);
	const warm = Math.max(0, Math.min(1, (20 * D2R - el) / (10 * D2R)));
	return {
		el,
		az,
		dir: new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)),
		color: new THREE.Color(0xfff0d4).lerp(new THREE.Color(0xff9c52), warm),
		intensity: Math.min(4.5, DIRECT_FLAT / Math.sin(el)),
		skyColor: new THREE.Color(0xdcefff).lerp(new THREE.Color(0xffc9a0), warm),
		groundColor: new THREE.Color(0x6b5a3a).lerp(new THREE.Color(0x7a5230), warm),
		hemi: mix(1.0, 1.4, warm),
		turbidity: mix(2.2, 6.5, hashN(14, seed)),
		rayleigh: mix(1.1, 2.8, hashN(15, seed)),
		clouds: mix(0.12, 0.52, hashN(16, seed)),
		/* The cloud pattern is seeded and then FROZEN. Sky.js drifts it off a `time` uniform, and at
		   the stock speed that is ~12 noise units over a two-minute end — visible, and it would make
		   every pixel probe in scripts/ unreproducible. One deal, one sky. */
		cloudSeed: hashN(17, seed) * 4000,
	};
}

/* ---------- the decor ---------- */

const DECOR_NEAR = 7.0; // m from the centre — nothing stands closer, the eye walks 9 m up the lane
const DECOR_FAR = 23.0; // m — inside the apron, so nothing floats off its edge
const LANE_KEEP = 4.6; // m either side of the lane axis: the far end has to stay readable

/**
 * Trees, bushes and two benches around the ground. Purely cosmetic and placed off `t.seed`, so a
 * replay draws the same boulodrome — but also the reason the far end stops reading as a void: with
 * nothing but a flat apron out there the eye has no scale and the long throws all looked the same.
 */
function buildDecor(grp: THREE.Group, seed: number, y: number, sun: SunSetup, keep: <T extends { dispose(): void }>(o: T) => T): void {
	/* The decor's shadows are PAINTED, not cast. The shadow camera is fitted tight to the 4x15 m
	   pitch so a 7.5 cm boule gets the texels it needs; a 23 m decor ring in the same map is a 10x
	   wider box, which buys a tree shadow by throwing away the boule shadow this whole file was
	   re-tuned to save. Everything out there stands on the APRON, which is a flat disc — the usual
	   objection to a flat decal (it sinks under the relief) has no receiver here to be true of.
	   Declared cost: a painted shadow falls on the apron only, never on another tree or on a plank. */
	const blots: { x: number; z: number; h: number; r: number }[] = [];

	/* Anywhere on the apron ring except the corridor the lane is read down. Rejected spots are
	   simply skipped — pushing them sideways instead piles decor along the keep-out line. */
	const spots: { x: number; z: number; r: number }[] = [];
	for (let k = 0; k < 64; k++) {
		const a = hashN(k, seed ^ 0x51a3) * Math.PI * 2;
		const d = DECOR_NEAR + hashN(k, seed ^ 0x2b7f) * (DECOR_FAR - DECOR_NEAR);
		const x = Math.cos(a) * d, z = Math.sin(a) * d;
		if (Math.abs(x) < LANE_KEEP && Math.abs(z) < PITCH_L / 2 + 3) continue;
		spots.push({ x, z, r: hashN(k, seed ^ 0x77c1) });
	}

	const trees = spots.filter((_, i) => i % 3 === 0);
	const bushes = spots.filter((_, i) => i % 3 !== 0);

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const fill = (inst: THREE.InstancedMesh, at: (i: number) => [THREE.Vector3, THREE.Vector3]): void => {
		for (let i = 0; i < inst.count; i++) {
			const [p, s] = at(i);
			m.compose(p, q, s);
			inst.setMatrixAt(i, m);
		}
		inst.instanceMatrix.needsUpdate = true;
		grp.add(inst);
		keep({ dispose: () => inst.dispose() });
	};

	if (trees.length) {
		const trunkGeo = keep(new THREE.CylinderGeometry(0.13, 0.19, 1, 6));
		trunkGeo.translate(0, 0.5, 0); // pivot at the foot, so one scale sets the height
		const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x6d5741, roughness: 0.95 }));
		const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
		fill(trunks, (i) => {
			const t0 = trees[i], h = 2.4 + t0.r * 2.2;
			return [new THREE.Vector3(t0.x, y, t0.z), new THREE.Vector3(1, h, 1)];
		});

		// Two blobs a tree: one sphere reads as a lollipop at this distance, three cost a draw call
		// each for a silhouette nobody can tell apart.
		const leafGeo = keep(new THREE.IcosahedronGeometry(1, 1));
		const leafMat = keep(new THREE.MeshStandardMaterial({ color: 0x4d7a3c, roughness: 1, flatShading: true }));
		const leaves = new THREE.InstancedMesh(leafGeo, leafMat, trees.length * 2);
		fill(leaves, (i) => {
			const t0 = trees[i >> 1], h = 2.4 + t0.r * 2.2, up = (i & 1) === 1;
			const rad = up ? 0.85 + t0.r * 0.5 : 1.15 + t0.r * 0.6;
			return [
				new THREE.Vector3(t0.x + (up ? 0.3 : -0.2), y + h + (up ? 0.85 : 0.15), t0.z + (up ? -0.25 : 0.2)),
				new THREE.Vector3(rad, rad * 0.86, rad),
			];
		});
		// The crown is what casts: thrown from the middle of the foliage, not from the foot.
		for (const t0 of trees) {
			const h = 2.4 + t0.r * 2.2;
			blots.push({ x: t0.x, z: t0.z, h: h + 0.5, r: 1.2 + t0.r * 0.6 });
		}
	}

	if (bushes.length) {
		const bushGeo = keep(new THREE.IcosahedronGeometry(1, 0));
		const bushMat = keep(new THREE.MeshStandardMaterial({ color: 0x5d7a3a, roughness: 1, flatShading: true }));
		const inst = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
		fill(inst, (i) => {
			const b = bushes[i], rad = 0.35 + b.r * 0.55;
			return [new THREE.Vector3(b.x, y + rad * 0.45, b.z), new THREE.Vector3(rad, rad * 0.7, rad)];
		});
		for (const b of bushes) blots.push({ x: b.x, z: b.z, h: (0.35 + b.r * 0.55) * 0.5, r: 0.4 + b.r * 0.55 });
	}

	// Two benches, one each side, square to the pitch — the only straight lines out there, and what
	// tells you the trees are trees and not shrubs seen from close up.
	const woodMat = keep(new THREE.MeshStandardMaterial({ color: 0x7d5c39, roughness: 0.9 }));
	const seatGeo = keep(new THREE.BoxGeometry(1.7, 0.08, 0.42));
	const legGeo = keep(new THREE.BoxGeometry(0.1, 0.42, 0.38));
	for (const s of [-1, 1] as const) {
		const bx = s * (PITCH_W / 2 + 2.6);
		const seat = new THREE.Mesh(seatGeo, woodMat);
		seat.position.set(bx, y + 0.45, s * 2.2);
		seat.rotation.y = Math.PI / 2;
		grp.add(seat);
		for (const e of [-1, 1] as const) {
			const leg = new THREE.Mesh(legGeo, woodMat);
			leg.position.set(bx, y + 0.21, s * 2.2 + e * 0.7);
			grp.add(leg);
		}
		blots.push({ x: bx, z: s * 2.2, h: 0.45, r: 0.75 });
	}

	if (blots.length) {
		const geo = keep(new THREE.PlaneGeometry(2, 2));
		geo.rotateX(-Math.PI / 2); // local +x runs along world +x, local +y along world +z
		const mat = keep(new THREE.MeshBasicMaterial({
			map: blob(), color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false,
		}));
		const inst = new THREE.InstancedMesh(geo, mat, blots.length);
		inst.renderOrder = 1; // over the apron, under every ring and ray the HUD draws on the ground
		const sx = -Math.cos(sun.az), sz = -Math.sin(sun.az); // away from the sun, in the ground plane
		const reach = Math.tan(Math.PI / 2 - sun.el); // how far a metre of height throws its shadow
		fill(inst, (i) => {
			const b = blots[i];
			/* Clamped to the apron's own edge rather than to a constant: a low sun throws a 5 m
			   shadow off a tall tree, and the far ones would end up painted past the rim and
			   hanging over the sky. Measured per instance, so no magic number goes stale if the
			   decor ring or the apron moves. */
			const room = Math.max(0, SURROUND - Math.hypot(b.x, b.z) - b.r);
			const off = Math.min(b.h * reach, room);
			const long = Math.min(b.r + off * 0.5, b.r + room * 0.5);
			return [
				new THREE.Vector3(b.x + sx * off * 0.5, y + 0.012, b.z + sz * off * 0.5),
				new THREE.Vector3(long, 1, b.r),
			];
		});
		// `fill` composes with the identity quaternion, so the stretch has to be turned by hand.
		const m = new THREE.Matrix4(), q = new THREE.Quaternion();
		const p = new THREE.Vector3(), s = new THREE.Vector3();
		for (let i = 0; i < inst.count; i++) {
			inst.getMatrixAt(i, m);
			m.decompose(p, q, s);
			q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-sz, sx));
			inst.setMatrixAt(i, m.compose(p, q, s));
		}
		inst.instanceMatrix.needsUpdate = true;
	}
}

/* ---------- the pitch ---------- */

export interface Pitch3D {
	group: THREE.Group;
	groundMat: THREE.MeshStandardMaterial;
	dispose(): void;
}

/**
 * The whole static scene for one terrain: apron, displaced ground, planks, pebbles, decor.
 * Built once per deal and never touched again — nothing here is rebuilt per frame.
 * The sky is not here: it belongs to the sun, which outlives the pitch (see addLights).
 */
export function buildPitch3D(t: Terrain, sun: SunSetup): Pitch3D {
	const grp = new THREE.Group();
	const junk: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(o: T): T => { junk.push(o); return o; };

	// Ground: one displaced plane, ~12 k triangles. Re-displacing it every frame would be the
	// single easiest way to lose mobile, so it is built here and left alone.
	const geo = keep(new THREE.PlaneGeometry(PITCH_W, PITCH_L, SEG_X, SEG_Z));
	geo.rotateX(-Math.PI / 2);
	const pos = geo.attributes.position as THREE.BufferAttribute;
	let low = 0;
	for (let i = 0; i < pos.count; i++) {
		const h = heightAt(t, pos.getX(i) + PITCH_W / 2, pos.getZ(i) + PITCH_L / 2);
		pos.setY(i, h);
		if (h < low) low = h;
	}
	pos.needsUpdate = true;

	/* The apron the pitch is cut into, seated under the LOWEST point of the ground. A fixed -6 cm
	   looked fine down the lane but the faux plat drops the far end further than that, so the
	   apron punched up through the pitch in ragged green patches — only visible from overhead. */
	const apronMat = keep(new THREE.MeshStandardMaterial({ color: 0x6f7a46, roughness: 1 }));
	const apron = new THREE.Mesh(keep(new THREE.CircleGeometry(SURROUND, 40)), apronMat);
	apron.rotation.x = -Math.PI / 2;
	apron.position.y = low - 0.06;
	apron.receiveShadow = true;
	grp.add(apron);

	buildDecor(grp, t.seed, apron.position.y, sun, keep);

	geo.computeVertexNormals();
	const uv = geo.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * PITCH_W, uv.getY(i) * PITCH_L); // 1 tile = 1 m

	const grains = t.surface.id === 'sable' ? 2600 : 1400;
	const dot = t.surface.id === 'gravier-gros' ? 3.4 : t.surface.id === 'gravier-fin' ? 2.2 : 1.5;
	const groundMat = new THREE.MeshStandardMaterial({ map: keep(groundTexture(t.surface.id, grains, dot)), roughness: 1, metalness: 0 });
	let disposed = false;
	// Same tint as the procedural grain, so the swap changes the grain, never the colour.
	loadTile(`sol-${t.surface.id}.webp`).then((tex) => {
		if (disposed) return; // the deal changed while the file was on its way
		groundMat.map = tex;
		groundMat.needsUpdate = true;
	}, () => { /* keep the procedural grain */ });
	const ground = new THREE.Mesh(geo, groundMat);
	ground.receiveShadow = true;
	grp.add(ground);

	// Planks around the pitch — they frame it and, at a grazing camera, they are the reference
	// line that makes the faux plat readable. Without them the relief reads as a rendering glitch.
	const plankMat = keep(new THREE.MeshStandardMaterial({ color: 0x6b4b2e, roughness: 0.85 }));
	// Sunk down to the apron for the same reason: a fixed bottom left the low end of the slope
	// hovering, with daylight under the plank. The top stays put, only the buried part grows.
	const deep = BORDER_H - low + 0.06;
	const midY = deep / 2 - 0.03 - (deep - BORDER_H);
	const longGeo = keep(new THREE.BoxGeometry(BORDER_W, deep, PITCH_L + BORDER_W * 2));
	const shortGeo = keep(new THREE.BoxGeometry(PITCH_W + BORDER_W * 2, deep, BORDER_W));
	for (const s of [-1, 1] as const) {
		const a = new THREE.Mesh(longGeo, plankMat);
		a.position.set(s * (PITCH_W / 2 + BORDER_W / 2), midY, 0);
		a.castShadow = true; a.receiveShadow = true;
		grp.add(a);
		const b = new THREE.Mesh(shortGeo, plankMat);
		b.position.set(0, midY, s * (PITCH_L / 2 + BORDER_W / 2));
		b.castShadow = true; b.receiveShadow = true;
		grp.add(b);
	}

	// Pebbles: the ones you see are exactly the ones the engine can deflect a boule on.
	if (t.pebbles.length) {
		const pGeo = keep(new THREE.IcosahedronGeometry(1, 0));
		// Untextured on purpose. A mottled ComfyUI tile was made, wired and measured from the game view
		// on coarse gravel: 0.0025 levels of difference, against 0.3-0.8 for the ground tiles. A stone
		// is 5-12 px on screen, so its texture mipmaps down to its own mean colour.
		const pMat = keep(new THREE.MeshStandardMaterial({ color: SURFACE_TINT[t.surface.id][1], roughness: 0.95, flatShading: true }));
		const inst = new THREE.InstancedMesh(pGeo, pMat, t.pebbles.length);
		inst.castShadow = false; // 1500 shadow casters is the whole frame budget, for 1 cm stones
		inst.receiveShadow = false;
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const e = new THREE.Euler();
		for (let k = 0; k < t.pebbles.length; k++) {
			const p = t.pebbles[k];
			e.set(p.x * 7.3, p.y * 4.1, p.r * 311); // any stable spread — a stone has no right way up
			q.setFromEuler(e);
			m.compose(
				new THREE.Vector3(wx(p.x), heightAt(t, p.x, p.y) + p.r * 0.35, wz(p.y)),
				q,
				new THREE.Vector3(p.r, p.r * 0.7, p.r),
			);
			inst.setMatrixAt(k, m);
		}
		inst.instanceMatrix.needsUpdate = true;
		grp.add(inst);
		junk.push({ dispose: () => inst.dispose() });
	}

	return {
		group: grp,
		groundMat,
		dispose() {
			disposed = true;
			for (const d of junk) d.dispose(); // pooled tiles are shared across deals: never here
			groundMat.dispose();
		},
	};
}

/* ---------- boules, jack, circle ---------- */

let bouleMap: THREE.CanvasTexture | null = null;

export function makeBouleMesh(side: 0 | 1 | -1): THREE.Mesh {
	const jack = side === -1;
	const geo = new THREE.SphereGeometry(jack ? JACK_R : BOULE_R, jack ? 16 : 26, jack ? 12 : 20);
	if (!bouleMap) bouleMap = bouleTexture();
	const mat = jack
		? new THREE.MeshStandardMaterial({ color: JACK_COLOR, roughness: 0.75, metalness: 0 })
		// High metalness with no envMap looks "too dark" but MEASURES best: at 10 m a boule is 5 px,
		// and dropping metalness to 0 lifts the steel one to luma 133 against a 131 ground — gone.
		: new THREE.MeshStandardMaterial({ color: SIDE_COLORS[side], roughnessMap: bouleMap, roughness: 0.38, metalness: 0.85 });
	const m = new THREE.Mesh(geo, mat);
	m.castShadow = true;
	m.receiveShadow = false;
	return m;
}

const CONTACT_LIFT = 0.008; // m of clearance, so the decal never fights the ground it sits on

/**
 * The darkening right under a body, which the shadow map does not draw: a cast shadow is directional
 * and walks away as the sun climbs, and "the boules do not read" was always loudest at the top of
 * that range. This is the ambient half — an occlusion term that sits under the body at every sun
 * angle, which is what lets the sun vary at all.
 *
 * Small on purpose. Sampled ground rings exist in this file because a flat one spanning half a metre
 * sinks under the relief; this one spans 16 cm and is tilted onto the local normal instead, which is
 * two heightAt pairs a frame rather than a rebuilt mesh.
 */
export function makeContactShadow(r: number): THREE.Mesh {
	const geo = new THREE.PlaneGeometry(2, 2);
	geo.rotateX(-Math.PI / 2);
	const mat = new THREE.MeshBasicMaterial({
		map: blob(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
	});
	const m = new THREE.Mesh(geo, mat);
	m.scale.setScalar(r * 2.1);
	m.renderOrder = 2; // over the ground, under the halo that names whose boule it is
	return m;
}

const N_UP = new THREE.Vector3(0, 1, 0);
const N_TMP = new THREE.Vector3();

/** Lay a flat decal on the heightfield at (x, y), tilted onto the local slope. */
export function layFlat(m: THREE.Mesh, t: Terrain, x: number, y: number): void {
	const d = CELL;
	const hx = heightAt(t, x + d, y) - heightAt(t, x - d, y);
	const hy = heightAt(t, x, y + d) - heightAt(t, x, y - d);
	N_TMP.set(-hx, 2 * d, -hy).normalize();
	m.quaternion.setFromUnitVectors(N_UP, N_TMP);
	m.position.set(wx(x), heightAt(t, x, y) + CONTACT_LIFT, wz(y));
}

export const CIRCLE_R = 0.25; // m — the official throwing circle is 35 to 50 cm across

/**
 * A ring laid ON the ground: every vertex is sampled on the heightfield. A flat disc does not work
 * here — the relief is a few centimetres and the ring spans half a metre (six metres for the jack
 * window), so a flat one sinks under the terrain over most of its arc and reads as missing.
 */
export function groundRing(t: Terrain, cx: number, cy: number, r: number, color: number, tube = 0.022, opacity = 1): THREE.Mesh {
	const n = Math.max(48, Math.round(r * 24));
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
		pts.push(new THREE.Vector3(wx(x), heightAt(t, x, y) + tube, wz(y)));
	}
	const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), n, tube, 5, true);
	// `depthWrite: false` on the see-through ones: six of them cross, and a tube that wrote depth
	// would punch a hole in every ring drawn after it.
	const mat = new THREE.MeshBasicMaterial(opacity < 1
		? { color, transparent: true, opacity, depthWrite: false }
		: { color });
	const m = new THREE.Mesh(geo, mat);
	m.renderOrder = 4;
	return m;
}

/* ---------- camera ---------- */

export const ELEV_LOW = 0.17; // rad — a roulette, thrown from the bottom of the board
export const ELEV_HIGH = 1.22; // rad (70 deg) — a full plomb, thrown from the top

/**
 * The launch board: where the finger lands in the throwing strip IS the loft, `t` running 0 at the
 * bottom of the strip to 1 at its top. The camera used to decide this, which tied aiming a plomb to
 * putting the eye on the ground — exactly where you can no longer see what you are aiming at.
 *
 * Declared cost of ELEV_HIGH at 70 deg: with MAX_SPEED unchanged, `v² sin(2e) / g` gives a full
 * plomb a 7.2 m carry, so the far end of the legal 6-10 m jack window needs a flatter throw. 60 deg
 * still reaches 9.7 m. That trade is the point — it is learnable, and raising the speed instead
 * would move a power curve that was measured.
 */
export const elevationForBoard = (t: number): number => {
	const c = t < 0 ? 0 : t > 1 ? 1 : t;
	return ELEV_LOW + (ELEV_HIGH - ELEV_LOW) * c;
};

/** The board position a loft came from — for the HUD gauge and for replaying a network aim. */
export const boardForElevation = (elev: number): number => {
	const t = (elev - ELEV_LOW) / (ELEV_HIGH - ELEV_LOW);
	return t < 0 ? 0 : t > 1 ? 1 : t;
};

/* Step the eye off the throw line, over the thrower's shoulder. Dead centre puts the whole
   parabola in a vertical plane through the camera, so it projects to a straight segment and the
   loft — the mechanic this game is built on — is invisible. Measured bow, lob/mid/roulette:
   0/0/0 px on the line, 146/45/11 px one shoulder out. */
const SHOULDER = 0.55; // m

export const EYE_H = 1.58; // m — a standing player's eye, for the first-person view
export const WALK_MAX = 9.0; // m up the lane: far enough to stand over the longest legal head
const FPV_BACK = 0.35; // the first-person eye stands just behind the circle, not on it

/**
 * Stand the camera behind the circle, looking down the lane. `yaw` is the lateral swing.
 *
 * `walk` is how far up the lane the player has stepped to read the head. The camera is free: it
 * carries no part of the throw since the loft moved to the launch board.
 * `walkDir` is the ground axis the feet travel along; it defaults to the yaw heading so every call
 * that omits it is unchanged. The zoom passes the circle-to-head axis instead, because a yaw swung
 * to its limit leaves metres of lateral error at 8 m and the end-of-travel distance would not be
 * `ZOOM_DIST` any more.
 * `fpv` stands the eye up at `eyeH` instead of floating it behind the shoulder — it keeps a
 * reduced shoulder offset on purpose, because an eye exactly on the throw line flattens the arc to
 * a straight segment and hides the whole mechanic (measurement J).
 *
 * `shoulder` picks the side the eye steps to; -1 mirrors it, and the arc then bows the other way.
 *
 * The caller aims the look direction itself, so no lookAt here.
 */
export function aimCamera(cam: THREE.PerspectiveCamera, circle: { x: number; y: number }, dir: 1 | -1, pitch: number, yaw: number, dist: number, ground: number, walk = 0, fpv = false, walkDir?: { x: number; y: number }, eyeH = EYE_H, shoulder: 1 | -1 = 1): void {
	const fx = Math.sin(yaw) * dir, fz = Math.cos(yaw) * dir; // forward, in engine axes
	const wxd = walkDir ? walkDir.x : fx, wzd = walkDir ? walkDir.y : fz;
	const back = fpv ? FPV_BACK : dist * Math.cos(pitch);
	const side = (fpv ? SHOULDER * 0.55 : SHOULDER) * shoulder;
	const up = fpv ? eyeH : 0.35 + dist * Math.sin(pitch);
	cam.position.set(
		wx(circle.x) + wxd * walk - fx * back + fz * side,
		ground + up,
		wz(circle.y) + wzd * walk - fz * back - fx * side,
	);
}

/* ---------- zoom ---------- */

/* Measured in a 620x388 canvas — the page everyone lands on, NOT fullscreen: a boule 8 m out is
   4.9 px across. Readability is `BOULE_R / tan(vfov/2) * H / m`, so the fix has to move both
   terms. Walking to 1.5 m carries 5.3x, narrowing to 26 deg carries the rest.
   `ZOOM_EYE` is the other half of it: the eye height is part of the distance, and a standing
   1.58 m eye 1.5 m out is really 2.15 m from the boule. The player crouches instead. */
export const ZOOM_DIST = 1.5; // m of ground between the eye and the head at full zoom
export const ZOOM_EYE = 0.95; // m — crouched
/* A chosen stop, not an aspect conversion, so it deliberately sits below VFOV_MIN and never goes
   through verticalFov(). Lowering VFOV_MIN instead would narrow the Tete view too. */
export const ZOOM_VFOV = 26;

/** How far the feet travel for a zoom of `t`, so that at `t = 1` the eye sits `ZOOM_DIST` out. */
export function zoomWalk(reach: number, t: number): number {
	return Math.max(0, reach - ZOOM_DIST + FPV_BACK) * t;
}

/* ---------- field of view ---------- */

/* Measured at 1000x760: a boule 13 m out was 4 px across at the stock 58 deg vertical. What the
   player actually reads is the width of the lane, so intent is written horizontally and converted
   per aspect. The upper clamp is the stock value on purpose: a portrait phone is already spending
   its whole field on sky, and widening it there would make the very case that hurts worse. */
export const VFOV_MIN = 34;
export const VFOV_MAX = 58;

export function verticalFov(hfovDeg: number, aspect: number): number {
	const v = (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
	return Math.max(VFOV_MIN, Math.min(VFOV_MAX, v));
}

/* The halo radius was tuned at 58 deg. Apparent size is constant in distance but NOT in fov, so
   narrowing the view would fatten every ring unless the fov is divided back out. */
const HALO_REF_TAN = Math.tan((VFOV_MAX * Math.PI) / 360);

export function haloRadius(dist: number, fovDeg: number, perM: number, minR: number): number {
	const k = Math.tan((fovDeg * Math.PI) / 360) / HALO_REF_TAN;
	return Math.max(minR, dist * perM) * k;
}

/* The floor is the one term the fov division above does NOT reach: `minR` is already in world
   metres, so a floored halo keeps a fixed size while the boule it rings grows as 1/tan(fov/2).
   At full zoom that put the ring inside the boule. Scale the floor the same way, and it holds its
   apparent size at every field. */
export const haloFloorFor = (minR: number, fovDeg: number): number =>
	(minR * HALO_REF_TAN) / Math.tan((fovDeg * Math.PI) / 360);

/* ---------- inspection cameras ---------- */

export const HEAD_DIST_MIN = 1.8;
export const HEAD_DIST_MAX = 7.0;
export const HEAD_PITCH_MIN = 0.18;
export const HEAD_PITCH_MAX = 1.25;

/**
 * Orbit an eye around the head. Its yaw and pitch are its own on purpose: this view must never
 * read or write the aim yaw or the camera pitch, because that pitch is the loft.
 */
export function headCamera(cam: THREE.PerspectiveCamera, focus: { x: number; y: number }, yaw: number, pitch: number, dist: number, ground: number, pan?: { x: number; y: number }): void {
	const c = Math.cos(pitch);
	const ex = wx(focus.x) - Math.sin(yaw) * dist * c;
	const ey = Math.max(ground + 0.45, ground + dist * Math.sin(pitch));
	const ez = wz(focus.y) - Math.cos(yaw) * dist * c;
	const tx = wx(focus.x), ty = ground + 0.1, tz = wz(focus.y);
	if (!pan || (pan.x === 0 && pan.y === 0)) {
		cam.position.set(ex, ey, ez);
		cam.lookAt(tx, ty, tz);
		return;
	}
	/* A pan in CAMERA space: the eye and its target move together, so the picture slides across the
	   frame and nothing about the shot itself changes. That is what lets a panel own a corner of the
	   screen without the subject moving — the subject stays put and the frame steps aside. */
	const fwd = new THREE.Vector3(tx - ex, ty - ey, tz - ez).normalize();
	const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
	const up = new THREE.Vector3().crossVectors(right, fwd);
	const ox = right.x * pan.x + up.x * pan.y;
	const oy = right.y * pan.x + up.y * pan.y;
	const oz = right.z * pan.x + up.z * pan.y;
	cam.position.set(ex + ox, ey + oy, ez + oz);
	cam.lookAt(tx + ox, ty + oy, tz + oz);
}

const TOP_TILT = 1.15; // rad off horizontal — not straight down, so the relief still reads
const TOP_MARGIN = 1.12;

/**
 * Frame a span centred on `focus` rather than guess an offset. The fixed offset this replaced
 * followed the jack, so a jack thrown off the pitch dragged the eye out with it and left the
 * player with the legal window behind the camera.
 *
 * The tilt is what makes this non-obvious: at TOP_TILT the frame is not a rectangle on the ground,
 * and sizing it as if the eye looked straight down puts the NEAR edge behind the camera. So the
 * height is solved from the near edge in camera space, which is the binding one at every aspect.
 *
 * Reads `fov` and `aspect`, so it must be called after the frame's fov is set.
 */
export function topCamera(cam: THREE.PerspectiveCamera, focus: { x: number; y: number }, dir: 1 | -1, along: number, across: number, ground: number): void {
	const vt = Math.tan((cam.fov * Math.PI) / 360);
	const st = Math.sin(TOP_TILT), ct = Math.cos(TOP_TILT);
	const n = along / 2, w = across / 2;
	// Near edge, vertically: depth = h/st − n·ct, offset = n·st, and |offset/depth| must stay under vt.
	const hv = (n * st * (st + vt * ct)) / vt;
	// Same edge, horizontally — it is the shallowest point, so it is where width runs out first.
	const hh = st * (w / (vt * cam.aspect) + n * ct);
	const h = Math.max(hv, hh) * TOP_MARGIN;
	cam.position.set(wx(focus.x), ground + h, wz(focus.y) - dir * (h / Math.tan(TOP_TILT)));
	cam.lookAt(wx(focus.x), ground, wz(focus.y));
}

/**
 * A span anchored on the circle and reaching `far` metres up the lane, for the top view. Anchoring
 * on the circle rather than on what you are looking at is the point: while the jack is being placed
 * by hand it is still live wherever the bad throw left it, so centring on it walked the eye off the
 * pitch and left the legal window behind the camera.
 */
export function laneFrame(circle: { x: number; y: number }, dir: 1 | -1, far: number): { focus: { x: number; y: number }; along: number } {
	const along = far + 2.5;
	return { focus: { x: circle.x, y: circle.y + dir * (along / 2 - 1) }, along };
}

/* ---------- aim prediction ---------- */

export interface ThrowPrediction {
	air: THREE.Vector3[]; // the flight, world coords
	land: THREE.Vector3 | null; // where it first touches down — the donnee
	roll: THREE.Vector3[]; // a DELIBERATELY short piece of the roll
	blocked: boolean; // it would hit a boule before landing
}

const PREVIEW_ROLL = 0.6; // m of roll shown. Showing all of it would solve the game for the player.
const PRED_DT = 1 / 90;
const PRED_MAX = 900;

/**
 * The arc, simulated with the real engine on a clone. Two consequences that matter: the preview
 * cannot promise anything the physics will not deliver, and the grain counter of the live sim is
 * never advanced by looking at a shot.
 */
export function predictThrow(s: Sim, from: { x: number; y: number }, v: { vx: number; vy: number; vz: number }, mk: (c: Sim) => Boule): ThrowPrediction {
	const c = cloneSim(s);
	const b = mk(c);
	b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
	b.rolling = false;
	c.bs.push(b);

	const air: THREE.Vector3[] = [new THREE.Vector3(wx(b.x), b.z, wz(b.y))];
	const roll: THREE.Vector3[] = [];
	let land: THREE.Vector3 | null = null;
	let rolled = 0;
	let px = b.x, py = b.y;
	let blocked = false;

	for (let k = 0; k < PRED_MAX; k++) {
		const r = stepSim(c, PRED_DT);
		if (!b.live) break;
		if (!land) {
			air.push(new THREE.Vector3(wx(b.x), b.z, wz(b.y)));
			if (r.hitBoule) { blocked = true; break; }
			if (r.landed) { land = new THREE.Vector3(wx(b.x), b.z - b.r, wz(b.y)); px = b.x; py = b.y; }
			continue;
		}
		rolled += Math.sqrt((b.x - px) ** 2 + (b.y - py) ** 2);
		px = b.x; py = b.y;
		roll.push(new THREE.Vector3(wx(b.x), b.z - b.r * 0.6, wz(b.y)));
		if (rolled > PREVIEW_ROLL || speed2(b) === 0 || r.hitBoule) break;
	}
	return { air, land, roll, blocked };
}

/**
 * The opponent's aim, drawn as a line laid ON the ground from their circle to where their throw
 * would land. Deliberately NOT their arc: `predictThrow` replays the whole engine, and the aim
 * stream lands about twelve times a second, so drawing their real parabola would spend the frame
 * budget on someone else's guesswork. This is pure geometry and carries what actually matters —
 * their direction and their length.
 */
export function aimRay(t: Terrain, cx: number, cy: number, hx: number, hy: number, len: number, color: number): THREE.Mesh {
	const n = 24;
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i <= n; i++) {
		const d = (i / n) * len;
		const x = cx + hx * d, y = cy + hy * d;
		pts.push(new THREE.Vector3(wx(x), heightAt(t, x, y) + 0.02, wz(y)));
	}
	const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.026, 5, false);
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
	m.renderOrder = 7;
	return m;
}

/** A fat tube along a polyline. Rebuilt per aim change, not per frame. */
export function arcMesh(pts: THREE.Vector3[], color: number, r: number): THREE.Mesh | null {
	if (pts.length < 2) return null;
	const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(80, pts.length), r, 6, false);
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
	m.renderOrder = 8;
	return m;
}

/**
 * A ground ring that keeps a body findable at the far end of the lane. At the aim camera's 58 deg
 * over a 700 px canvas, a jack sitting 10 m out is 1.9 px across and a boule 4.7 px — unreadable,
 * and the player cannot judge the point from dots that size. The ring is scaled by distance so it
 * holds ~20 px, and it is a MARKER: the bodies keep their true size, so nothing lies about physics.
 * Unit radius, so `scale` is metres.
 */
export function makeHalo(color: number): THREE.Mesh {
	const geo = new THREE.RingGeometry(0.78, 1, 24);
	geo.rotateX(-Math.PI / 2);
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
	m.renderOrder = 7;
	return m;
}

/** The ring drawn on the donnee — the point the player is actually aiming at. */
export function makeMarker(color: number): THREE.Mesh {
	const geo = new THREE.RingGeometry(0.1, 0.14, 28);
	geo.rotateX(-Math.PI / 2);
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
	m.renderOrder = 9;
	return m;
}

/* ---------- dust and shock rings ---------- */

const DUST_MAX = 200;
const DUST_LIFE = 0.7;
const RING_MAX = 6;
const RING_LIFE = 0.4;

export interface Fx {
	puff(x: number, y: number, z: number, speed: number, color: number): void;
	ring(x: number, y: number, z: number, color: number): void;
	update(dt: number): void;
	stats(): { dust: number; rings: number; bornDust: number; bornRings: number };
	dispose(): void;
}

export function makeFx(scene: THREE.Scene): Fx {
	const pos = new Float32Array(DUST_MAX * 3);
	const col = new Float32Array(DUST_MAX * 3);
	const vel = new Float32Array(DUST_MAX * 3);
	const life = new Float32Array(DUST_MAX);
	const tint = new Float32Array(DUST_MAX * 3);
	pos.fill(-999);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	const mat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
	const cloud = new THREE.Points(geo, mat);
	cloud.frustumCulled = false;
	cloud.renderOrder = 12;
	scene.add(cloud);
	let next = 0;
	let bornDust = 0, bornRings = 0;
	let seedN = 0x1f35;
	const rnd = () => { seedN = (Math.imul(seedN ^ (seedN >>> 15), 2246822519) + 0x9e3779b9) | 0; return ((seedN >>> 8) & 0xffffff) / 0xffffff; };

	const ringGeo = new THREE.RingGeometry(0.8, 1, 26);
	ringGeo.rotateX(-Math.PI / 2);
	const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number }[] = [];
	for (let i = 0; i < RING_MAX; i++) {
		const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
		const mesh = new THREE.Mesh(ringGeo, rm);
		mesh.visible = false;
		mesh.renderOrder = 10;
		scene.add(mesh);
		rings.push({ mesh, mat: rm, age: Infinity });
	}
	let rNext = 0;
	const c = new THREE.Color();

	return {
		puff(x, y, z, speed, color) {
			const n = Math.min(16, 3 + Math.floor(speed * 1.6));
			bornDust += n;
			c.set(color);
			for (let k = 0; k < n; k++) {
				const i = next; next = (next + 1) % DUST_MAX;
				const a = rnd() * Math.PI * 2;
				const out = (0.25 + rnd() * 0.7) * (0.4 + speed * 0.12);
				pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
				vel[i * 3] = Math.cos(a) * out;
				vel[i * 3 + 1] = 0.35 + rnd() * (0.5 + speed * 0.06);
				vel[i * 3 + 2] = Math.sin(a) * out;
				tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
				life[i] = DUST_LIFE * (0.6 + rnd() * 0.5);
			}
		},
		ring(x, y, z, color) {
			const r = rings[rNext]; rNext = (rNext + 1) % RING_MAX;
			bornRings++;
			r.age = 0;
			r.mat.color.set(color);
			r.mesh.position.set(x, y + 0.01, z);
			r.mesh.visible = true;
		},
		update(dt) {
			for (let i = 0; i < DUST_MAX; i++) {
				if (life[i] <= 0) continue;
				life[i] -= dt;
				if (life[i] <= 0) { pos[i * 3 + 1] = -999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
				vel[i * 3 + 1] -= 1.6 * dt; // dust is light: it hangs, it does not fall like a spark
				pos[i * 3] += vel[i * 3] * dt;
				pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
				pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
				const f = life[i] / DUST_LIFE;
				col[i * 3] = tint[i * 3] * f; col[i * 3 + 1] = tint[i * 3 + 1] * f; col[i * 3 + 2] = tint[i * 3 + 2] * f;
			}
			(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
			(geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
			for (const r of rings) {
				if (r.age >= RING_LIFE) { r.mesh.visible = false; continue; }
				r.age += dt;
				const e = r.age / RING_LIFE;
				const sc = 0.12 + e * 0.5;
				r.mesh.scale.set(sc, sc, sc);
				r.mat.opacity = 0.7 * (1 - e) ** 1.5;
			}
		},
		stats() {
			let dust = 0, alive = 0;
			for (let i = 0; i < DUST_MAX; i++) if (life[i] > 0) dust++;
			for (const r of rings) if (r.mesh.visible) alive++;
			return { dust, rings: alive, bornDust, bornRings };
		},
		dispose() {
			scene.remove(cloud);
			geo.dispose();
			mat.dispose();
			for (const r of rings) { scene.remove(r.mesh); r.mat.dispose(); }
			ringGeo.dispose();
		},
	};
}

/* ---------- lights ---------- */

/**
 * Warm afternoon sun plus a sky bounce. Shadows are what make the relief readable — and what makes a
 * boule read as a sphere instead of a sticker, which is not the same thing and was the harder one.
 *
 * The sun is now seeded per deal (sunFor) and this whole block is re-run for it, but the table below
 * is why its range stops where it does. It was measured at a fixed 35 deg, which is still the middle
 * of that range and still the reference every constant here carries.
 *
 * 35 deg, not overhead. A boule's contact shadow is offset by r/tan(elevation), so at
 * the old 51 deg that was 3 cm — under one radius — and the shadow hid behind the boule itself. The
 * body was always correctly shaded; nothing tied it to the ground. Measured on the ground under a
 * boule at 2.4 m, against a 2.0 floor taken on bare ground beside it:
 *
 *     origin 51 deg / normalBias 0.02 / square box / radius 3   12.1 levels
 *     35 deg                                                    17.3
 *     + normalBias 0.002                                        24.8
 *     + fitted box                                              27.9
 *     + intensity 2.6                                           35.8
 *     + radius 1.5                                              44.5
 *
 * Intensity went 1.9 -> 2.6 because an up-facing normal receives sin(elevation): that puts the ground
 * back at the exact level it had before the sun moved (130), and deepens the shadow at the same time,
 * since shadow depth is the direct/ambient ratio. Instrument: scripts/measure-petanque-boule.mjs.
 */
export interface Lights {
	/** Re-aim everything for one deal. `force` is the measurement hook, in radians.
	 *  Its `seed` overrides the deal's for the haze and the clouds, which are seeded too — without it
	 *  two runs of the same probe compare two skies and call the difference a change. */
	setSun(seed: number, force?: { el: number; az: number; seed?: number }): SunSetup;
	current(): SunSetup;
	/** Measurement hook. 0 gives the raw, untone-mapped dome — the control row for SKY_EXPOSURE, so
	 *  before and after come out of ONE build at one framing instead of two runs. Negative restores
	 *  the shipped value, which the probe must not carry a copy of. */
	setSkyExposure(v: number): void;
	dispose(): void;
}

const SUN_DIST = 30; // m — only has to clear the pitch; the shadow camera's near plane rides on it
/* Picked on the `ciel` sweep in scripts/snap-petanque-phone.mjs, mean colour of the dome with the
   HUD hidden, at the two ends of the elevation range:
     exposure   sun 46 deg          sun 10 deg
     raw        lum 255  sat  1 %   (white — the control row the probe still prints)
     0.15       lum 161  sat 40 %   lum  63  sat 43 %
     0.25       lum 190  sat 35 %   lum  81  sat 41 %
     0.35       lum 207  sat 30 %   lum  95  sat 40 %
     0.50       lum 224  sat 25 %   lum 111  sat 38 %
   Saturation is what "blue sky" means here and it only ever falls as the exposure rises, so the
   choice is the lowest one whose dusk sky is not night: 0.15 reads as an hour later than it is. */
const SKY_EXPOSURE = 0.25;

export function addLights(scene: THREE.Scene): Lights {
	const hemi = new THREE.HemisphereLight(0xdcefff, 0x6b5a3a, 1.0);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(0xfff0d4, 2.6);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0004;
	// 2 cm of normal offset on a 3.75 cm boule pushes most of the contact shadow off. This read as a
	// dead knob while the sun was at 51 deg — there was no shadow left for it to eat.
	sun.shadow.normalBias = 0.002;
	sun.shadow.radius = 1.5;
	scene.add(sun);
	scene.add(sun.target);

	/* The Preetham sky from three's addons rather than a canvas gradient: it is the same handful of
	   uniforms the sun already carries, so a low sun reddens the horizon and lifts a glow around
	   itself for free — a gradient would need that painted in by hand and it would not track the
	   azimuth. No asset, so nothing new to precache and nothing to go missing offline. */
	const sky = new Sky();
	sky.scale.setScalar(SURROUND * 20);
	/* Sky.js is authored for a tone-mapped renderer — its own example runs ACES at exposure 0.5 — and
	   this one has none, so the dome came out flat white at every sun above the horizon. Turning on
	   tone mapping globally would move the ground, the shadow depths and every number measured in this
	   file at once, so the curve is applied to the sky alone: same exponential shape, scoped to the one
	   material that needs it. Exposure picked by scripts/snap-petanque-phone.mjs (the `ciel` lines). */
	sky.material.uniforms.skyExposure = { value: SKY_EXPOSURE };
	sky.material.fragmentShader = `uniform float skyExposure;\n${sky.material.fragmentShader}`
		.replace('gl_FragColor = vec4( texColor, 1.0 );',
			'gl_FragColor = vec4( skyExposure > 0.0 ? vec3( 1.0 ) - exp( -texColor * skyExposure ) : texColor, 1.0 );');
	scene.add(sky);

	let now = sunFor(0);

	const setSun = (seed: number, force?: { el: number; az: number; seed?: number }): SunSetup => {
		const s = sunFor(force?.seed ?? seed);
		if (force) {
			s.el = force.el;
			s.az = force.az;
			s.dir.set(Math.cos(s.az) * Math.cos(s.el), Math.sin(s.el), Math.sin(s.az) * Math.cos(s.el));
			s.intensity = Math.min(4.5, DIRECT_FLAT / Math.sin(s.el));
		}
		now = s;
		hemi.color.copy(s.skyColor);
		hemi.groundColor.copy(s.groundColor);
		hemi.intensity = s.hemi;
		sun.color.copy(s.color);
		sun.intensity = s.intensity;
		sun.position.copy(s.dir).multiplyScalar(SUN_DIST);

		const u = sky.material.uniforms;
		u.sunPosition.value.copy(s.dir);
		u.turbidity.value = s.turbidity;
		u.rayleigh.value = s.rayleigh;
		u.cloudCoverage.value = s.clouds;
		u.time.value = s.cloudSeed;

		/* Fit the shadow box to the pitch in LIGHT space rather than to a square that circumscribes
		   it. A boule is 7.5 cm, so its contact shadow is only ~10 texels wide at 15 m / 2048 — half
		   of them were being spent on empty apron. Re-fitted on every sun, which is the whole reason
		   it was derived from the direction and not written out as four numbers. */
		const cam = sun.shadow.camera as THREE.OrthographicCamera;
		const right = new THREE.Vector3(0, 1, 0).cross(s.dir).normalize();
		const up = s.dir.clone().cross(right).normalize();
		let ex = 0, ey = 0;
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				const c = new THREE.Vector3((sx * PITCH_W) / 2 + sx * BORDER_W, 0, (sz * PITCH_L) / 2 + sz * BORDER_W);
				ex = Math.max(ex, Math.abs(c.dot(right)));
				ey = Math.max(ey, Math.abs(c.dot(up)));
			}
		}
		cam.left = -ex; cam.right = ex;
		cam.top = ey + BORDER_H; cam.bottom = -ey - BORDER_H;
		// The box now travels with the sun, so both planes have to as well: a 10 deg sun stands the
		// light 30 m out and almost on the ground, where a fixed far of 40 clipped half the pitch.
		cam.near = 0.5; cam.far = SUN_DIST + PITCH_L;
		cam.updateProjectionMatrix();
		return s;
	};
	setSun(0);

	return {
		setSun,
		current: () => now,
		setSkyExposure(v) { sky.material.uniforms.skyExposure.value = v < 0 ? SKY_EXPOSURE : v; },
		dispose() {
			scene.remove(hemi); scene.remove(sun); scene.remove(sun.target); scene.remove(sky);
			hemi.dispose(); sun.dispose();
			sky.geometry.dispose();
			sky.material.dispose();
		},
	};
}

export { BOULE_R, JACK_R, CELL, speed3, isSettled };
