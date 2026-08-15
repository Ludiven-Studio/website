/**
 * BILLARD — 3D drawing layer (three.js). The engine (see ./engine) stays pure 2D:
 * this file only turns the top-down table + balls into a lit 3D scene and predicts the
 * cue's aim line. Engine coords (x: 0..w, y: 0..h) map to world (x = ex - w/2,
 * z = ey - h/2); the felt sits at world y = 0 and a ball's centre at y = BALL_R.
 */
import * as THREE from 'three';
import { BALL_R, aimToVelocity, stepBalls, type Table, type Ball, type Vec } from './engine';

export const CUE_COLOR = 0xf4f4f2;
export const BALL_COLORS = [0xe6566f, 0xf0a830, 0x5b8def, 0x2f9e6f, 0x9b6cf0, 0x20c4c0];

const FELT = 0x0f7a52;
const WOOD = 0x5a3722;
const WOOD_DARK = 0x3a2416;
const BORDER = 13; // wooden frame width around the felt (holds the pocket mouths)
const RAIL_H = 2 * BALL_R; // rail top above the felt
const BODY_H = 9; // table body thickness under the felt
const LEG_H = 32; // legs raise the table off the floor
const LEG_W = 9;
const POCKET_D = 8; // how deep a pocket sinks below the felt

// Corner signs for the framing math.
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** Ball sphere. Cue is white; colour balls carry their palette colour. (Arcade / Défi only.) */
export function makeBallMesh(color: number): THREE.Mesh {
	const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
	const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.04 });
	const m = new THREE.Mesh(geo, mat);
	m.castShadow = true;
	m.receiveShadow = false;
	return m;
}

/* ---------- 8-ball: numbered / striped balls ---------- */

// Real pool hues by number (1-7 solids, 8 black). Stripes 9-15 reuse hues 1-7.
const BALL8_COLORS: Record<number, number> = {
	1: 0xf6c026, 2: 0x1f5fd6, 3: 0xd8352a, 4: 0x7a3fa0, 5: 0xef7d1a, 6: 0x1f8a4c, 7: 0x7a2432, 8: 0x18181a,
};
const hueOf = (n: number): number => (n <= 8 ? BALL8_COLORS[n] : BALL8_COLORS[n - 8]);

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
export function makeBall8Mesh(number: number): THREE.Mesh {
	const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
	const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(number), roughness: 0.22, metalness: 0.04 });
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
export function buildTable3D(table: Table): Table3D {
	const { w, h } = table;
	const hw = w / 2, hh = h / 2;
	const grp = new THREE.Group();
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

	// Floor the table stands on — tiled texture attached later, flat brown until then.
	const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
	const floorGeo = keep(new THREE.PlaneGeometry(w * 6, h * 10));
	const floor = new THREE.Mesh(floorGeo, floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = -(BODY_H + LEG_H);
	floor.receiveShadow = true;
	grp.add(floor);

	// Table body: a wood block just under the felt, matching the frame footprint.
	const foX = hw + BORDER, foZ = hh + BORDER;
	const bodyMat = keep(new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.7 }));
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

	// Felt bed — covers the whole footprint so green shows through the pocket mouths cut into the
	// frame. The wood frame on top hides the border, leaving the playfield + the pocket openings.
	const feltMat = new THREE.MeshStandardMaterial({ color: FELT, roughness: 0.95, metalness: 0 });
	const feltGeo = keep(new THREE.PlaneGeometry(2 * foX, 2 * foZ));
	const felt = new THREE.Mesh(feltGeo, feltMat);
	felt.rotation.x = -Math.PI / 2;
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

	const OR = 16; // outer corner radius (generous, to soften the boxy look)
	const outline = new THREE.Shape();
	outline.moveTo(-foX + OR, -foZ);
	outline.lineTo(foX - OR, -foZ);
	outline.quadraticCurveTo(foX, -foZ, foX, -foZ + OR);
	outline.lineTo(foX, foZ - OR);
	outline.quadraticCurveTo(foX, foZ, foX - OR, foZ);
	outline.lineTo(-foX + OR, foZ);
	outline.quadraticCurveTo(-foX, foZ, -foX, foZ - OR);
	outline.lineTo(-foX, -foZ + OR);
	outline.quadraticCurveTo(-foX, -foZ, -foX + OR, -foZ);
	outline.holes.push(new THREE.Path(contour));

	const railMat = keep(new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.5, metalness: 0.05 }));
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

	// Diamond sights on the rail top — the classic little markers, for looks.
	const diaMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }));
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
 * Predict the cue ball's path by SIMULATING it with the real engine (stepBalls) on a clone:
 * exact cushion bounces (including the pocket-mouth gaps) and a length limited by friction, so
 * the guide matches what actually happens. The line stops at the first ball the cue meets; we
 * also return that ball's launch direction and the cue's own deflected direction — after a
 * contact the white ball never keeps going straight.
 */
export function predictCue(balls: Ball[], table: Table, pull: Vec): AimPrediction {
	const empty: AimPrediction = { segs: [], contact: null, object: null, cueAfter: null, pocket: false };
	const vel = aimToVelocity(pull);
	if (!vel) return empty;
	// Clone so the simulation never touches the live balls.
	const sim: Ball[] = balls.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, kind: b.kind, color: b.color, potted: b.potted }));
	const cue = sim.find((b) => b.kind === 'cue');
	if (!cue) return empty;
	cue.vx = vel.vx; cue.vy = vel.vy;

	const pts: Vec[] = [{ x: cue.x, y: cue.y }];
	let dx = vel.vx, dy = vel.vy; { const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
	let contact: Vec | null = null;
	let object: AimPrediction['object'] = null;
	let cueAfter: AimPrediction['cueAfter'] = null;
	let pocket = false;

	for (let s = 0; s < AIM_MAX_STEPS; s++) {
		stepBalls(sim, table, 1 / 60);
		// First contact: an object ball has been set moving (only the cue moved until now).
		const hit = sim.find((b) => b.kind !== 'cue' && !b.potted && (b.vx !== 0 || b.vy !== 0));
		if (hit) {
			contact = { x: cue.x, y: cue.y };
			const ol = Math.hypot(hit.vx, hit.vy) || 1;
			object = { from: { x: hit.x, y: hit.y }, to: { x: hit.x + (hit.vx / ol) * 22, y: hit.y + (hit.vy / ol) * 22 } };
			const cl = Math.hypot(cue.vx, cue.vy);
			if (cl > AIM_SETTLE) cueAfter = { from: { x: cue.x, y: cue.y }, to: { x: cue.x + (cue.vx / cl) * 18, y: cue.y + (cue.vy / cl) * 18 } };
			break;
		}
		if (cue.potted) { pocket = true; pts.push({ x: cue.x, y: cue.y }); break; }
		const sp = Math.hypot(cue.vx, cue.vy);
		if (sp < AIM_SETTLE) { pts.push({ x: cue.x, y: cue.y }); break; }
		// Record a corner only where the cue changes heading (a cushion bounce).
		const ndx = cue.vx / sp, ndy = cue.vy / sp;
		if (ndx * dx + ndy * dy < 0.9995) { pts.push({ x: cue.x, y: cue.y }); dx = ndx; dy = ndy; }
	}
	if (contact) pts.push(contact);
	const segs: { from: Vec; to: Vec }[] = [];
	for (let i = 1; i < pts.length; i++) segs.push({ from: pts[i - 1], to: pts[i] });
	return { segs, contact, object, cueAfter, pocket };
}
