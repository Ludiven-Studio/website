import * as THREE from 'three';
import {
	groundHeight,
	baseHeight,
	distToPath,
	riverX,
	mountPoint,
	mountPolar,
	ringLevel,
	START,
	DEN,
	HOUSE,
	FEUILLE_SPOT,
	PLATEAU,
	POND,
	OAK,
	OAK_GATE,
	OWL_SPOT,
	RIVER,
	BANK,
	ISLETS,
	LAKE,
	LAKE_ISLE,
	MOUNT,
	MILL,
	R_OUT,
	TOP_LEVEL,
	WATER_Y,
	BOUNDS,
} from './terrain';
import { addBox, addCyl, moveSolid, query, inside, type Solid } from './colliders';
import { mat, shadowed, rng, rockMesh, block, crate, stump, logMesh, mushroomMesh, brambleMesh, textTexture } from './props';

export interface P3 { x: number; y: number; z: number }
export interface Spot extends P3 { id: string }

export interface ClimbSpot {
	id: string;
	base: P3;
	edge: P3;
	top: P3;
	prints: THREE.Group;
}

export interface Crown { x: number; z: number; r: number; y0: number; y1: number }

export interface Zones {
	climbs: ClimbSpot[];
	crowns: Crown[];
	canopies: THREE.Object3D[];
	npcSpots: Record<'feuille' | 'owl' | 'beaver' | 'simone' | 'caline' | 'pepin' | 'frog', P3 & { yaw: number }>;
	questNut: P3;
	branches: Spot[];
	babies: Spot[];
	kite: P3;
	orbs: Spot[];
	goldNuts: Spot[];
	lantern: P3;
	chimney: P3;
	hazelSteps: P3[];
	breakables: Solid[];
	bouncers: { solid: Solid; mesh: THREE.Object3D; squash: number }[];
	dam: { built: boolean; build(): void; update(dt: number): void; center: P3 };
	festival: THREE.Group;
	lanternLight: THREE.PointLight;
	lanternGlow: THREE.Mesh;
	rescue: P3[];
	update(dt: number, time: number, standing: Solid | null): void;
}

type Mover = (t: number, standing: Solid | null) => void;

const clear: { x: number; z: number; r: number }[] = [];
const keepClear = (x: number, z: number, r: number) => clear.push({ x, z, r });

function surfaceAt(x: number, z: number): number {
	let h = groundHeight(x, z);
	for (const s of query(x, z)) if (s.y1 < h + 12 && s.y1 > h && inside(s, x, z, 0)) h = s.y1;
	return h;
}

const at = (x: number, z: number, lift = 0): P3 => ({ x, y: surfaceAt(x, z) + lift, z });
const g = (x: number, z: number) => groundHeight(x, z);

function pawPrints(base: P3, dir: { x: number; z: number }): THREE.Group {
	const grp = new THREE.Group();
	const m = new THREE.MeshBasicMaterial({ color: '#5a3d2b', transparent: true, opacity: 0.55, depthWrite: false });
	const pad = new THREE.CircleGeometry(0.09, 10);
	const toe = new THREE.CircleGeometry(0.035, 8);
	const side = { x: dir.z, z: -dir.x };
	for (let i = 0; i < 3; i++) {
		const p = new THREE.Group();
		p.add(new THREE.Mesh(pad, m));
		for (let k = 0; k < 4; k++) {
			const t = new THREE.Mesh(toe, m);
			t.position.set((k - 1.5) * 0.06, 0.1 - Math.abs(k - 1.5) * 0.02, 0);
			p.add(t);
		}
		p.rotation.x = -Math.PI / 2;
		const along = -i * 0.45 - 0.35;
		const off = i % 2 ? 0.15 : -0.15;
		p.position.set(base.x + dir.x * along + side.x * off, 0, base.z + dir.z * along + side.z * off);
		p.position.y = surfaceAt(p.position.x, p.position.z) + 0.03;
		p.rotation.z = Math.atan2(dir.x, dir.z) + Math.PI;
		grp.add(p);
	}
	return grp;
}

// — Hub: Feuille's house, the hazel rock, the pond, Rayou's den. —
function buildHub(root: THREE.Group, r: () => number, out: Partial<Zones>) {
	const hg = new THREE.Group();
	const { w, d } = HOUSE;
	const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), mat('#f4e3c4'));
	walls.position.y = 1.2;
	const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2), mat('#b9a58c'));
	base.position.y = 0.17;
	const R = (d + 0.8) / Math.sqrt(3);
	const roof = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w + 0.6, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), mat('#c8553d'));
	roof.scale.y = 0.45;
	roof.position.y = 2.4 + (R / 2) * 0.45;
	const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), mat('#a8483a'));
	chimney.position.set(w / 2 - 1, 3.9, -0.6);
	const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12), mat('#8a5a3b'));
	door.position.set(0.8, 0.95, d / 2 + 0.03);
	hg.add(walls, base, roof, chimney, door);
	for (const [x, z, ry] of [[-1.2, d / 2 + 0.03, 0], [w / 2 + 0.03, 0, Math.PI / 2], [-w / 2 - 0.03, 0, Math.PI / 2]] as const) {
		const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.1), mat('#ffffff'));
		frame.position.set(x, 1.45, z);
		frame.rotation.y = ry;
		const glass = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.12), mat('#9fd3ec', { emissive: '#ffd99a', emissiveIntensity: 0.25 }));
		glass.position.copy(frame.position);
		glass.rotation.y = ry;
		hg.add(frame, glass);
	}
	const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.6), mat('#c9b79c'));
	step.position.set(0.8, 0.1, d / 2 + 0.35);
	hg.add(step);
	hg.position.set(HOUSE.x, 0, HOUSE.z);
	root.add(shadowed(hg));
	addBox(HOUSE.x, HOUSE.z, w / 2 + 0.15, d / 2 + 0.15, -1, 4.6);
	keepClear(HOUSE.x, HOUSE.z, 6);
	out.chimney = { x: HOUSE.x + w / 2 - 1, y: 4.6, z: HOUSE.z - 0.6 };

	// Woodpile against the east wall.
	const wp = new THREE.Group();
	for (let i = 0; i < 9; i++) {
		const l = logMesh(1.0, 0.16);
		l.rotation.y = Math.PI / 2;
		l.position.set(((i % 3) - 1) * 0.33, 0.16 + Math.floor(i / 3) * 0.3, 0);
		wp.add(l);
	}
	wp.position.set(HOUSE.x + w / 2 + 0.75, 0, HOUSE.z - 0.6);
	root.add(wp);
	addBox(wp.position.x, wp.position.z, 0.55, 0.5, -1, 0.92);

	root.add(shadowed(stumpDeco(FEUILLE_SPOT.x, FEUILLE_SPOT.z, 0.45, 0.45)));
	addCyl(FEUILLE_SPOT.x, FEUILLE_SPOT.z, 0.55, -1, g(FEUILLE_SPOT.x, FEUILLE_SPOT.z) + 0.43);
	keepClear(FEUILLE_SPOT.x, FEUILLE_SPOT.z, 3);

	// Hazel rock: a ring of boulders with a gap, reached by hopping up a stair of rocks.
	const climbDir = new THREE.Vector2(HOUSE.x - PLATEAU.x, HOUSE.z + 9 - PLATEAU.z).normalize();
	const climbA = Math.atan2(climbDir.y, climbDir.x);
	const n = 34;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + r() * 0.08;
		let da = Math.abs(a - climbA);
		da = Math.min(da, Math.PI * 2 - da);
		if (da < 0.38) continue;
		const m = rockMesh(0.75 + r() * 0.45, r() > 0.5 ? '#a99886' : '#9a8a79', r);
		m.scale.set(1, 1.5 + r() * 0.6, 1);
		const rad = PLATEAU.r + 0.05;
		m.position.set(PLATEAU.x + Math.cos(a) * rad, 0.9 + r() * 0.4, PLATEAU.z + Math.sin(a) * rad);
		root.add(shadowed(m));
		addCyl(m.position.x, m.position.z, 0.85, -1, 2.5);
	}
	// Each step rises half a metre; the third is too high to reach straight from the grass.
	const hazelRocks: [number, number, number][] = [
		[1.05, 8.6, 0.6],
		[0.78, 8.5, 1.1],
		[0.5, 8.3, 1.6],
		[0.18, 7.6, 2.05],
	];
	out.hazelSteps = hazelRocks.map(([da, rad, top], i) => {
		const x = PLATEAU.x + Math.cos(climbA + da) * rad, z = PLATEAU.z + Math.sin(climbA + da) * rad;
		const gy = g(x, z);
		const rock = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, top - gy + 0.4, 7), mat(i % 2 ? '#a99886' : '#b3a28c'));
		body.position.y = (top - gy + 0.4) / 2 - 0.4;
		const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.64, 0.08, 7), mat('#c9b79c'));
		cap.position.y = top - gy - 0.02;
		rock.add(body, cap);
		rock.position.set(x, gy, z);
		rock.rotation.y = i * 1.3;
		root.add(shadowed(rock));
		addCyl(x, z, 0.66, -1, top);
		return { x, y: top, z };
	});
	const landing = { x: PLATEAU.x + climbDir.x * (PLATEAU.r - 1.3), z: PLATEAU.z + climbDir.y * (PLATEAU.r - 1.3) };
	out.hazelSteps.push(at(landing.x, landing.z));
	keepClear(PLATEAU.x, PLATEAU.z, PLATEAU.r + 2.5);

	const hazel = new THREE.Vector3(PLATEAU.x + 2, 0, PLATEAU.z - 1.6);
	const hz = new THREE.Group();
	hz.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0), mat('#7a5233')));
	for (const [x, y, z, s] of [[0, 2, 0, 1.15], [0.8, 1.7, 0.3, 0.8], [-0.7, 1.8, -0.2, 0.85], [0.1, 2.6, -0.4, 0.75]]) {
		const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat('#8fc65b'));
		b.position.set(x, y, z);
		hz.add(b);
	}
	for (let i = 0; i < 9; i++) {
		const a = i * 2.4;
		const nut = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat('#a0672f'));
		nut.position.set(Math.cos(a) * 1.05, 1.6 + (i % 3) * 0.35, Math.sin(a) * 1.05);
		hz.add(nut);
	}
	hz.position.set(hazel.x, g(hazel.x, hazel.z) - 0.05, hazel.z);
	root.add(shadowed(hz));
	addCyl(hazel.x, hazel.z, 0.5, -1, 30);
	out.crowns!.push({ x: hazel.x, z: hazel.z, r: 1.6, y0: hz.position.y + 1, y1: hz.position.y + 3.4 });
	out.questNut = at(PLATEAU.x + 0.6, PLATEAU.z - 0.2, 0.18);

	// Pond.
	const pg = new THREE.Group();
	for (let i = 0; i < 4; i++) {
		const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 9, 0.3, Math.PI * 1.8), mat('#4f9e45'));
		pad.rotation.x = -Math.PI / 2;
		pad.rotation.z = r() * 6;
		pad.position.set(POND.x + (r() - 0.5) * 3, -0.1, POND.z + (r() - 0.5) * 3);
		pg.add(pad);
	}
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2 + r() * 0.3;
		const rad = POND.r + 0.7 + r() * 0.3;
		const m = rockMesh(0.18 + r() * 0.2, '#b8ab9a', r);
		m.position.set(POND.x + Math.cos(a) * rad, g(POND.x + Math.cos(a) * rad, POND.z + Math.sin(a) * rad), POND.z + Math.sin(a) * rad);
		pg.add(m);
	}
	root.add(shadowed(pg, false));
	addCyl(POND.x, POND.z, POND.r + 0.3, -2, 30);
	keepClear(POND.x, POND.z, POND.r + 2);

	// Rayou's den: a rock shelter facing the start, with a ledge on top.
	const den = new THREE.Group();
	const rocks: [number, number, number, number][] = [
		[-1.9, 0.4, 1.3, 1.6],
		[1.9, 0.4, 1.3, 1.6],
		[-1.4, 1.9, 1.1, 1.5],
		[1.4, 1.9, 1.1, 1.5],
		[0, 2.4, 1.2, 1.4],
	];
	for (const [dx, dz, s, sy] of rocks) {
		const m = rockMesh(s, '#a3927f', r);
		m.scale.y = sy;
		m.position.set(DEN.x + dx, g(DEN.x + dx, DEN.z + dz) + s * 0.6, DEN.z + dz);
		den.add(m);
		addCyl(DEN.x + dx, DEN.z + dz, s * 0.85, -1, g(DEN.x, DEN.z + 1.2) + 1.65);
	}
	const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 3.0), mat('#968671'));
	slab.position.set(DEN.x, g(DEN.x, DEN.z + 1.2) + 2.35, DEN.z + 1.2);
	slab.rotation.y = 0.05;
	den.add(slab);
	addBox(DEN.x, DEN.z + 1.2, 2.3, 1.5, slab.position.y - 0.25 - 0.4, slab.position.y + 0.25, 0.05);
	const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.15, 12), mat('#c98a3c'));
	bed.position.set(DEN.x, g(DEN.x, DEN.z + 1) + 0.07, DEN.z + 1);
	den.add(bed);
	// Stepping rocks up to the slab.
	const steps: [number, number, number][] = [
		[DEN.x + 3.4, DEN.z - 0.6, 0.8],
		[DEN.x + 3.7, DEN.z + 1.3, 1.6],
	];
	for (const [x, z, top] of steps) {
		const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, top, 7), mat('#b3a28c'));
		const gy = g(x, z);
		m.position.set(x, gy + top / 2 - 0.05, z);
		den.add(m);
		addCyl(x, z, 0.65, -1, gy + top);
	}
	root.add(shadowed(den));
	keepClear(DEN.x, DEN.z + 1, 6);
	keepClear(START.x, START.z, 3);

	// Signpost.
	const sp = new THREE.Group();
	sp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6).translate(0, 1.2, 0), mat('#7a5233')));
	const boards: [string, number, number][] = [
		['Grand Chêne', Math.PI, 2.1],
		['Rivière', Math.PI / 2, 1.8],
		['Bois', -Math.PI / 2, 1.5],
		['Moulin', -Math.PI * 0.75, 1.2],
		['Lac', 0, 0.9],
	];
	for (const [label, yaw, y] of boards) {
		const tex = textTexture([label], 256, 64);
		const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.05), tex ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }) : mat('#d9b07a'));
		const arm = new THREE.Group();
		b.position.set(0, 0, 0.55);
		b.rotation.y = Math.PI / 2;
		arm.add(b);
		arm.position.y = y;
		arm.rotation.y = yaw;
		sp.add(arm);
	}
	sp.position.set(1, g(1, 3.5), 3.5);
	root.add(shadowed(sp));
	addCyl(1, 3.5, 0.15, -1, 3);
}

function stumpDeco(x: number, z: number, r: number, h: number): THREE.Group {
	const grp = new THREE.Group();
	const bark = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.03, r + 0.05, h, 9), mat('#9a6a43'));
	bark.position.y = h / 2;
	const ring = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 9), mat('#d8b07a'));
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = h + 0.003;
	grp.add(bark, ring);
	grp.position.set(x, g(x, z) - 0.02, z);
	return grp;
}

// — The Great Oak, in its walled valley. —
function buildOak(root: THREE.Group, r: () => number, out: Partial<Zones>) {
	const oak = new THREE.Group();
	const gy = g(OAK.x, OAK.z);
	oak.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 9, 10).translate(0, 4.5, 0), mat('#7a5233')));
	for (let i = 0; i < 7; i++) {
		const a = (i / 7) * Math.PI * 2;
		const root_ = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 5), mat('#6d4a2d'));
		root_.position.set(Math.cos(a) * 2.2, 0.4, Math.sin(a) * 2.2);
		root_.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
		oak.add(root_);
	}
	for (let i = 0; i < 5; i++) {
		const a = i * 1.3;
		const br = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 4.5, 6), mat('#7a5233'));
		br.position.set(Math.cos(a) * 1.9, 8.4, Math.sin(a) * 1.9);
		br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
		oak.add(br);
	}
	const greens = ['#4f9e45', '#5fae4a', '#6dbb52', '#468f3e'];
	for (let i = 0; i < 14; i++) {
		const a = r() * Math.PI * 2, rad = r() * 5.2;
		const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + r() * 1.4, 0), mat(greens[i % 4]));
		b.position.set(Math.cos(a) * rad, 10.5 + r() * 3.2 - rad * 0.25, Math.sin(a) * rad);
		b.rotation.set(r() * 3, r() * 3, r() * 3);
		oak.add(b);
	}
	// Hollow with a door: the owl's home.
	const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), mat('#2e1d12'));
	hollow.position.set(0, 3.4, 2.05);
	hollow.rotation.x = -0.12;
	oak.add(hollow);
	oak.position.set(OAK.x, gy - 0.2, OAK.z);
	root.add(shadowed(oak));
	out.canopies!.push(oak);
	addCyl(OAK.x, OAK.z, 2.5, -2, 40);
	out.crowns!.push({ x: OAK.x, z: OAK.z, r: 7.5, y0: gy + 7.5, y1: gy + 16 });
	keepClear(OAK.x, OAK.z, OAK.valley + 2.5);

	const perchTop = g(OWL_SPOT.x, OWL_SPOT.z) + 1.1;
	root.add(shadowed(stumpDeco(OWL_SPOT.x, OWL_SPOT.z, 0.45, 1.1)));
	addCyl(OWL_SPOT.x, OWL_SPOT.z, 0.5, -1, perchTop);

	// The fallen trunk across the gate: too high to jump, low enough to roll under.
	const gz = OAK_GATE.z;
	const g0 = g(OAK_GATE.x, gz);
	// Thick enough that its top cannot be reached from the ridge flanks either.
	const trunk = logMesh(10, 1.05);
	trunk.position.set(OAK_GATE.x, g0 + 0.62 + 1.05, gz);
	trunk.rotation.z = 0.03;
	root.add(trunk);
	addBox(OAK_GATE.x, gz, 5, 1.0, g0 + 0.62, g0 + 2.72);
	for (const s of [-1, 1]) {
		const prop = rockMesh(0.7, '#9a8a79', r);
		prop.position.set(OAK_GATE.x + s * 3.3, g(OAK_GATE.x + s * 3.3, gz) + 0.3, gz);
		root.add(shadowed(prop));
	}
	// Leaves on the trunk and a sign.
	const leafM = mat('#6dbb52');
	for (let i = 0; i < 6; i++) {
		const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + r() * 0.2, 0), leafM);
		l.position.set(OAK_GATE.x + (r() - 0.5) * 7, g0 + 2.75, gz + (r() - 0.5) * 0.6);
		root.add(l);
	}

	// Festival garlands inside the valley, lit at the end.
	const fest = new THREE.Group();
	const lampM = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 0.15, roughness: 0.6 });
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2;
		const x = OAK.x + Math.cos(a) * 7.5, z = OAK.z + Math.sin(a) * 7.5;
		if (Math.abs(x - OAK.x) < 2 && z > OAK.z) continue;
		const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5).translate(0, 0.9, 0), mat('#6d4a2d'));
		post.position.set(x, g(x, z), z);
		const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), lampM);
		lamp.position.set(x, g(x, z) + 1.9, z);
		fest.add(post, lamp);
	}
	root.add(shadowed(fest));
	out.festival = fest;

	// A bounce mushroom and a tall rock with a golden nut.
	const mx = OAK.x - 8, mz = OAK.z - 4;
	const mm = mushroomMesh(0.85, 0.9);
	mm.position.set(mx, g(mx, mz), mz);
	root.add(mm);
	const ms = addCyl(mx, mz, 0.85, g(mx, mz) + 0.6, g(mx, mz) + 0.9, { bouncy: 12.5, mesh: mm });
	addCyl(mx, mz, 0.3, -1, g(mx, mz) + 0.6);
	out.bouncers!.push({ solid: ms, mesh: mm, squash: 0 });
	const px = OAK.x - 9.6, pz = OAK.z - 6.2;
	const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 4, 7), mat('#a99886'));
	pillar.position.set(px, g(px, pz) + 1.9, pz);
	root.add(shadowed(pillar));
	addCyl(px, pz, 1.05, -1, g(px, pz) + 3.9);
}

// — The river: beaver, islets, ferry log, dam. —
function buildRiver(root: THREE.Group, r: () => number, out: Partial<Zones>, movers: Mover[]) {
	const lodgeZ = -14, lodgeX = riverX(lodgeZ) - BANK + 0.6;
	const lodge = new THREE.Group();
	const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#7d5232'));
	dome.scale.y = 0.75;
	lodge.add(dome);
	for (let i = 0; i < 22; i++) {
		const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6 + r(), 5), mat(i % 2 ? '#8a5a36' : '#6d4a2d'));
		const a = r() * Math.PI * 2, e = r() * 1.1;
		s.position.set(Math.cos(a) * Math.cos(e) * 1.7, Math.sin(e) * 1.25, Math.sin(a) * Math.cos(e) * 1.7);
		s.rotation.set(r() * 3, r() * 3, r() * 3);
		lodge.add(s);
	}
	lodge.position.set(lodgeX, WATER_Y + 0.1, lodgeZ);
	root.add(shadowed(lodge));
	addCyl(lodgeX, lodgeZ, 1.8, -3, 3);

	// Broken dam: stumps of poles sticking out of the water, too sparse to cross.
	const damZ = -6;
	const cx = riverX(damZ);
	for (let i = -5; i <= 5; i += 2.5) {
		const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.4, 6), mat('#6d4a2d'));
		pole.position.set(cx + i, WATER_Y + 0.25, damZ + (r() - 0.5) * 0.4);
		pole.rotation.z = (r() - 0.5) * 0.5;
		root.add(pole);
	}
	const dam = new THREE.Group();
	const logs: THREE.Object3D[] = [];
	for (let i = 0; i < 9; i++) {
		const l = logMesh(1.9, 0.32);
		l.rotation.y = Math.PI / 2;
		l.position.set(cx - 7.2 + i * 1.8, -0.22, damZ + (i % 2 ? 0.25 : -0.25));
		l.visible = false;
		dam.add(l);
		logs.push(l);
		const l2 = logMesh(1.7, 0.28);
		l2.rotation.y = Math.PI / 2;
		l2.position.set(cx - 7.2 + i * 1.8 + 0.9, -0.62, damZ);
		l2.visible = false;
		dam.add(l2);
		logs.push(l2);
	}
	const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 1.5), mat('#a87a4c'));
	deck.position.set(cx, 0.04, damZ);
	deck.visible = false;
	dam.add(deck);
	root.add(shadowed(dam));
	const damSolid = addBox(cx, damZ, 8.2, 0.8, -2.5, 0.1);
	damSolid.alive = false;
	let damT = -1;
	out.dam = {
		built: false,
		center: { x: cx, y: 0.1, z: damZ },
		build() {
			this.built = true;
			damSolid.alive = true;
			damT = 0;
		},
		update(dt: number) {
			if (damT < 0) return;
			damT += dt;
			logs.forEach((l, i) => {
				const u = Math.min(1, Math.max(0, damT * 4 - i * 0.18));
				l.visible = u > 0;
				l.scale.setScalar(Math.max(0.01, u));
			});
			deck.visible = damT > 1.5;
			if (damT > 6) damT = -1;
		},
	};

	// Islets: stepping stones, a ferry log, a launch jetty.
	const branchMesh = () => {
		const b = new THREE.Group();
		b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5).rotateZ(Math.PI / 2), mat('#8a5a36')));
		const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 4), mat('#8a5a36'));
		tw.position.set(0.2, 0.12, 0);
		tw.rotation.z = -0.8;
		b.add(tw);
		for (const x of [-0.35, 0.3]) {
			const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat('#6dbb52'));
			lf.position.set(x, 0.07, 0.05);
			b.add(lf);
		}
		return shadowed(b);
	};
	out.branches = ISLETS.map((i, k) => {
		const s = { id: `branch${k}`, ...at(i.x + 0.2, i.z - 0.2, 0.06) };
		const tree = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), mat('#4f9e45'));
		tree.position.set(i.x - 0.6, g(i.x - 0.6, i.z + 0.5) + 0.7, i.z + 0.5);
		root.add(shadowed(tree));
		addCyl(i.x - 0.6, i.z + 0.5, 0.25, -2, 5);
		return s;
	});
	(out as { branchMesh?: () => THREE.Group }).branchMesh = branchMesh;

	const stone = (x: number, z: number, rad: number) => {
		const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.15, 1.2, 8), mat('#a99886'));
		m.position.set(x, 0.05 - 0.6, z);
		root.add(shadowed(m));
		addCyl(x, z, rad, -2.5, 0.05, { unsafe: true });
	};
	const a = ISLETS[0];
	const bankA = riverX(a.z) - BANK;
	stone(bankA + 1.1, a.z - 1.1, 0.55);
	stone(bankA + 2.4, a.z + 0.6, 0.55);

	const b = ISLETS[1];
	const bankB = riverX(b.z) - BANK;
	const ferryLog = logMesh(1.9, 0.38);
	root.add(ferryLog);
	const xa = bankB + 0.95, xb = b.x - b.r - 0.95;
	const ferry = addBox(xa, b.z, 0.95, 0.42, -0.9, WATER_Y + 0.33, 0, { moving: true, mesh: ferryLog });
	movers.push((t) => {
		const k = (t % 7) / 7;
		const w = k < 0.15 ? 0 : k < 0.5 ? (k - 0.15) / 0.35 : k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
		const e = w * w * (3 - 2 * w);
		const x = xa + (xb - xa) * e;
		const y1 = WATER_Y + 0.33 + Math.sin(t * 2.1) * 0.03;
		moveSolid(ferry, x, y1, b.z);
		ferryLog.position.set(x, y1 - 0.38, b.z);
		ferryLog.rotation.x = Math.sin(t * 1.7) * 0.05;
	});

	const c = ISLETS[2];
	const bankC = riverX(c.z) - BANK;
	const jetty = new THREE.Group();
	const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.2), mat('#a87a4c'));
	plank.position.y = 0.14;
	jetty.add(plank);
	for (const [dx, dz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4), mat('#6d4a2d'));
		leg.position.set(dx, -0.5, dz);
		jetty.add(leg);
	}
	jetty.position.set(bankC - 1.1, 0, c.z);
	root.add(shadowed(jetty));
	addBox(bankC - 1.1, c.z, 1.1, 0.6, -2.5, 0.2);

	out.rescue = [
		at(bankA - 1.5, a.z),
		at(bankB - 1.5, b.z),
		at(bankC - 2, c.z),
		at(cx - BANK - 1.5, damZ - 2),
	];
	keepClear(lodgeX - 2, lodgeZ, 3);
	keepClear(cx - BANK - 1, damZ, 4);
	keepClear(bankC - 2, c.z, 4);
}

// — The forest: Simone's babies hide in five tricky spots. —
function buildForest(root: THREE.Group, r: () => number, out: Partial<Zones>) {
	const babies: Spot[] = [];
	const burrow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8b6a45'));
	burrow.scale.y = 0.6;
	burrow.position.set(-30.8, g(-30.8, -5), -5);
	const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), mat('#2e1d12'));
	hole.position.set(-30.4, g(-30.4, -4.1) + 0.3, -4.1);
	hole.rotation.y = 0.4;
	root.add(shadowed(burrow), hole);
	addCyl(-30.8, -5, 1.0, -1, 0.66 + g(-30.8, -5));
	keepClear(-30, -3, 4);

	// 1. Under a hollow log.
	{
		const x = -44, z = -13, gy = g(x, z);
		const lg = logMesh(7.2, 0.68);
		lg.position.set(x, gy + 0.6 + 0.68, z);
		root.add(lg);
		addBox(x, z, 3.6, 0.95, gy + 0.6, gy + 1.96);
		for (const s of [-1, 1]) {
			const rk = rockMesh(0.55, '#9a8a79', r);
			rk.position.set(x + s * 3.1, gy + 0.3, z);
			root.add(shadowed(rk));
		}
		babies.push({ id: 'baby0', x: x + 1.2, y: g(x + 1.2, z), z });
		keepClear(x, z, 5.5);
	}
	// 2. Inside a hedge ring closed by brambles.
	{
		const cx = -58, cz = 6, R = 3.2, n = 10;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, gy = g(x, z);
			if (i === 2) {
				const br = brambleMesh(1.0, r);
				br.position.set(x, gy, z);
				root.add(br);
				out.breakables!.push(addCyl(x, z, 0.95, gy - 1, gy + 2.0, { id: 'bramble', breakable: true, mesh: br }));
			} else {
				const bush = new THREE.Group();
				for (let k = 0; k < 3; k++) {
					const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + r() * 0.25, 0), mat(k % 2 ? '#3f7d3a' : '#4a8a3f'));
					b.position.set((r() - 0.5) * 0.5, 0.7 + k * 0.55, (r() - 0.5) * 0.5);
					bush.add(b);
				}
				bush.position.set(x, gy, z);
				root.add(shadowed(bush));
				addCyl(x, z, 0.95, gy - 1, gy + 2.3);
			}
		}
		babies.push({ id: 'baby1', x: cx, y: g(cx, cz), z: cz });
		keepClear(cx, cz, 6);
	}
	// 3. On top of a spiral of stumps.
	{
		const cx = -40, cz = 14;
		const tops = [0.8, 1.6, 2.4, 3.2];
		tops.forEach((h, i) => {
			const a = ((200 + i * 50) * Math.PI) / 180;
			const x = cx + Math.cos(a) * 2.2, z = cz + Math.sin(a) * 2.2;
			stump(root, x, z, 0.6, g(x, z), g(x, z) + h);
		});
		const top = g(cx, cz) + 4.0;
		stump(root, cx, cz, 0.9, g(cx, cz), top);
		babies.push({ id: 'baby2', x: cx, y: top, z: cz });
		keepClear(cx, cz, 5);
	}
	// 4. On a rock pillar, reached with a bounce mushroom.
	{
		const px = -62, pz = -22, gy = g(px, pz);
		const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 4.1, 8), mat('#a99886'));
		pillar.position.set(px, gy + 1.95, pz);
		root.add(shadowed(pillar));
		addCyl(px, pz, 1.2, -1, gy + 4.0);
		const mx = px + 2.6, mz = pz + 1.0, my = g(mx, mz);
		const mm = mushroomMesh(0.9, 0.9);
		mm.position.set(mx, my, mz);
		root.add(mm);
		out.bouncers!.push({ solid: addCyl(mx, mz, 0.9, my + 0.6, my + 0.9, { bouncy: 13, mesh: mm }), mesh: mm, squash: 0 });
		addCyl(mx, mz, 0.3, -1, my + 0.6);
		babies.push({ id: 'baby3', x: px, y: gy + 4.0, z: pz });
		keepClear(px + 1, pz, 5.5);
	}
	// 5. In a corral of fallen trees; one is raised.
	{
		const cx = -66, cz = -6, h = 2.6;
		for (const [dx, dz, yaw, raised] of [[0, -h, 0, false], [0, h, 0, false], [-h, 0, Math.PI / 2, false], [h, 0, Math.PI / 2, true]] as const) {
			const x = cx + dx, z = cz + dz, gy = g(x, z);
			const lg = logMesh(6.0, 0.6);
			lg.rotation.y = yaw;
			const y0 = raised ? gy + 0.62 : gy - 0.5;
			lg.position.set(x, raised ? y0 + 0.6 : gy + 0.75, z);
			root.add(lg);
			addBox(x, z, 3.2, 0.62, y0, gy + (raised ? 1.84 : 2.1), yaw);
			if (!raised) {
				const lg2 = logMesh(5.6, 0.5);
				lg2.rotation.y = yaw;
				lg2.position.set(x, gy + 1.7, z);
				root.add(lg2);
			} else
				for (const s of [-1, 1]) {
					const rk = rockMesh(0.55, '#9a8a79', r);
					rk.position.set(x, gy + 0.3, z + s * 2.6);
					root.add(shadowed(rk));
				}
		}
		babies.push({ id: 'baby4', x: cx, y: g(cx, cz), z: cz });
		keepClear(cx, cz, 5.5);
	}
	out.babies = babies;

	// Decorative mushrooms, some bouncy.
	for (const [x, z, s, bounce] of [[-36, -18, 0.6, false], [-50, 4, 0.5, false], [-46, 22, 0.8, true], [-56, -12, 0.7, true], [-34, 8, 0.45, false]] as const) {
		const mm = mushroomMesh(s, s * 1.1);
		const gy = g(x, z);
		mm.position.set(x, gy, z);
		root.add(mm);
		if (bounce) out.bouncers!.push({ solid: addCyl(x, z, s, gy + s * 1.1 - 0.3, gy + s * 1.1, { bouncy: 11, mesh: mm }), mesh: mm, squash: 0 });
		addCyl(x, z, s * 0.35, -1, gy + s * 1.1 - 0.3);
		keepClear(x, z, 2.2);
	}
}

// — The mill and the rabbits' garden. —
function buildMill(root: THREE.Group, r: () => number, out: Partial<Zones>, movers: Mover[]) {
	const G = g(MILL.x, MILL.z);
	const tower = new THREE.Group();
	tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.55, 8, 12).translate(0, 4, 0), mat('#efe2c8')));
	for (let i = 0; i < 4; i++) {
		const band = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.5, 0.12, 12), mat('#c9b79c'));
		band.position.y = 1 + i * 2;
		tower.add(band);
	}
	const cap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.6, 10), mat('#c8553d'));
	cap.position.y = 8.8;
	tower.add(cap);
	const vane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), mat('#3a2a1c'));
	vane.position.y = 9.9;
	tower.add(vane);
	const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.12), mat('#8a5a3b'));
	door.position.set(0, 0.85, 2.52);
	tower.add(door);
	const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.25, 16), mat('#a87a4c'));
	deck.position.y = 4.875;
	tower.add(deck);
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * Math.PI * 2;
		if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), mat('#7a5233'));
		post.position.set(Math.cos(a) * 3.3, 5.3, Math.sin(a) * 3.3);
		tower.add(post);
	}
	tower.position.set(MILL.x, G, MILL.z);
	root.add(shadowed(tower));
	addCyl(MILL.x, MILL.z, 2.45, -1, G + 8);
	addCyl(MILL.x, MILL.z, 1.0, G + 8, G + 9.6);
	addCyl(MILL.x, MILL.z, 3.4, G + 4.75, G + 5.0);

	const blades = new THREE.Group();
	for (let i = 0; i < 4; i++) {
		const arm = new THREE.Group();
		const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.08), mat('#7a5233'));
		beam.position.y = 1.9;
		const sail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.8, 0.03), mat('#f6efe0'));
		sail.position.set(0.5, 2.2, 0.02);
		arm.add(beam, sail);
		arm.rotation.z = (i * Math.PI) / 2;
		blades.add(arm);
	}
	const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 8).rotateX(Math.PI / 2), mat('#7a5233'));
	blades.add(hub);
	blades.position.set(MILL.x, G + 6.3, MILL.z + 2.75);
	root.add(shadowed(blades));
	movers.push((t) => (blades.rotation.z = t * 0.35));

	// Shed east of the tower, and the route up.
	const shedX = MILL.x + 5.6, shedZ = MILL.z - 0.3;
	block(root, shedX, shedZ, 3.0, 3.4, G - 1, G + 2.4, '#b4734a');
	const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 3.7), mat('#8a4b30'));
	shedRoof.position.set(shedX, G + 2.47, shedZ);
	root.add(shadowed(shedRoof));
	const hay = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), mat('#e6c35c'));
	const hx = shedX + 2.7, hz = shedZ + 2.0;
	hay.position.set(hx, g(hx, hz) + 0.4, hz);
	root.add(shadowed(hay));
	addBox(hx, hz, 0.7, 0.5, -1, g(hx, hz) + 0.8);
	const sx = shedX + 2.0, sz = shedZ + 0.2, sg = g(sx, sz);
	crate(root, sx, sz, 0.9, sg);
	crate(root, sx, sz, 0.8, sg + 0.9, 0.3);
	crate(root, shedX - 0.9, shedZ - 0.6, 0.9, G + 2.4);
	const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 10), mat('#8a5a36'));
	const bx = shedX - 1.5, bz = shedZ + 0.9;
	barrel.position.set(bx, G + 2.4 + 0.9, bz);
	root.add(shadowed(barrel));
	addCyl(bx, bz, 0.45, G + 2.4, G + 4.2);

	// Ledges spiralling up the north side to the top.
	[[-0.55, 5.8], [-1.3, 6.6], [-2.05, 7.4]].forEach(([a, top]) => {
		const x = MILL.x + Math.cos(a) * 2.85, z = MILL.z + Math.sin(a) * 2.85;
		block(root, x, z, 0.95, 0.95, G + top - 0.25, G + top, '#a87a4c', -a);
	});
	out.kite = { x: MILL.x - 1.45, y: G + 8, z: MILL.z + 0.4 };

	// Garden: fence, carrot rows, burrow.
	const gx = MILL.x + 6, gz = MILL.z + 7;
	const fenceM = mat('#c9a06a');
	const fence = (x0: number, z0: number, x1: number, z1: number) => {
		const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
		const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gy = g(mx, mz);
		const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), fenceM);
		rail.position.set(mx, gy + 0.62, mz);
		rail.rotation.y = yaw;
		const rail2 = rail.clone();
		rail2.position.y = gy + 0.32;
		root.add(shadowed(rail), shadowed(rail2));
		for (let k = 0; k <= Math.floor(len / 1.2); k++) {
			const u = k / Math.floor(len / 1.2);
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), fenceM);
			post.position.set(x0 + (x1 - x0) * u, g(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u) + 0.4, z0 + (z1 - z0) * u);
			root.add(shadowed(post));
		}
		addBox(mx, mz, 0.08, len / 2, -1, gy + 0.72, yaw);
	};
	fence(gx - 4, gz - 3, gx + 4, gz - 3);
	fence(gx + 4, gz - 3, gx + 4, gz + 3);
	fence(gx + 4, gz + 3, gx - 4, gz + 3);
	fence(gx - 4, gz + 3, gx - 4, gz + 0.6);
	fence(gx - 4, gz - 1.2, gx - 4, gz - 3);
	const leaf = mat('#5fae4a'), carrot = mat('#f08a2c');
	for (let row = 0; row < 4; row++)
		for (let k = 0; k < 9; k++) {
			const x = gx - 3 + k * 0.75, z = gz - 1.9 + row * 1.25;
			const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), carrot);
			c.position.set(x, g(x, z) + 0.03, z);
			c.rotation.x = Math.PI;
			const l = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), leaf);
			l.position.set(x, g(x, z) + 0.2, z);
			root.add(c, l);
		}
	const mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8b6a45'));
	mound.scale.y = 0.55;
	mound.position.set(MILL.x + 9.5, g(MILL.x + 9.5, MILL.z - 4), MILL.z - 4);
	root.add(shadowed(mound));
	addCyl(mound.position.x, mound.position.z, 0.85, -1, mound.position.y + 0.5);
	keepClear(MILL.x + 3, MILL.z + 2, 11);
}

// — The lake: the frog's pier, lily pads, an island. —
function buildLake(root: THREE.Group, r: () => number, out: Partial<Zones>, movers: Mover[]) {
	const pier = new THREE.Group();
	const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 5.8), mat('#a87a4c'));
	deck.position.y = 0.18;
	pier.add(deck);
	for (let k = 0; k < 4; k++)
		for (const s of [-1, 1]) {
			const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4), mat('#6d4a2d'));
			leg.position.set(s * 0.65, -1.0, -2.6 + k * 1.7);
			pier.add(leg);
		}
	pier.position.set(5, 0, 35.6);
	root.add(shadowed(pier));
	addBox(5, 35.6, 0.75, 2.9, -2.4, 0.25);
	keepClear(5, 33, 3);

	const padM = mat('#4f9e45'), padM2 = mat('#5fae4a');
	const flowerM = mat('#ffb3d1');
	const pad = (x: number, z: number, rad: number, kind: 'still' | 'drift' | 'sink' = 'still', cx = x, cz = z) => {
		const m = new THREE.Group();
		const leafMesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.08, 14, 1, false, 0.3, Math.PI * 1.85), rad > 0.85 ? padM2 : padM);
		m.add(leafMesh);
		if (r() > 0.6) {
			const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), flowerM);
			f.position.set(rad * 0.4, 0.1, rad * 0.2);
			m.add(f);
		}
		root.add(shadowed(m, false));
		const top = WATER_Y + 0.07;
		const s = addCyl(x, z, rad, top - 0.3, top, { moving: true, mesh: m });
		const seed = r() * 6;
		let sink = 0;
		movers.push((t, standing) => {
			let px = x, pz = z;
			if (kind === 'drift') {
				px = cx + Math.cos(t * 0.45 + seed) * 1.6;
				pz = cz + Math.sin(t * 0.45 + seed) * 1.6;
			}
			if (kind === 'sink') sink = Math.max(0, Math.min(1, sink + (standing === s ? 0.006 : -0.02)));
			const y = top + Math.sin(t * 1.6 + seed) * 0.025 - sink * 0.45;
			moveSolid(s, px, y, pz);
			m.position.set(px, y - 0.04, pz);
			m.rotation.y = seed + Math.sin(t * 0.3 + seed) * 0.2;
		});
		return s;
	};
	// Every pad sits well inside the water line (radius ~12.5).
	const pads: [number, number, number, ('still' | 'drift' | 'sink')?, number?, number?][] = [
		[5.2, 40.2, 0.85],
		[6.6, 42.3, 0.8],
		[5.0, 44.6, 0.8],
		// East loop
		[9.6, 48.6, 0.8],
		[12.4, 49.4, 0.9, 'drift', 12.4, 49.4],
		[15.4, 47.3, 0.8],
		[15.0, 44.0, 0.8],
		[13.6, 41.2, 0.75],
		// West loop
		[3.0, 50.9, 0.8],
		[0.6, 52.6, 0.8],
		[-2.3, 52.0, 0.85, 'sink'],
		[-4.4, 49.3, 0.8],
		[-5.2, 46.0, 0.75],
		[-4.0, 42.6, 0.85],
	];
	for (const [x, z, rad, kind, cx, cz] of pads) pad(x, z, rad, kind ?? 'still', cx, cz);
	// The frog's mooring post, beside the pier so it never blocks it.
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 2.4, 8), mat('#7a5233'));
	post.position.set(6.25, 0.45 - 1.2, 37.2);
	root.add(shadowed(post));
	addCyl(6.25, 37.2, 0.36, -2.5, 0.45);

	const isle = new THREE.Group();
	const tree = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), mat('#7a5233'));
	const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), mat('#6dbb52'));
	crown.position.y = 2.1;
	isle.add(tree, crown);
	isle.position.set(LAKE_ISLE.x - 0.9, g(LAKE_ISLE.x - 0.9, LAKE_ISLE.z - 0.6), LAKE_ISLE.z - 0.6);
	root.add(shadowed(isle));
	addCyl(isle.position.x, isle.position.z, 0.25, -2, 6);

	out.orbs = [
		{ id: 'orb0', ...at(6.6, 42.3, 0.7) },
		{ id: 'orb1', ...at(LAKE_ISLE.x + 0.8, LAKE_ISLE.z + 0.3, 0.7) },
		{ id: 'orb2', ...at(15.4, 47.3, 0.7) },
		{ id: 'orb3', ...at(13.6, 41.2, 0.7) },
		{ id: 'orb4', ...at(0.6, 52.6, 0.7) },
		{ id: 'orb5', ...at(-5.2, 46.0, 0.7) },
	];
	// Reeds along the shore.
	const reedM = mat('#7a9a4a');
	for (let i = 0; i < 70; i++) {
		const a = r() * Math.PI * 2, rad = LAKE.r + 0.2 + r() * 1.2;
		const x = LAKE.x + Math.cos(a) * rad, z = LAKE.z + Math.sin(a) * rad;
		if (Math.abs(x - 5) < 1.5 && z < 40) continue;
		const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.9 + r() * 0.6, 4), reedM);
		reed.position.set(x, g(x, z) + 0.45, z);
		reed.rotation.set((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
		root.add(reed);
	}
}

// — The Peak: seven terraces, a device to climb each one. —
function buildMountain(root: THREE.Group, r: () => number, out: Partial<Zones>, movers: Mover[]) {
	const P = (rad: number, a: number) => mountPoint(rad, a);
	// d1: crates from ring 0 to ring 1.
	([[24.6, -1.56, 2.8], [24.0, -1.475, 3.6], [23.5, -1.395, 4.4]] as const).forEach(([rad, a, top]) => {
		const p = P(rad, a);
		crate(root, p.x, p.z, 1.0, top - 1.0, -a);
		if (top - 1.0 > ringLevel(0) + 0.05) block(root, p.x, p.z, 0.96, 0.96, ringLevel(0) - 0.01, top - 1.0, '#9a6634', -a);
	});
	// d2: climb wall from ring 1 to ring 2.
	{
		const a = 0.5;
		const base = P(20.7, a), edge = P(19.85, a), top = P(19.0, a);
		const spot: ClimbSpot = { id: 'peak', base: { ...base, y: ringLevel(1) }, edge: { ...edge, y: ringLevel(2) + 0.1 }, top: { ...top, y: ringLevel(2) }, prints: new THREE.Group() };
		spot.prints = pawPrints(spot.base, { x: Math.cos(a), z: Math.sin(a) });
		root.add(spot.prints);
		out.climbs!.push(spot);
		for (let i = 0; i < 4; i++) {
			const ledge = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 7), mat('#c2b19a'));
			const p = P(20.15, a + (i % 2 ? 0.02 : -0.02));
			ledge.position.set(p.x, ringLevel(1) + 0.4 + i * 0.75, p.z);
			root.add(shadowed(ledge));
		}
	}
	// d3: bounce mushroom from ring 2 to ring 3.
	{
		const p = P(18.6, 2.4);
		const y = ringLevel(2);
		const mm = mushroomMesh(0.85, 0.9);
		mm.position.set(p.x, y, p.z);
		root.add(mm);
		out.bouncers!.push({ solid: addCyl(p.x, p.z, 0.85, y + 0.6, y + 0.9, { bouncy: 13, mesh: mm }), mesh: mm, squash: 0 });
		addCyl(p.x, p.z, 0.3, y - 1, y + 0.6);
	}
	// d4: a low slab over the ramp from ring 3 to ring 4: roll under it.
	{
		const a = -2.1;
		const p = P(15.5, a);
		const y = ringLevel(3);
		const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.9, 1.7), mat('#968671'));
		slab.position.set(p.x, y + 0.62 + 0.95, p.z);
		slab.rotation.y = -a;
		root.add(shadowed(slab));
		addBox(p.x, p.z, 2.3, 0.85, y + 0.62, y + 2.52, -a);
		for (const s of [-1, 1]) {
			const q = P(15.5 + s * 1.9, a);
			const rk = rockMesh(0.6, '#9a8a79', r);
			rk.position.set(q.x, y + 0.3, q.z);
			root.add(shadowed(rk));
		}
	}
	// d5: a stone piston from ring 4 to ring 5.
	{
		const p = P(11.85, 0.2);
		const lo = ringLevel(4), hi = ringLevel(5) + 0.12;
		const col = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), mat('#b9a58c'));
		const capM = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.7), mat('#d8c7a6'));
		root.add(shadowed(col), shadowed(capM));
		const s = addBox(p.x, p.z, 0.8, 0.8, lo - 0.2, lo, -0.2, { moving: true, mesh: col });
		movers.push((t) => {
			const k = (t % 9) / 9;
			const w = k < 0.22 ? 0 : k < 0.5 ? (k - 0.22) / 0.28 : k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
			const e = w * w * (3 - 2 * w);
			const top = lo + (hi - lo) * e;
			moveSolid(s, p.x, top, p.z, lo - 0.2);
			col.scale.y = top - lo + 0.25;
			col.position.set(p.x, (top + lo - 0.25) / 2, p.z);
			col.rotation.y = 0.2;
			capM.position.set(p.x, top - 0.05, p.z);
			capM.rotation.y = 0.2;
		});
	}
	// d6: a cracked boulder blocks the ramp from ring 5 to ring 6.
	{
		const p = P(9.5, 1.74);
		const y = ringLevel(5);
		const bould = new THREE.Group();
		const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), mat('#8f8070'));
		rock.scale.y = 1.05;
		bould.add(rock);
		const crack = mat('#3d3128');
		for (let i = 0; i < 5; i++) {
			const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), crack);
			c.position.set(Math.cos(i * 1.3) * 1.15, (r() - 0.5) * 0.8, Math.sin(i * 1.3) * 1.15);
			c.rotation.set(r(), 0, r() - 0.5);
			bould.add(c);
		}
		bould.position.set(p.x, y + 1.35, p.z);
		root.add(shadowed(bould));
		out.breakables!.push(addCyl(p.x, p.z, 1.45, y - 0.5, y + 2.9, { id: 'boulder', breakable: true, mesh: bould }));
	}
	// d7: pillars up to the summit.
	([[-2.2, 20.8], [-1.75, 21.6], [-1.3, 22.4]] as const).forEach(([a, top]) => {
		const p = P(6.5, a);
		const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, top - ringLevel(6) + 0.5, 8), mat('#b3a28c'));
		m.position.set(p.x, (top + ringLevel(6) - 0.5) / 2, p.z);
		root.add(shadowed(m));
		addCyl(p.x, p.z, 0.62, ringLevel(6) - 1, top);
	});

	// Summit lantern.
	const L = new THREE.Group();
	const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 10), mat('#b9a58c'));
	ped.position.y = 0.3;
	L.add(ped);
	const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 8), mat('#5b3d27'));
	pole.position.y = 1.4;
	L.add(pole);
	const housing = new THREE.Group();
	housing.position.y = 2.6;
	for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
		const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), mat('#5b3d27'));
		bar.position.set(x, 0, z);
		housing.add(bar);
	}
	const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 4), mat('#c8553d'));
	roof.position.y = 0.8;
	roof.rotation.y = Math.PI / 4;
	housing.add(roof);
	const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf6a', emissiveIntensity: 0.05, transparent: true, opacity: 0.85 }));
	housing.add(glow);
	const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.8), new THREE.MeshStandardMaterial({ color: '#fff6dd', transparent: true, opacity: 0.25, roughness: 0.1 }));
	housing.add(glass);
	L.add(housing);
	L.position.set(MOUNT.x, TOP_LEVEL, MOUNT.z);
	root.add(shadowed(L));
	addCyl(MOUNT.x, MOUNT.z, 1.2, TOP_LEVEL - 1, TOP_LEVEL + 0.6);
	addCyl(MOUNT.x, MOUNT.z, 0.5, TOP_LEVEL, TOP_LEVEL + 3.4);
	out.lantern = { x: MOUNT.x, y: TOP_LEVEL + 2.6, z: MOUNT.z };
	const light = new THREE.PointLight('#ffcf6a', 0, 40, 1.4);
	light.position.set(MOUNT.x, TOP_LEVEL + 2.7, MOUNT.z);
	root.add(light);
	out.lanternLight = light;
	out.lanternGlow = glow;

	// Rocks and little pines on the terraces.
	for (let i = 0; i < 70; i++) {
		const a = r() * Math.PI * 2;
		const k = Math.floor(r() * 7);
		const rad = R_OUT - 3 * k - 0.4 - r() * 0.3;
		const p = P(rad, a);
		if (Math.abs(groundHeight(p.x, p.z) - ringLevel(k)) > 0.01) continue;
		const nearDevice = [-1.475, 0.5, 2.4, -2.1, 0.2, 1.74, -1.75, 1.5, -0.6, 3.0, 2.9, -1.3, 0.6, 2.5, -1.4, 0.3].some((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < 0.25);
		if (nearDevice) continue;
		if (r() > 0.5) {
			const m = rockMesh(0.35 + r() * 0.3, '#a99886', r);
			m.position.set(p.x, ringLevel(k) + 0.15, p.z);
			root.add(shadowed(m));
			addCyl(p.x, p.z, 0.4, -1, ringLevel(k) + 0.4);
		} else {
			const t = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), mat('#3f8a4a'));
			t.position.set(p.x, ringLevel(k) + 0.75, p.z);
			root.add(shadowed(t));
			addCyl(p.x, p.z, 0.3, -1, ringLevel(k) + 30);
		}
	}
	// Little lanterns marking each step of the way.
	const lampM = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 0.15 });
	const fest = out.festival!;
	for (const [k, a] of [[0, 2.9], [1, -1.3], [2, 0.6], [3, 2.5], [4, -1.4], [5, 0.3], [6, 2.5]] as const) {
		const p = P(R_OUT - 3 * k - 2.6, a);
		const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5).translate(0, 0.6, 0), mat('#6d4a2d'));
		post.position.set(p.x, ringLevel(k), p.z);
		const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), lampM);
		lamp.position.set(p.x, ringLevel(k) + 1.3, p.z);
		fest.add(post, lamp);
	}
	keepClear(MOUNT.x, MOUNT.z, R_OUT + 2.5);
}

function scatterTrees(root: THREE.Group, r: () => number, out: Partial<Zones>) {
	type T = { x: number; z: number; s: number; pine: boolean };
	const trees: T[] = [];
	const blocked = (x: number, z: number, margin: number) => {
		if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + margin)) return true;
		if (distToPath(x, z) < 2 + margin) return true;
		if (Math.abs(x - riverX(z)) < RIVER.half + 2) return true;
		if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3) return true;
		if (mountPolar(x, z).d < R_OUT + 2) return true;
		if (Math.hypot(x - OAK.x, z - OAK.z) < OAK.valley + 3) return true;
		return false;
	};
	// Spacing keeps a gap wider than Rayou between any two trunks.
	const spaced = (x: number, z: number, min: number) => trees.every((t) => Math.hypot(t.x - x, t.z - z) > min);
	const inBounds = (x: number, z: number) => x > BOUNDS.x0 + 1 && x < BOUNDS.x1 - 1 && z > BOUNDS.z0 + 1 && z < BOUNDS.z1 - 1;
	// Forest.
	for (let x = BOUNDS.x0 + 2; x < -27; x += 3.1)
		for (let z = BOUNDS.z0 + 2; z < 26; z += 3.1) {
			const px = x + (r() - 0.5) * 1.6, pz = z + (r() - 0.5) * 1.6;
			if (r() < 0.22 || blocked(px, pz, 0.5) || !spaced(px, pz, 2.9)) continue;
			trees.push({ x: px, z: pz, s: 0.9 + r() * 0.6, pine: r() > 0.35 });
		}
	// Scattered elsewhere.
	for (let i = 0; i < 900 && trees.length < 560; i++) {
		const px = BOUNDS.x0 + r() * (BOUNDS.x1 - BOUNDS.x0), pz = BOUNDS.z0 + r() * (BOUNDS.z1 - BOUNDS.z0);
		if (px < -27 && pz < 26) continue;
		const nearRim = px < BOUNDS.x0 + 8 || px > BOUNDS.x1 - 8 || pz < BOUNDS.z0 + 8 || pz > BOUNDS.z1 - 8;
		if (!nearRim && r() < 0.55) continue;
		if (blocked(px, pz, 1.2) || !spaced(px, pz, 3.2) || !inBounds(px, pz)) continue;
		trees.push({ x: px, z: pz, s: 0.8 + r() * 0.6, pine: r() > 0.55 });
	}
	// Backdrop beyond the rim.
	for (let i = 0; i < 260; i++) {
		const side = Math.floor(r() * 4);
		const u = r();
		const d = 1 + r() * 7;
		const px = side === 0 ? BOUNDS.x0 - d : side === 1 ? BOUNDS.x1 + d : BOUNDS.x0 + u * (BOUNDS.x1 - BOUNDS.x0);
		const pz = side === 2 ? BOUNDS.z0 - d : side === 3 ? BOUNDS.z1 + d : BOUNDS.z0 + u * (BOUNDS.z1 - BOUNDS.z0);
		if (mountPolar(px, pz).d < R_OUT + 2) continue;
		trees.push({ x: px, z: pz, s: 1 + r() * 0.8, pine: r() > 0.4 });
	}

	const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0);
	const roundGeo = new THREE.IcosahedronGeometry(1.25, 0);
	const pineGeo = new THREE.ConeGeometry(1.2, 2.2, 7);
	const rounds = trees.filter((t) => !t.pine), pines = trees.filter((t) => t.pine);
	const trunks = new THREE.InstancedMesh(trunkGeo, mat('#8b5e3c'), trees.length);
	const canopies = new THREE.InstancedMesh(roundGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), rounds.length * 2);
	const pineMesh = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), pines.length * 3);
	const o = new THREE.Object3D();
	const col = new THREE.Color();
	const greens = ['#5fae4a', '#6dbb52', '#4f9e45', '#78c25a'];
	trees.forEach((t, i) => {
		const y = groundHeight(t.x, t.z) - 0.05;
		o.position.set(t.x, y, t.z);
		o.rotation.set(0, r() * 6, 0);
		o.scale.setScalar(t.s);
		o.updateMatrix();
		trunks.setMatrixAt(i, o.matrix);
		addCyl(t.x, t.z, 0.42 * t.s, -2, y + 30);
		out.crowns!.push({ x: t.x, z: t.z, r: 1.45 * t.s, y0: y + 1.4 * t.s, y1: y + 4.2 * t.s });
	});
	rounds.forEach((t, i) => {
		const y = groundHeight(t.x, t.z);
		for (let k = 0; k < 2; k++) {
			o.position.set(t.x + (k ? 0.5 : -0.2) * t.s, y + (2.2 + k * 0.7) * t.s, t.z + (k ? -0.3 : 0.2) * t.s);
			o.rotation.set(r() * 3, r() * 3, r() * 3);
			o.scale.setScalar(t.s * (k ? 0.75 : 1));
			o.updateMatrix();
			canopies.setMatrixAt(i * 2 + k, o.matrix);
			canopies.setColorAt(i * 2 + k, col.set(greens[Math.floor(r() * greens.length)]));
		}
	});
	pines.forEach((t, i) => {
		const y = groundHeight(t.x, t.z);
		for (let k = 0; k < 3; k++) {
			o.position.set(t.x, y + (1.8 + k * 0.85) * t.s, t.z);
			o.rotation.set(0, r() * 3, 0);
			o.scale.setScalar(t.s * (1 - k * 0.24));
			o.updateMatrix();
			pineMesh.setMatrixAt(i * 3 + k, o.matrix);
			pineMesh.setColorAt(i * 3 + k, col.set(k % 2 ? '#3f8a4a' : '#357d43'));
		}
	});
	const grp = shadowed(new THREE.Group().add(trunks, canopies, pineMesh));
	root.add(grp);
}

function scatterGrass(root: THREE.Group, r: () => number, count: number) {
	const ok = (x: number, z: number) => {
		if (distToPath(x, z) < 1.1) return false;
		if (Math.abs(x - riverX(z)) < RIVER.half + 0.8) return false;
		if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.6) return false;
		if (mountPolar(x, z).d < R_OUT + 0.5) return false;
		if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) return false;
		if (Math.abs(x - HOUSE.x) < HOUSE.w / 2 + 0.3 && Math.abs(z - HOUSE.z) < HOUSE.d / 2 + 0.3) return false;
		const gy = groundHeight(x, z), e = 0.4;
		return Math.abs(groundHeight(x + e, z) - gy) < 0.3 && Math.abs(groundHeight(x, z + e) - gy) < 0.3;
	};
	const pts: [number, number][] = [];
	for (let i = 0; i < count * 5; i++) {
		if (pts.length >= count) break;
		const x = BOUNDS.x0 + r() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + r() * (BOUNDS.z1 - BOUNDS.z0);
		// Denser near the meadow.
		if (Math.hypot(x, z) > 30 && r() < 0.45) continue;
		if (ok(x, z)) pts.push([x, z]);
	}
	const tuftGeo = new THREE.ConeGeometry(0.07, 0.35, 3).translate(0, 0.17, 0);
	const tm = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), pts.length * 3);
	const o = new THREE.Object3D();
	const c = new THREE.Color();
	pts.forEach(([x, z], i) => {
		const y = groundHeight(x, z);
		for (let k = 0; k < 3; k++) {
			o.position.set(x + (k - 1) * 0.07, y, z + (((k * 7) % 3) - 1) * 0.05);
			o.rotation.set((k - 1) * 0.35, r() * 3, (k - 1) * 0.25);
			o.scale.setScalar(0.7 + r() * 0.7);
			o.updateMatrix();
			tm.setMatrixAt(i * 3 + k, o.matrix);
			tm.setColorAt(i * 3 + k, c.set(x < -28 ? (r() > 0.5 ? '#5f9e40' : '#6aa94a') : r() > 0.5 ? '#6fb34c' : '#85c75b'));
		}
	});
	tm.receiveShadow = true;
	root.add(tm);
	const flowers = pts.filter(() => r() < 0.12);
	const fGeo = new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.2, 0);
	const fm = new THREE.InstancedMesh(fGeo, new THREE.MeshStandardMaterial({ flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.08 }), flowers.length);
	const palette = ['#ffffff', '#ffd84d', '#ff9fc4', '#c9a6ff', '#ff7a5c'];
	flowers.forEach(([x, z], i) => {
		o.position.set(x + 0.2, groundHeight(x + 0.2, z), z);
		o.rotation.set(0, 0, 0);
		o.scale.setScalar(0.8 + r() * 0.6);
		o.updateMatrix();
		fm.setMatrixAt(i, o.matrix);
		fm.setColorAt(i, c.set(palette[Math.floor(r() * palette.length)]));
	});
	root.add(fm);
}

// Golden hazelnuts: 24 hidden around the valley, most of them on top of something.
function goldNutSpots(out: Partial<Zones>): Spot[] {
	const P = (rad: number, a: number, k: number) => {
		const p = mountPoint(rad, a);
		return { x: p.x, y: ringLevel(k) + 0.5, z: p.z };
	};
	const list: P3[] = [
		at(DEN.x, DEN.z + 1.2, 0.5),
		at(HOUSE.x + HOUSE.w / 2 + 0.75, HOUSE.z - 0.6, 0.5),
		at(PLATEAU.x - 2.5, PLATEAU.z - 3, 0.5),
		at(HOUSE.x - 4, HOUSE.z - 4, 0.5),
		at(OAK.x - 9.6, OAK.z - 6.2, 0.5),
		at(OAK.x, OAK.z - 5, 0.5),
		at(ISLETS[0].x + 0.4, ISLETS[0].z + 0.8, 0.5),
		at(46, -4, 0.5),
		{ x: -45.4, y: g(-45.4, -13) + 0.4, z: -13 },
		at(-66, -6, 0.5),
		at(-68, -40, 0.5),
		at(-40, -30, 0.5),
		at(MILL.x - 3.0, MILL.z + 0.2, 0.5),
		at(MILL.x + 5.6, MILL.z - 1.2, 0.5),
		at(MILL.x + 6, MILL.z + 7.5, 0.5),
		at(-4.4, 49.3, 0.6),
		at(LAKE.x - 9, LAKE.z + 11, 0.5),
		at(15.0, 44.0, 0.6),
		P(24.5, 0.1, 0),
		P(21.5, -2.6, 1),
		P(18.5, 1.66, 2),
		P(15.5, 0.9, 3),
		P(9.5, -1.0, 5),
		P(3.5, 1.2, 7),
	];
	void out;
	return list.map((p, i) => ({ id: `gold${i}`, ...p }));
}

// lite: phones get half the grass.
export function buildZones(scene: THREE.Scene, lite = false): Zones {
	const r = rng(11);
	const root = new THREE.Group();
	scene.add(root);
	const movers: Mover[] = [];
	const out: Partial<Zones> = { climbs: [], crowns: [], canopies: [], breakables: [], bouncers: [], festival: new THREE.Group() };
	root.add(out.festival!);
	buildHub(root, r, out);
	buildOak(root, r, out);
	buildRiver(root, r, out, movers);
	buildForest(root, r, out);
	buildMill(root, r, out, movers);
	buildLake(root, r, out, movers);
	buildMountain(root, r, out, movers);
	scatterTrees(root, r, out);
	scatterGrass(root, r, lite ? 2600 : 5200);
	out.goldNuts = goldNutSpots(out);

	const sp = (x: number, z: number, yaw: number, lift = 0) => ({ ...at(x, z, lift), yaw });
	out.npcSpots = {
		feuille: { x: FEUILLE_SPOT.x, y: g(FEUILLE_SPOT.x, FEUILLE_SPOT.z) + 0.43, z: FEUILLE_SPOT.z, yaw: 0.6 },
		owl: { x: OWL_SPOT.x, y: g(OWL_SPOT.x, OWL_SPOT.z) + 1.1, z: OWL_SPOT.z, yaw: 0 },
		beaver: sp(riverX(-3) - BANK - 1.3, -3, -1.2),
		simone: sp(-29.2, -2.6, 1.6),
		caline: sp(-31, 28.6, 0.8),
		pepin: sp(-29.6, 29.9, 0.8),
		frog: { x: 6.25, y: 0.45, z: 37.2, yaw: -2.4 },
	};
	for (const k of ['beaver', 'simone', 'caline', 'pepin'] as const) {
		const s = out.npcSpots[k];
		addCyl(s.x, s.z, 0.4, s.y - 1, s.y + 1);
	}

	return {
		...(out as Zones),
		update(dt, time, standing) {
			for (const m of movers) m(time, standing);
			out.dam!.update(dt);
			for (const b of out.bouncers!) {
				b.squash = Math.max(0, b.squash - dt * 3);
				const s = 1 - Math.sin(b.squash * Math.PI) * 0.25;
				b.mesh.scale.set(1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6);
			}
		},
	};
}

export { baseHeight };
