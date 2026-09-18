/**
 * PETANQUE — 3D drawing layer (three.js). The engine stays pure: this file only turns the
 * heightfield, the pebbles and the boules into a lit scene, and predicts the arc.
 *
 * Engine coords (x: 0..PITCH_W, y: 0..PITCH_L, z = height in metres) map to world
 * (x = ex - PITCH_W/2, y = ez, z = ey - PITCH_L/2). World +Y is up, as three.js expects.
 */
import * as THREE from 'three';
import {
	type Terrain, type SurfaceId, PITCH_W, PITCH_L, CELL, heightAt,
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

/* ---------- procedural textures (ComfyUI art replaces these in M9) ---------- */

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

/** Vertical sky gradient on a big inward-facing sphere. */
function skyTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = 4;
	c.height = 256;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const grad = g.createLinearGradient(0, 0, 0, 256);
	grad.addColorStop(0, '#3f8fd6');
	grad.addColorStop(0.55, '#9fd0ef');
	grad.addColorStop(0.78, '#e6e2c8');
	grad.addColorStop(1, '#b8a97e');
	g.fillStyle = grad;
	g.fillRect(0, 0, 4, 256);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

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

/* ---------- the pitch ---------- */

export interface Pitch3D {
	group: THREE.Group;
	groundMat: THREE.MeshStandardMaterial;
	sky: THREE.Mesh;
	dispose(): void;
}

/**
 * The whole static scene for one terrain: sky, apron, displaced ground, planks, pebbles.
 * Built once per deal and never touched again — nothing here is rebuilt per frame.
 */
export function buildPitch3D(t: Terrain): Pitch3D {
	const grp = new THREE.Group();
	const junk: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(o: T): T => { junk.push(o); return o; };

	const skyGeo = keep(new THREE.SphereGeometry(SURROUND * 3, 24, 16));
	const sky = new THREE.Mesh(skyGeo, keep(new THREE.MeshBasicMaterial({ map: keep(skyTexture()), side: THREE.BackSide, depthWrite: false })));
	sky.renderOrder = -1;
	grp.add(sky);

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

	geo.computeVertexNormals();
	const uv = geo.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * PITCH_W, uv.getY(i) * PITCH_L); // 1 tile = 1 m

	const grains = t.surface.id === 'sable' ? 2600 : 1400;
	const dot = t.surface.id === 'gravier-gros' ? 3.4 : t.surface.id === 'gravier-fin' ? 2.2 : 1.5;
	const groundMat = new THREE.MeshStandardMaterial({ map: keep(groundTexture(t.surface.id, grains, dot)), roughness: 1, metalness: 0 });
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
		sky,
		dispose() {
			for (const d of junk) d.dispose();
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

export const CIRCLE_R = 0.25; // m — the official throwing circle is 35 to 50 cm across

/**
 * A ring laid ON the ground: every vertex is sampled on the heightfield. A flat disc does not work
 * here — the relief is a few centimetres and the ring spans half a metre (six metres for the jack
 * window), so a flat one sinks under the terrain over most of its arc and reads as missing.
 */
export function groundRing(t: Terrain, cx: number, cy: number, r: number, color: number, tube = 0.022): THREE.Mesh {
	const n = Math.max(48, Math.round(r * 24));
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
		pts.push(new THREE.Vector3(wx(x), heightAt(t, x, y) + tube, wz(y)));
	}
	const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), n, tube, 5, true);
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
	m.renderOrder = 4;
	return m;
}

/* ---------- camera ---------- */

export const CAM_PITCH_MIN = 0.07; // rad — grazing, eye almost at boule height
export const CAM_PITCH_MAX = 1.05; // rad — looking down at the lane
const ELEV_LOW = 0.17; // rad of loft from a plunging camera: a roulette
const ELEV_HIGH = 0.92; // ...and from a grazing one: a full lob

/**
 * The hook that makes this game its own: the camera IS the loft control. A grazing view throws
 * high, a plunging view rolls it in. Kept here so the HUD gauge and the physics read one function.
 */
export const elevationForPitch = (pitch: number): number => {
	const k = (pitch - CAM_PITCH_MIN) / (CAM_PITCH_MAX - CAM_PITCH_MIN);
	const c = k < 0 ? 0 : k > 1 ? 1 : k;
	return ELEV_HIGH + (ELEV_LOW - ELEV_HIGH) * c;
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
 * `walk` is how far up the lane the player has stepped to read the head, and it deliberately does
 * NOT touch `pitch`: pitch is the loft control, so walking up to look must never change the throw.
 * `fpv` stands the eye up at head height instead of floating it behind the shoulder — it keeps a
 * reduced shoulder offset on purpose, because an eye exactly on the throw line flattens the arc to
 * a straight segment and hides the whole mechanic (measurement J).
 *
 * The caller aims the look direction itself, so no lookAt here.
 */
export function aimCamera(cam: THREE.PerspectiveCamera, circle: { x: number; y: number }, dir: 1 | -1, pitch: number, yaw: number, dist: number, ground: number, walk = 0, fpv = false): void {
	const fx = Math.sin(yaw) * dir, fz = Math.cos(yaw) * dir; // forward, in engine axes
	const back = fpv ? FPV_BACK : dist * Math.cos(pitch);
	const side = fpv ? SHOULDER * 0.55 : SHOULDER;
	const up = fpv ? EYE_H : 0.35 + dist * Math.sin(pitch);
	cam.position.set(
		wx(circle.x) + fx * (walk - back) + fz * side,
		ground + up,
		wz(circle.y) + fz * (walk - back) - fx * side,
	);
}

/** Frame the whole pitch — used for the replay/overview shot between throws. */
export function overviewCamera(cam: THREE.PerspectiveCamera, focus: { x: number; y: number }): void {
	cam.position.set(wx(focus.x) - 1.2, 5.4, wz(focus.y) - 5.2);
	cam.lookAt(wx(focus.x), 0, wz(focus.y));
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

/** Warm midday sun plus a sky bounce. Shadows are what make the relief readable. */
export function addLights(scene: THREE.Scene): { dispose(): void } {
	scene.add(new THREE.HemisphereLight(0xdcefff, 0x6b5a3a, 1.0));
	const sun = new THREE.DirectionalLight(0xfff0d4, 1.9);
	sun.position.set(6, 9, -4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.02;
	sun.shadow.radius = 3;
	const cam = sun.shadow.camera as THREE.OrthographicCamera;
	cam.left = -PITCH_L / 2; cam.right = PITCH_L / 2;
	cam.top = PITCH_L / 2; cam.bottom = -PITCH_L / 2;
	cam.near = 0.5; cam.far = 40;
	cam.updateProjectionMatrix();
	scene.add(sun);
	scene.add(sun.target);
	return { dispose: () => { scene.remove(sun); scene.remove(sun.target); sun.dispose(); } };
}

export { BOULE_R, JACK_R, CELL, speed3, isSettled };
