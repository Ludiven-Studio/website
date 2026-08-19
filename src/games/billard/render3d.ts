/**
 * BILLARD — 3D drawing layer (three.js). The engine (see ./engine) stays pure 2D:
 * this file only turns the top-down table + balls into a lit 3D scene and predicts the
 * cue's aim line. Engine coords (x: 0..w, y: 0..h) map to world (x = ex - w/2,
 * z = ey - h/2); the felt sits at world y = 0 and a ball's centre at y = BALL_R.
 */
import * as THREE from 'three';
import { BALL_R, stepBalls, aimToVelocity, type Table, type Ball, type Vec } from './engine';

export const CUE_COLOR = 0xf4f4f2;
export const BALL_COLORS = [0xe6566f, 0xf0a830, 0x5b8def, 0x2f9e6f, 0x9b6cf0, 0x20c4c0];

const FELT = 0x0f7a52;
const WOOD = 0x5a3722;
const WOOD_DARK = 0x3a2416;

/** Cosmetic table skin — 'tron' is the cocoin-shop neon theme. Physics never sees it. */
export type TableSkin = 'classic' | 'tron';
export const TRON = {
	background: 0x05070d,
	felt: 0x0a1424,
	frame: 0x101a2e,
	body: 0x0a0f1e,
	neonInner: 0x35e8ff, // cushion edge — Tron cyan
	neonOuter: 0xff8c2a, // outer frame — Tron orange
};
const BORDER = 13; // wooden frame width around the felt (holds the pocket mouths)
const RAIL_H = 2 * BALL_R; // rail top above the felt
const BODY_H = 9; // table body thickness under the felt
const LEG_H = 32; // legs raise the table off the floor
const LEG_W = 9;
const POCKET_D = 8; // how deep a pocket sinks below the felt

// Corner signs for the framing math.
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** Ball sphere. Cue is white; colour balls carry their palette colour. (Arcade / Défi only.) */
export function makeBallMesh(color: number, glow = false): THREE.Mesh {
	const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
	const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.04 });
	if (glow) mat.emissive.copy(new THREE.Color(color).multiplyScalar(0.4));
	const m = new THREE.Mesh(geo, mat);
	m.castShadow = true;
	m.receiveShadow = false;
	return m;
}

/** A cue stick, lying along local +X with the tip at x=0 (butt at +X). The caller positions and
 *  swings it during the strike animation; hidden the rest of the time. */
export function makeCueStick(): THREE.Group {
	const g = new THREE.Group();
	const L = 82, tipR = 0.55, buttR = 1.7;
	const alongX = (geo: THREE.CylinderGeometry, cx: number) => { geo.rotateZ(-Math.PI / 2); geo.translate(cx, 0, 0); return geo; };
	const shaft = new THREE.Mesh(
		alongX(new THREE.CylinderGeometry(buttR, tipR, L, 16), L / 2), // radiusTop=butt (+X), radiusBottom=tip (x=0)
		new THREE.MeshStandardMaterial({ color: 0xcaa06a, roughness: 0.5, metalness: 0.05 }),
	);
	shaft.castShadow = true;
	g.add(shaft);
	g.add(new THREE.Mesh( // pale ferrule + tip at the striking end
		alongX(new THREE.CylinderGeometry(tipR + 0.15, tipR, 2, 16), 1),
		new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.6 }),
	));
	g.add(new THREE.Mesh( // darker wrap near the butt
		alongX(new THREE.CylinderGeometry(buttR + 0.05, buttR * 0.82, L * 0.28, 16), L - L * 0.14),
		new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.5 }),
	));
	g.visible = false;
	g.renderOrder = 13;
	return g;
}

/* ---------- 8-ball: numbered / striped balls ---------- */

// Real pool hues by number (1-7 solids, 8 black). Stripes 9-15 reuse hues 1-7.
const BALL8_COLORS: Record<number, number> = {
	1: 0xf6c026, 2: 0x1f5fd6, 3: 0xd8352a, 4: 0x7a3fa0, 5: 0xef7d1a, 6: 0x1f8a4c, 7: 0x7a2432, 8: 0x18181a,
};
const hueOf = (n: number): number => (n <= 8 ? BALL8_COLORS[n] : BALL8_COLORS[n - 8]);
export const ball8Hue = hueOf; // for the FX layer (trail colours)

/** Canvas texture for one pool ball (solid / stripe / 8 / cue), mapped onto the sphere. */
export function makeBallTexture(number: number): THREE.CanvasTexture {
	const S = 128;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
	if (number <= 0) { // cue
		g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, S, S);
		g.fillStyle = '#e04030'; g.beginPath(); g.arc(S / 2, S / 2, 5, 0, Math.PI * 2); g.fill();
	} else if (number >= 9) { // stripe: white ball with a coloured band across the equator
		g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, S, S);
		g.fillStyle = hex(hueOf(number)); g.fillRect(0, S * 0.32, S, S * 0.36);
	} else { // solid / 8
		g.fillStyle = hex(BALL8_COLORS[number]); g.fillRect(0, 0, S, S);
	}
	if (number > 0) { // white number spot
		g.fillStyle = '#f8f8f5'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.19, 0, Math.PI * 2); g.fill();
		g.fillStyle = '#141414'; g.font = `bold ${Math.round(S * 0.22)}px system-ui, sans-serif`;
		g.textAlign = 'center'; g.textBaseline = 'middle';
		g.fillText(String(number), S / 2, S * 0.53);
	}
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

/** Sphere textured for its pool number (cue = number ≤ 0). Caller disposes geo+mat+map. */
export function makeBall8Mesh(number: number, glow = false): THREE.Mesh {
	const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
	const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(number), roughness: 0.22, metalness: 0.04 });
	if (glow) { mat.emissiveMap = mat.map; mat.emissive.set(0x555f6e); } // glow through its own pattern
	const m = new THREE.Mesh(geo, mat);
	m.castShadow = true;
	m.receiveShadow = false;
	return m;
}

export interface Table3D {
	group: THREE.Group;
	feltMat: THREE.MeshStandardMaterial; // texture attached by the caller once loaded
	floorMat: THREE.MeshStandardMaterial;
	dispose(): void;
}

/**
 * The whole static scenery: floor, table body, felt, cushioned rails with pocket gaps,
 * and the six pockets. Built once — makeTable() never changes between racks.
 */
export function buildTable3D(table: Table, skin: TableSkin = 'classic'): Table3D {
	const { w, h } = table;
	const hw = w / 2, hh = h / 2;
	const tron = skin === 'tron';
	const grp = new THREE.Group();
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

	// Floor the table stands on — tiled texture attached later, flat brown until then.
	// Tron gets its own generated grid, so the caller must NOT attach the wood textures.
	const floorMat = new THREE.MeshStandardMaterial({ color: tron ? 0xffffff : 0x3a2a1c, roughness: 1 });
	if (tron) {
		const c = document.createElement('canvas');
		c.width = c.height = 64;
		const g2 = c.getContext('2d') as CanvasRenderingContext2D;
		g2.fillStyle = '#04060c'; g2.fillRect(0, 0, 64, 64);
		g2.strokeStyle = '#0d3242'; g2.lineWidth = 2; g2.strokeRect(1, 1, 62, 62);
		const tex = keep(new THREE.CanvasTexture(c));
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(30, 50);
		tex.colorSpace = THREE.SRGBColorSpace;
		floorMat.map = tex;
	}
	const floorGeo = keep(new THREE.PlaneGeometry(w * 6, h * 10));
	const floor = new THREE.Mesh(floorGeo, floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = -(BODY_H + LEG_H);
	floor.receiveShadow = true;
	grp.add(floor);

	// Table body: a wood block just under the felt, matching the frame footprint.
	const foX = hw + BORDER, foZ = hh + BORDER;
	const bodyMat = keep(new THREE.MeshStandardMaterial({ color: tron ? TRON.body : WOOD_DARK, roughness: 0.7 }));
	const bodyHalfX = foX - 2, bodyHalfZ = foZ - 2; // inset so the rounded frame hides its sharp corners
	const bodyGeo = keep(new THREE.BoxGeometry(bodyHalfX * 2, BODY_H, bodyHalfZ * 2));
	const body = new THREE.Mesh(bodyGeo, bodyMat);
	body.position.y = -BODY_H / 2 - 0.1;
	body.castShadow = true;
	body.receiveShadow = true;
	grp.add(body);

	// Four legs down to the floor, inset from the corners.
	const legGeo = keep(new THREE.BoxGeometry(LEG_W, LEG_H, LEG_W));
	const legX = bodyHalfX - LEG_W / 2 - 3, legZ = bodyHalfZ - LEG_W / 2 - 3;
	for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
		const leg = new THREE.Mesh(legGeo, bodyMat);
		leg.position.set(sx * legX, -BODY_H - LEG_H / 2, sz * legZ);
		leg.castShadow = true;
		leg.receiveShadow = true;
		grp.add(leg);
	}

	// Rounded outer outline shared by the felt bed and the wood frame — its rounded corners are why
	// the felt no longer pokes out past the wood at the four corners (a plain rectangle did).
	const OR = 16; // outer corner radius (generous, to soften the boxy look)
	const buildOuter = (): THREE.Shape => {
		const s = new THREE.Shape();
		s.moveTo(-foX + OR, -foZ);
		s.lineTo(foX - OR, -foZ);
		s.quadraticCurveTo(foX, -foZ, foX, -foZ + OR);
		s.lineTo(foX, foZ - OR);
		s.quadraticCurveTo(foX, foZ, foX - OR, foZ);
		s.lineTo(-foX + OR, foZ);
		s.quadraticCurveTo(-foX, foZ, -foX, foZ - OR);
		s.lineTo(-foX, -foZ + OR);
		s.quadraticCurveTo(-foX, -foZ, -foX + OR, -foZ);
		return s;
	};

	// Felt bed — the rounded footprint, so green shows through the pocket mouths cut into the frame
	// but never past the frame's rounded outer corners. UVs normalised so the felt texture tiles.
	const feltMat = new THREE.MeshStandardMaterial({ color: tron ? TRON.felt : FELT, roughness: tron ? 0.85 : 0.95, metalness: 0 });
	const feltGeo = keep(new THREE.ShapeGeometry(buildOuter(), 12));
	feltGeo.computeBoundingBox();
	const fbb = feltGeo.boundingBox!;
	const fpos = feltGeo.attributes.position, fuv = feltGeo.attributes.uv;
	for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fpos.getX(i) - fbb.min.x) / (fbb.max.x - fbb.min.x), (fpos.getY(i) - fbb.min.y) / (fbb.max.y - fbb.min.y));
	fuv.needsUpdate = true;
	feltGeo.rotateX(-Math.PI / 2); // shape XY plane → lie flat, matching the frame's orientation
	const felt = new THREE.Mesh(feltGeo, feltMat);
	felt.position.y = 0.01;
	felt.receiveShadow = true;
	grp.add(felt);

	// Continuous wooden frame, EXTRUDED from a shape whose inner contour is scalloped at each
	// pocket — the frame stays continuous (real corners) while the six mouths are truly cut out
	// and open on top. Rounded outer corners for a softer, prettier rail.
	const Rc = 8, Rm = 6.5; // corner / middle pocket opening radii
	const contour: THREE.Vector2[] = [];
	const arc = (cx: number, cz: number, r: number, a0: number, a1: number) => {
		const N = 16;
		for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * (i / N); contour.push(new THREE.Vector2(cx + r * Math.cos(a), cz + r * Math.sin(a))); }
	};
	arc(-hw, -hh, Rc, Math.PI / 2, 2 * Math.PI);   // top-left (270° outward bulge)
	arc(0, -hh, Rm, Math.PI, 2 * Math.PI);         // top-middle (180°)
	arc(hw, -hh, Rc, Math.PI, 2.5 * Math.PI);      // top-right
	arc(hw, hh, Rc, 1.5 * Math.PI, 3 * Math.PI);   // bottom-right
	arc(0, hh, Rm, 0, Math.PI);                    // bottom-middle
	arc(-hw, hh, Rc, 0, 1.5 * Math.PI);            // bottom-left
	contour.reverse(); // wind opposite to the CCW outer outline so it reads as a hole

	const outline = buildOuter();
	outline.holes.push(new THREE.Path(contour));

	const railMat = keep(new THREE.MeshStandardMaterial(
		tron ? { color: TRON.frame, roughness: 0.35, metalness: 0.55 } : { color: WOOD, roughness: 0.5, metalness: 0.05 },
	));
	// A bevel rounds the top edge of the rail and flares the pocket mouths — softens the boxy look.
	const frameGeo = keep(new THREE.ExtrudeGeometry(outline, {
		depth: RAIL_H - 1.4, bevelEnabled: true, bevelThickness: 1.4, bevelSize: 1.4, bevelSegments: 3, curveSegments: 10,
	}));
	frameGeo.rotateX(-Math.PI / 2); // shape XY plane → lie flat, extruded up along +Y
	const frame = new THREE.Mesh(frameGeo, railMat);
	frame.castShadow = true; frame.receiveShadow = true;
	grp.add(frame);

	// Pockets: black mouth flush with the felt (visible from the top) + a sunk cylinder for depth.
	const holeMat = keep(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1, side: THREE.DoubleSide }));
	for (const p of table.pockets) {
		// Sit the black on the ANCHOR (true corner/edge point), where the frame cuts the mouth —
		// the engine's pocket centre is nudged inward, which left the hole off from the notch.
		const px = p.anchor.x - hw, pz = p.anchor.y - hh;
		const R = (Math.abs(px) < hw * 0.5 ? Rm : Rc) * 0.9; // black fills most of the mouth opening
		const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R * 0.7, POCKET_D, 24, 1, true)), holeMat);
		wall.position.set(px, -POCKET_D / 2 + 0.1, pz);
		grp.add(wall);
		const floorDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(R * 0.7, 24)), holeMat);
		floorDisc.rotation.x = -Math.PI / 2;
		floorDisc.position.set(px, -POCKET_D + 0.2, pz);
		grp.add(floorDisc);
		const mouth = new THREE.Mesh(keep(new THREE.CircleGeometry(R, 24)), holeMat);
		mouth.rotation.x = -Math.PI / 2;
		mouth.position.set(px, 0.05, pz);
		grp.add(mouth);
	}

	// Neon light strips: one along the cushion's inner top edge (the contour already traces the
	// felt boundary incl. pocket mouths), one along the rounded outer outline. Tron only.
	if (tron) {
		const tube = (pts: THREE.Vector2[], y: number, r: number, color: number) => {
			const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)), true);
			const geo = keep(new THREE.TubeGeometry(curve, Math.min(400, pts.length * 3), r, 6, true));
			geo.rotateX(-Math.PI / 2); // same lay-flat transform as the frame, so both align
			geo.translate(0, y, 0);
			const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ color, toneMapped: false })));
			grp.add(m);
		};
		tube(contour, RAIL_H - 0.5, 0.55, TRON.neonInner);
		tube(buildOuter().getPoints(10), RAIL_H + 0.1, 0.5, TRON.neonOuter);
	}

	// Diamond sights on the rail top — the classic little markers, for looks.
	const diaMat = keep(tron
		? new THREE.MeshBasicMaterial({ color: TRON.neonInner, toneMapped: false })
		: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }));
	const diaGeo = keep(new THREE.CircleGeometry(1.3, 4));
	const dOff = BORDER * 0.5;
	const diamond = (x: number, z: number) => {
		const d = new THREE.Mesh(diaGeo, diaMat);
		d.rotation.x = -Math.PI / 2; d.rotation.z = Math.PI / 4;
		d.position.set(x, RAIL_H + 0.03, z);
		grp.add(d);
	};
	for (const fr of [0.28, 0.5, 0.72]) {
		diamond(-hw * fr, -hh - dOff); diamond(hw * fr, -hh - dOff);
		diamond(-hw * fr, hh + dOff); diamond(hw * fr, hh + dOff);
	}
	for (const fr of [0.5]) {
		diamond(-hw - dOff, -hh * fr); diamond(-hw - dOff, hh * fr);
		diamond(hw + dOff, -hh * fr); diamond(hw + dOff, hh * fr);
	}

	return {
		group: grp,
		feltMat,
		floorMat,
		dispose() {
			for (const d of disposables) d.dispose();
			feltMat.dispose();
			floorMat.dispose();
		},
	};
}

/* ---------- Impact FX: sparks, shock rings, motion trails (render-only) ----------
   Fed by the engine's Impact events + per-frame ball positions. Everything is pooled and
   additive-blended (no postprocessing), so it stays cheap on mobile. */

const SPARK_MAX = 240;
const SPARK_LIFE = 0.45; // s
const SPARK_GRAV = 130;
const RING_MAX = 8;
const RING_LIFE = 0.34; // s
const TRAIL_PTS = 12; // stored points per ball trail
const TRAIL_DIST = 2.4; // engine units between stored points
const TRAIL_W = BALL_R * 0.8; // ribbon half-width at the head
const TRAIL_MIN_SPEED = 12; // below this the trail retracts instead of growing
const TRAIL_JUMP = 25; // min gap treated as a teleport (scratch respot) — restart, don't streak

interface TrailState {
	mesh: THREE.Mesh;
	geo: THREE.BufferGeometry;
	pts: { x: number; z: number }[]; // immutable anchors, one every TRAIL_DIST of travel
	head: { x: number; z: number } | null; // live ball position — the ribbon's tip, never an anchor
	color: THREE.Color;
	fed: boolean; // the ball moved this frame — a fed trail never drains (the point cap trims it)
	drain: number; // s until the tail loses its next point (once the ball slows down)
}

export interface Fx {
	burst(x: number, z: number, speed: number): void; // sparks proportional to the hit
	ring(x: number, z: number, color: number, big?: boolean): void; // shockwave on the cloth
	trailPoint(i: number, x: number, z: number, speed: number, color: number): void;
	resetTrails(): void;
	update(dt: number): void;
	stats(): { sparks: number; rings: number; trailPts: number; bornSparks: number; bornRings: number; bornTrailPts: number; trailResets: number }; // for the smoke tests
	dispose(): void;
}

export function makeFx(scene: THREE.Scene): Fx {
	// Sparks: one Points cloud; a particle fades by darkening its vertex colour (additive → black = gone).
	const sPos = new Float32Array(SPARK_MAX * 3);
	const sCol = new Float32Array(SPARK_MAX * 3);
	const sVel = new Float32Array(SPARK_MAX * 3);
	const sLife = new Float32Array(SPARK_MAX);
	sPos.fill(-999);
	const sGeo = new THREE.BufferGeometry();
	sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
	sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
	const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({
		size: 1.7, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
	}));
	sparks.frustumCulled = false;
	sparks.renderOrder = 14;
	scene.add(sparks);
	let sNext = 0;

	// Shock rings: a small pool of flat rings that expand and fade on the cloth.
	const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; big: boolean }[] = [];
	const ringGeo = new THREE.RingGeometry(0.82, 1, 28);
	for (let i = 0; i < RING_MAX; i++) {
		const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
		const mesh = new THREE.Mesh(ringGeo, mat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.visible = false;
		mesh.renderOrder = 7;
		scene.add(mesh);
		rings.push({ mesh, mat, age: Infinity, big: false });
	}
	let rNext = 0;
	let sBorn = 0, rBorn = 0, tBorn = 0, tResets = 0; // lifetime spawn totals — pooled live counts are too easy to miss between frames

	// Trails: one tapered ribbon per ball, rebuilt from its recent path each frame.
	const trails = new Map<number, TrailState>();
	const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
	const trailIndex: number[] = [];
	for (let k = 0; k < TRAIL_PTS; k++) trailIndex.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); // TRAIL_PTS anchors + the head
	const makeTrail = (color: number): TrailState => {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TRAIL_PTS + 1) * 2 * 3), 3));
		geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((TRAIL_PTS + 1) * 2 * 3), 3));
		geo.setIndex(trailIndex);
		geo.setDrawRange(0, 0);
		const mesh = new THREE.Mesh(geo, trailMat);
		mesh.frustumCulled = false;
		mesh.renderOrder = 6;
		scene.add(mesh);
		// Lightened so dark balls (the 8!) still leave a visible additive streak.
		return { mesh, geo, pts: [], head: null, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), fed: false, drain: 0 };
	};
	const rebuildTrail = (tr: TrailState) => {
		const n = tr.pts.length + (tr.head ? 1 : 0);
		if (n < 2) { tr.geo.setDrawRange(0, 0); return; }
		const at = (k: number) => (k < tr.pts.length ? tr.pts[k] : tr.head!);
		const pos = tr.geo.attributes.position as THREE.BufferAttribute;
		const col = tr.geo.attributes.color as THREE.BufferAttribute;
		for (let k = 0; k < n; k++) {
			const p = at(k);
			const q = k < n - 1 ? at(k + 1) : at(k - 1);
			let dx = q.x - p.x, dz = q.z - p.z;
			const dl = Math.hypot(dx, dz) || 1;
			dx /= dl; dz /= dl;
			const w = TRAIL_W * (k / (n - 1)); // tapers from nothing (tail) to full width (head)
			pos.setXYZ(k * 2, p.x - dz * w, 0.22, p.z + dx * w);
			pos.setXYZ(k * 2 + 1, p.x + dz * w, 0.22, p.z - dx * w);
			const f = 0.5 * (k / (n - 1)) ** 1.6;
			col.setXYZ(k * 2, tr.color.r * f, tr.color.g * f, tr.color.b * f);
			col.setXYZ(k * 2 + 1, tr.color.r * f, tr.color.g * f, tr.color.b * f);
		}
		pos.needsUpdate = true;
		col.needsUpdate = true;
		tr.geo.setDrawRange(0, (n - 1) * 6);
	};

	return {
		burst(x, z, speed) {
			const count = Math.min(20, 5 + Math.floor(speed / 12));
			sBorn += count;
			for (let c = 0; c < count; c++) {
				const i = sNext; sNext = (sNext + 1) % SPARK_MAX;
				const a = Math.random() * Math.PI * 2;
				const up = 12 + Math.random() * (18 + speed * 0.25);
				const out = (4 + Math.random() * 14) * (0.5 + speed / 160);
				sPos[i * 3] = x; sPos[i * 3 + 1] = BALL_R * 0.9; sPos[i * 3 + 2] = z;
				sVel[i * 3] = Math.cos(a) * out; sVel[i * 3 + 1] = up; sVel[i * 3 + 2] = Math.sin(a) * out;
				sLife[i] = SPARK_LIFE * (0.6 + Math.random() * 0.4);
			}
		},
		ring(x, z, color, big) {
			const r = rings[rNext]; rNext = (rNext + 1) % RING_MAX;
			rBorn++;
			r.age = 0; r.big = !!big;
			r.mat.color.set(color);
			r.mesh.position.set(x, 0.25, z);
			r.mesh.visible = true;
		},
		trailPoint(i, x, z, speed, color) {
			let tr = trails.get(i);
			if (!tr) { tr = makeTrail(color); trails.set(i, tr); }
			if (speed <= TRAIL_MIN_SPEED) return; // update() drains it
			tr.fed = true;
			if (!tr.head || !tr.pts.length) { tr.pts.length = 0; tr.pts.push({ x, z }); tr.head = { x, z }; tBorn++; return; }
			// Anchors never move: distance from the last one accumulates until a new one drops.
			const last = tr.pts[tr.pts.length - 1];
			const gx = x - last.x, gz = z - last.z, gap = Math.hypot(gx, gz);
			// One slow frame moves a fast ball far — a gap only counts as a teleport when it outruns
			// half a second of travel (true teleports happen at rest, so this stays safe).
			if (gap > Math.max(TRAIL_JUMP, speed * 0.5)) { tr.pts.length = 0; tr.pts.push({ x, z }); tr.head = { x, z }; tResets++; return; }
			// Lay anchors along the whole travel: the trail length must not depend on the frame rate.
			const steps = Math.floor(gap / TRAIL_DIST);
			for (let k = 1; k <= steps; k++) tr.pts.push({ x: last.x + (gx * k * TRAIL_DIST) / gap, z: last.z + (gz * k * TRAIL_DIST) / gap });
			tBorn += steps;
			if (tr.pts.length > TRAIL_PTS) tr.pts.splice(0, tr.pts.length - TRAIL_PTS);
			tr.head.x = x; tr.head.z = z;
		},
		resetTrails() {
			for (const tr of trails.values()) { scene.remove(tr.mesh); tr.geo.dispose(); }
			trails.clear();
		},
		update(dt) {
			for (let i = 0; i < SPARK_MAX; i++) {
				if (sLife[i] <= 0) continue;
				sLife[i] -= dt;
				if (sLife[i] <= 0 || sPos[i * 3 + 1] < 0.1) { sLife[i] = 0; sPos[i * 3 + 1] = -999; sCol[i * 3] = sCol[i * 3 + 1] = sCol[i * 3 + 2] = 0; continue; }
				sVel[i * 3 + 1] -= SPARK_GRAV * dt;
				sPos[i * 3] += sVel[i * 3] * dt;
				sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
				sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
				const f = Math.max(0, sLife[i] / SPARK_LIFE);
				sCol[i * 3] = f; sCol[i * 3 + 1] = f * 0.92; sCol[i * 3 + 2] = f * 0.7; // warm white → dark
			}
			(sGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
			(sGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
			for (const r of rings) {
				if (r.age >= RING_LIFE) { r.mesh.visible = false; continue; }
				r.age += dt;
				const e = Math.min(1, r.age / RING_LIFE);
				const s = (r.big ? 3.5 : 2) + e * (r.big ? 26 : 15);
				r.mesh.scale.set(s, s, s);
				r.mat.opacity = 0.75 * (1 - e) ** 1.4;
			}
			for (const tr of trails.values()) {
				if (tr.fed) { tr.fed = false; tr.drain = 0.045; }
				else if (tr.pts.length) {
					tr.drain -= dt;
					// The tail burns down once the ball rests; the head goes with the last anchor.
					if (tr.drain <= 0) { tr.pts.shift(); tr.drain = 0.045; if (!tr.pts.length) tr.head = null; }
				}
				rebuildTrail(tr);
			}
		},
		stats() {
			let sparksAlive = 0, ringsAlive = 0, trailPts = 0;
			for (let i = 0; i < SPARK_MAX; i++) if (sLife[i] > 0) sparksAlive++;
			for (const r of rings) if (r.mesh.visible) ringsAlive++;
			for (const tr of trails.values()) trailPts += tr.pts.length;
			return { sparks: sparksAlive, rings: ringsAlive, trailPts, bornSparks: sBorn, bornRings: rBorn, bornTrailPts: tBorn, trailResets: tResets };
		},
		dispose() {
			this.resetTrails();
			scene.remove(sparks);
			sGeo.dispose();
			(sparks.material as THREE.Material).dispose();
			for (const r of rings) { scene.remove(r.mesh); r.mat.dispose(); }
			ringGeo.dispose();
			trailMat.dispose();
		},
	};
}

/* ---------- Camera framing (flat table, target at the origin) ---------- */

/** Distance at which a `hx`×`hz` half-box fills the frame under a given pitch/azimuth. */
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
		(fwd * Math.sin(pitch) * 1.06) / Math.tan(vFov / 2),
		(side * 1.06) / Math.tan(hFov / 2),
		12,
	);
}

/** Azimuth (searched around `base`) that frames the table tightest for this canvas. */
export function bestAz(cam: THREE.PerspectiveCamera, hx: number, hz: number, base: number, pitch: number): number {
	let best = base, bestD = Infinity;
	for (let k = 0; k <= 12; k++) {
		for (const s of k === 0 ? [0] : [-1, 1]) {
			const az = base + (s * k * Math.PI) / 36;
			const d = fitDist(cam, hx, hz, pitch, az);
			if (d < bestD - 1e-6) { bestD = d; best = az; }
		}
	}
	return best;
}

/* ---------- Aim prediction (simulated with the real engine, in engine space) ---------- */

export interface AimPrediction {
	segs: { from: Vec; to: Vec }[]; // cue-ball path (real bounces), engine coords
	contact: Vec | null; // where the cue first meets a ball
	object: { from: Vec; to: Vec } | null; // that ball's resulting direction
	cueAfter: { from: Vec; to: Vec } | null; // the cue ball's OWN direction after the contact
	pocket: boolean; // the cue drops into a pocket
}

const AIM_SETTLE = 2.4; // engine's at-rest speed
const AIM_MAX_STEPS = 600; // ~10 s at 60 Hz — the cue always stops or hits well before this

/**
 * Predict the cue ball's path by SIMULATING it with the real engine (stepBalls) on a clone. The aim
 * is launched at the REAL shot velocity, so the line stops exactly where the ball would: a soft shot
 * draws a stub, not a long line and a contact it could never reach.
 * It traces the cue's path with its cushion rebonds and stops at the FIRST ball it meets —
 * directly or after banks — showing the contact ring plus the two short resulting directions (struck
 * ball + cue deflection) there, as if it were a direct hit. A pure miss just shows the bank path
 * until the cue would stop. Force is also shown by the line colour (green → orange → red).
 */
export function predictCue(balls: Ball[], table: Table, pull: Vec): AimPrediction {
	const empty: AimPrediction = { segs: [], contact: null, object: null, cueAfter: null, pocket: false };
	const m = Math.hypot(pull.x, pull.y);
	if (m < 3) return empty; // below MIN_PULL the shot does nothing → no guide
	// Clone at rest — the aim always simulates from a still table. Balls that settled keep a tiny
	// residual velocity (below the engine's at-rest cutoff, never zeroed), which would otherwise
	// count as "already moving" and fire the first-contact test on step 1, collapsing the guide to
	// a stub at the cue. Only the cue is launched, below.
	const sim: Ball[] = balls.map((b) => ({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, kind: b.kind, color: b.color, potted: b.potted }));
	const cue = sim.find((b) => b.kind === 'cue');
	if (!cue) return empty;
	let dx = -pull.x / m, dy = -pull.y / m; // shot direction (opposite the pull)
	const v = aimToVelocity(pull);
	if (!v) return empty;
	cue.vx = v.vx; cue.vy = v.vy;

	const pts: Vec[] = [{ x: cue.x, y: cue.y }];
	let contact: Vec | null = null;
	let object: AimPrediction['object'] = null;
	let cueAfter: AimPrediction['cueAfter'] = null;
	let pocket = false;

	for (let s = 0; s < AIM_MAX_STEPS; s++) {
		stepBalls(sim, table, 1 / 60);
		// First contact: an object ball has been set moving (only the cue moved until now).
		const hit = sim.find((b) => b.kind !== 'cue' && !b.potted && (b.vx !== 0 || b.vy !== 0));
		if (hit) {
			// The cue meets a ball (directly or after banks): mark the contact and show two SHORT lines —
			// the struck ball's direction and the cue's own deflection (both power-independent).
			contact = { x: cue.x, y: cue.y };
			const ol = Math.hypot(hit.vx, hit.vy) || 1;
			object = { from: { x: hit.x, y: hit.y }, to: { x: hit.x + (hit.vx / ol) * 20, y: hit.y + (hit.vy / ol) * 20 } };
			const cl = Math.hypot(cue.vx, cue.vy);
			if (cl > AIM_SETTLE) cueAfter = { from: { x: cue.x, y: cue.y }, to: { x: cue.x + (cue.vx / cl) * 20, y: cue.y + (cue.vy / cl) * 20 } };
			break;
		}
		if (cue.potted) { pocket = true; pts.push({ x: cue.x, y: cue.y }); break; }
		const sp = Math.hypot(cue.vx, cue.vy);
		if (sp < AIM_SETTLE) { pts.push({ x: cue.x, y: cue.y }); break; }
		// A heading change means the cue bounced off a cushion: record the corner and keep tracing so
		// a miss shows its bank path. It stops as soon as it meets a ball (the `hit` check above) or
		// when the cue runs out of roll — never an endless zigzag.
		const ndx = cue.vx / sp, ndy = cue.vy / sp;
		if (ndx * dx + ndy * dy < 0.9995) {
			// Snap the corner onto the exact rail the cue hit — recording the post-step position left it
			// a few units inside the felt, so the two segments met off the cushion and looked disjointed.
			const prev = pts[pts.length - 1];
			let corner: Vec = { x: cue.x, y: cue.y };
			if (Math.sign(ndx) !== Math.sign(dx) && dx !== 0) {
				const railX = dx > 0 ? table.w - BALL_R : BALL_R;
				corner = { x: railX, y: prev.y + dy * ((railX - prev.x) / dx) };
			} else if (Math.sign(ndy) !== Math.sign(dy) && dy !== 0) {
				const railY = dy > 0 ? table.h - BALL_R : BALL_R;
				corner = { x: prev.x + dx * ((railY - prev.y) / dy), y: railY };
			}
			pts.push(corner);
			dx = ndx; dy = ndy;
		}
	}
	if (contact) pts.push(contact);
	const segs: { from: Vec; to: Vec }[] = [];
	for (let i = 1; i < pts.length; i++) segs.push({ from: pts[i - 1], to: pts[i] });
	return { segs, contact, object, cueAfter, pocket };
}
