import * as THREE from 'three';

export interface Circle { x: number; z: number; r: number }
export interface Box { x: number; z: number; hw: number; hd: number }

export const PLATEAU = { x: 12, z: -10, r: 6, h: 2.4 };
export const POND = { x: -10, z: 8, r: 3.4 };
export const HOUSE = { x: -6, z: -5, w: 5, d: 4 };
export const BOUNDS = 22;
export const START = new THREE.Vector3(2, 0, 7);
export const SALLY_SPOT = new THREE.Vector3(-3.2, 0, -1.6);

const CLIMB_DIR = new THREE.Vector2(HOUSE.x - PLATEAU.x, HOUSE.z + 9 - PLATEAU.z).normalize();
export const CLIMB_BASE = new THREE.Vector3(PLATEAU.x + CLIMB_DIR.x * (PLATEAU.r + 0.9), 0, PLATEAU.z + CLIMB_DIR.y * (PLATEAU.r + 0.9));
export const CLIMB_TOP = new THREE.Vector3(PLATEAU.x + CLIMB_DIR.x * (PLATEAU.r - 1.4), 0, PLATEAU.z + CLIMB_DIR.y * (PLATEAU.r - 1.4));
export const HAZEL = new THREE.Vector3(PLATEAU.x + 2, 0, PLATEAU.z - 1.6);
export const NUT_SPOT = new THREE.Vector3(PLATEAU.x + 0.6, 0, PLATEAU.z - 0.2);

const PATH_A = new THREE.Vector2(START.x, START.z);
const PATH_B = new THREE.Vector2(HOUSE.x + 0.8, HOUSE.z + HOUSE.d / 2);

export const circles: Circle[] = [];
// Tree crowns, for keeping the camera out of them.
export const crowns: Circle[] = [];
export const boxes: Box[] = [{ x: HOUSE.x, z: HOUSE.z, hw: HOUSE.w / 2 + 0.15, hd: HOUSE.d / 2 + 0.15 }];

const smooth = (e0: number, e1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

export function plateauFactor(x: number, z: number): number {
	return smooth(PLATEAU.r + 0.45, PLATEAU.r - 0.35, Math.hypot(x - PLATEAU.x, z - PLATEAU.z));
}

export function groundHeight(x: number, z: number): number {
	let h = 0.18 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 0.1 * Math.sin((x + z) * 0.37);
	const p = plateauFactor(x, z);
	h += p * (PLATEAU.h + 0.1 * Math.sin(x * 0.9) * Math.cos(z * 0.7));
	h -= 0.5 * smooth(POND.r + 0.6, POND.r - 0.8, Math.hypot(x - POND.x, z - POND.z));
	const dh = Math.max(Math.abs(x - HOUSE.x) - HOUSE.w / 2 - 1, Math.abs(z - HOUSE.z) - HOUSE.d / 2 - 1);
	h *= 1 - smooth(1.5, 0, dh);
	h += smooth(BOUNDS - 2, BOUNDS + 8, Math.hypot(x, z)) * 4;
	return h;
}

function distToPath(x: number, z: number): number {
	const ab = PATH_B.clone().sub(PATH_A);
	const t = Math.min(1, Math.max(0, new THREE.Vector2(x, z).sub(PATH_A).dot(ab) / ab.lengthSq()));
	return Math.hypot(x - (PATH_A.x + ab.x * t), z - (PATH_A.y + ab.y * t));
}

function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
	new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

function shadowed<T extends THREE.Object3D>(o: T, cast = true): T {
	o.traverse((c) => {
		if ((c as THREE.Mesh).isMesh) {
			c.castShadow = cast;
			c.receiveShadow = true;
		}
	});
	return o;
}

function buildTerrain(): THREE.Mesh {
	const geo = new THREE.PlaneGeometry(90, 90, 180, 180).toNonIndexed();
	geo.rotateX(-Math.PI / 2);
	const pos = geo.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
	const colors = new Float32Array(pos.count * 3);
	const c = new THREE.Color();
	const grass = ['#8cc65a', '#7dbb4e', '#97cd63', '#86c255'];
	for (let f = 0; f < pos.count; f += 3) {
		const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
		const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
		const ys = [pos.getY(f), pos.getY(f + 1), pos.getY(f + 2)];
		const slope = Math.max(...ys) - Math.min(...ys);
		const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
		const pond = Math.hypot(cx - POND.x, cz - POND.z);
		if (slope > 0.35) c.set(hash > 0.5 ? '#a08a74' : '#93806c');
		else if (pond < POND.r + 0.9) c.set(hash > 0.5 ? '#d9c08f' : '#cfb582');
		else if (distToPath(cx, cz) < 0.85 + 0.25 * Math.sin(cx * 2.1)) c.set(hash > 0.5 ? '#e2c48e' : '#d8b97f');
		else if (plateauFactor(cx, cz) > 0.9) c.set(hash > 0.5 ? '#9fcf68' : '#93c75c');
		else c.set(grass[Math.floor(hash * grass.length)]);
		for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geo.computeVertexNormals();
	const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
	mesh.receiveShadow = true;
	return mesh;
}

function buildSky(): THREE.Mesh {
	const geo = new THREE.SphereGeometry(300, 24, 12);
	const m = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		uniforms: { top: { value: new THREE.Color('#6fb6e8') }, mid: { value: new THREE.Color('#bfe0f2') }, bottom: { value: new THREE.Color('#ffe1b6') } },
		vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
		fragmentShader:
			'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
	});
	return new THREE.Mesh(geo, m);
}

function buildHouse(): THREE.Group {
	const g = new THREE.Group();
	const { w, d } = HOUSE;
	const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), mat('#f4e3c4'));
	walls.position.y = 1.2;
	g.add(walls);
	const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2), mat('#b9a58c'));
	base.position.y = 0.17;
	g.add(base);
	// A 3-sided prism with one edge up: the gable roof.
	const R = (d + 0.8) / Math.sqrt(3);
	const roof = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w + 0.6, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), mat('#c8553d'));
	roof.scale.y = 0.45;
	roof.position.y = 2.4 + (R / 2) * 0.45;
	g.add(roof);
	const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), mat('#a8483a'));
	chimney.position.set(w / 2 - 1, 3.9, -0.6);
	g.add(chimney);
	const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12), mat('#8a5a3b'));
	door.position.set(0.8, 0.95, d / 2 + 0.03);
	g.add(door);
	const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#f2c14e', { metalness: 0.6, roughness: 0.3 }));
	knob.position.set(1.1, 0.95, d / 2 + 0.12);
	g.add(knob);
	for (const [x, z, ry] of [[-1.2, d / 2 + 0.03, 0], [w / 2 + 0.03, 0, Math.PI / 2], [-w / 2 - 0.03, 0, Math.PI / 2]] as const) {
		const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.1), mat('#ffffff'));
		frame.position.set(x, 1.45, z);
		frame.rotation.y = ry;
		const glass = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.12), mat('#9fd3ec', { emissive: '#ffd99a', emissiveIntensity: 0.25 }));
		glass.position.copy(frame.position);
		glass.rotation.y = ry;
		g.add(frame, glass);
	}
	const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.6), mat('#c9b79c'));
	step.position.set(0.8, 0.1, d / 2 + 0.35);
	g.add(step);
	g.position.set(HOUSE.x, 0, HOUSE.z);
	return shadowed(g);
}

export const CHIMNEY_TOP = new THREE.Vector3(HOUSE.x + HOUSE.w / 2 - 1, 4.6, HOUSE.z - 0.6);

function rock(size: number, color: string, r: () => number): THREE.Mesh {
	const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat(color));
	m.rotation.set(r() * 3, r() * 3, r() * 3);
	return m;
}

function buildPlateauRocks(r: () => number): THREE.Group {
	const g = new THREE.Group();
	const climbAngle = Math.atan2(CLIMB_DIR.y, CLIMB_DIR.x);
	const n = 34;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + r() * 0.08;
		let da = Math.abs(a - climbAngle);
		da = Math.min(da, Math.PI * 2 - da);
		if (da < 0.2) continue;
		const s = 0.75 + r() * 0.45;
		const m = rock(s, r() > 0.5 ? '#a99886' : '#9a8a79', r);
		m.scale.set(1, 1.5 + r() * 0.6, 1);
		const rad = PLATEAU.r + 0.05;
		m.position.set(PLATEAU.x + Math.cos(a) * rad, 0.9 + r() * 0.4, PLATEAU.z + Math.sin(a) * rad);
		g.add(m);
		circles.push({ x: m.position.x, z: m.position.z, r: 0.6 });
	}
	// The climbing route: stacked ledges marked with paw prints.
	for (let i = 0; i < 4; i++) {
		const t = i / 3;
		const rad = PLATEAU.r + 0.55 - t * 0.9;
		const ledge = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.35, 7), mat('#c2b19a'));
		ledge.position.set(PLATEAU.x + CLIMB_DIR.x * rad, 0.2 + t * 2.1, PLATEAU.z + CLIMB_DIR.y * rad);
		ledge.rotation.y = i * 0.7;
		g.add(ledge);
	}
	return shadowed(g);
}

export function buildPawPrints(): THREE.Group {
	const g = new THREE.Group();
	const m = new THREE.MeshBasicMaterial({ color: '#5a3d2b', transparent: true, opacity: 0.55, depthWrite: false });
	const pad = new THREE.CircleGeometry(0.09, 10);
	const toe = new THREE.CircleGeometry(0.035, 8);
	for (let i = 0; i < 3; i++) {
		const p = new THREE.Group();
		const main = new THREE.Mesh(pad, m);
		p.add(main);
		for (let k = 0; k < 4; k++) {
			const t = new THREE.Mesh(toe, m);
			t.position.set((k - 1.5) * 0.06, 0.1 - Math.abs(k - 1.5) * 0.02, 0);
			p.add(t);
		}
		p.rotation.x = -Math.PI / 2;
		const along = -i * 0.45 - 0.4;
		p.position.set(CLIMB_BASE.x + CLIMB_DIR.x * along + (i % 2 ? 0.15 : -0.15) * CLIMB_DIR.y, 0, CLIMB_BASE.z + CLIMB_DIR.y * along - (i % 2 ? 0.15 : -0.15) * CLIMB_DIR.x);
		p.position.y = groundHeight(p.position.x, p.position.z) + 0.03;
		p.rotation.z = Math.atan2(CLIMB_DIR.x, CLIMB_DIR.y) + Math.PI;
		g.add(p);
	}
	return g;
}

interface TreeSpot { x: number; z: number; s: number; kind: 'round' | 'pine' }

function treeSpots(r: () => number): TreeSpot[] {
	const out: TreeSpot[] = [];
	const ok = (x: number, z: number, clear: number) => {
		if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < PLATEAU.r + 1.5 + clear) return false;
		if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.2 + clear) return false;
		if (Math.abs(x - HOUSE.x) < HOUSE.w / 2 + 2 + clear && Math.abs(z - HOUSE.z) < HOUSE.d / 2 + 3 + clear) return false;
		if (distToPath(x, z) < 1.8 + clear) return false;
		if (Math.hypot(x - START.x, z - START.z) < 3) return false;
		if (Math.hypot(x - SALLY_SPOT.x, z - SALLY_SPOT.z) < 3) return false;
		return out.every((t) => Math.hypot(t.x - x, t.z - z) > 2.2);
	};
	for (let i = 0; i < 90; i++) {
		const a = r() * Math.PI * 2;
		const rad = BOUNDS - 2 + r() * 7;
		const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
		if (ok(x, z, 0)) out.push({ x, z, s: 1 + r() * 0.6, kind: r() > 0.45 ? 'pine' : 'round' });
	}
	for (let i = 0; i < 60 && out.length < 120; i++) {
		const x = (r() - 0.5) * 2 * (BOUNDS - 3), z = (r() - 0.5) * 2 * (BOUNDS - 3);
		if (Math.hypot(x, z) < BOUNDS - 3 && ok(x, z, 1.5)) out.push({ x, z, s: 0.8 + r() * 0.5, kind: r() > 0.6 ? 'pine' : 'round' });
	}
	return out;
}

function buildTrees(r: () => number): { group: THREE.Group; canopies: THREE.InstancedMesh } {
	const spots = treeSpots(r);
	const g = new THREE.Group();
	const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
	trunkGeo.translate(0, 0.8, 0);
	const roundGeo = new THREE.IcosahedronGeometry(1.25, 0);
	const pineGeo = new THREE.ConeGeometry(1.2, 2.2, 7);
	const rounds = spots.filter((s) => s.kind === 'round');
	const pines = spots.filter((s) => s.kind === 'pine');
	const trunks = new THREE.InstancedMesh(trunkGeo, mat('#8b5e3c'), spots.length);
	const canopies = new THREE.InstancedMesh(roundGeo, mat('#ffffff'), rounds.length * 2);
	const pineMesh = new THREE.InstancedMesh(pineGeo, mat('#ffffff'), pines.length * 3);
	const o = new THREE.Object3D();
	const col = new THREE.Color();
	const greens = ['#5fae4a', '#6dbb52', '#4f9e45', '#78c25a'];
	spots.forEach((t, i) => {
		const y = groundHeight(t.x, t.z) - 0.05;
		o.position.set(t.x, y, t.z);
		o.rotation.set(0, r() * 6, 0);
		o.scale.setScalar(t.s);
		o.updateMatrix();
		trunks.setMatrixAt(i, o.matrix);
		circles.push({ x: t.x, z: t.z, r: 0.45 * t.s });
		crowns.push({ x: t.x, z: t.z, r: 1.4 * t.s });
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
	g.add(trunks, canopies, pineMesh);
	shadowed(g);
	return { group: g, canopies };
}

function buildHazel(): { group: THREE.Group; nuts: THREE.Mesh[] } {
	const g = new THREE.Group();
	const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0), mat('#7a5233'));
	g.add(trunk);
	const nuts: THREE.Mesh[] = [];
	const blobs: [number, number, number, number][] = [[0, 2, 0, 1.15], [0.8, 1.7, 0.3, 0.8], [-0.7, 1.8, -0.2, 0.85], [0.1, 2.6, -0.4, 0.75]];
	for (const [x, y, z, s] of blobs) {
		const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat('#8fc65b'));
		b.position.set(x, y, z);
		b.rotation.set(x, y, z);
		g.add(b);
	}
	const nutMat = mat('#a0672f');
	for (let i = 0; i < 9; i++) {
		const a = i * 2.4;
		const n = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), nutMat);
		n.position.set(Math.cos(a) * 1.05, 1.6 + (i % 3) * 0.35, Math.sin(a) * 1.05);
		g.add(n);
		nuts.push(n);
	}
	g.position.set(HAZEL.x, groundHeight(HAZEL.x, HAZEL.z) - 0.05, HAZEL.z);
	circles.push({ x: HAZEL.x, z: HAZEL.z, r: 0.5 });
	crowns.push({ x: HAZEL.x, z: HAZEL.z, r: 1.6 });
	return { group: shadowed(g), nuts };
}

export function buildNut(): THREE.Group {
	const g = new THREE.Group();
	const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#b7763a', { roughness: 0.5 }));
	shell.scale.set(1, 1.15, 1);
	const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.2), mat('#7a4b25'));
	cap.position.y = 0.04;
	const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), mat('#7a4b25'));
	tip.position.y = 0.18;
	g.add(shell, cap, tip);
	return shadowed(g);
}

function buildPond(r: () => number): THREE.Group {
	const g = new THREE.Group();
	const water = new THREE.Mesh(
		new THREE.CircleGeometry(POND.r + 0.5, 28),
		new THREE.MeshStandardMaterial({ color: '#5bb7d6', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }),
	);
	water.rotation.x = -Math.PI / 2;
	water.position.set(POND.x, -0.12, POND.z);
	water.receiveShadow = true;
	g.add(water);
	for (let i = 0; i < 4; i++) {
		const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 9, 0.3, Math.PI * 1.8), mat('#4f9e45'));
		pad.rotation.x = -Math.PI / 2;
		pad.rotation.z = r() * 6;
		pad.position.set(POND.x + (r() - 0.5) * 3, -0.1, POND.z + (r() - 0.5) * 3);
		g.add(pad);
	}
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2 + r() * 0.3;
		const m = rock(0.18 + r() * 0.2, '#b8ab9a', r);
		const rad = POND.r + 0.7 + r() * 0.3;
		m.position.set(POND.x + Math.cos(a) * rad, groundHeight(POND.x + Math.cos(a) * rad, POND.z + Math.sin(a) * rad), POND.z + Math.sin(a) * rad);
		g.add(m);
	}
	circles.push({ x: POND.x, z: POND.z, r: POND.r + 0.3 });
	return shadowed(g, false);
}

function scatter(count: number, r: () => number, test: (x: number, z: number) => boolean): THREE.Vector2[] {
	const out: THREE.Vector2[] = [];
	for (let i = 0; i < count * 4 && out.length < count; i++) {
		const x = (r() - 0.5) * 2 * BOUNDS, z = (r() - 0.5) * 2 * BOUNDS;
		if (Math.hypot(x, z) < BOUNDS + 1 && test(x, z)) out.push(new THREE.Vector2(x, z));
	}
	return out;
}

function buildGrass(r: () => number): THREE.Group {
	const g = new THREE.Group();
	const clear = (x: number, z: number) =>
		distToPath(x, z) > 1.1 &&
		Math.hypot(x - POND.x, z - POND.z) > POND.r + 1 &&
		!(Math.abs(x - HOUSE.x) < HOUSE.w / 2 + 0.3 && Math.abs(z - HOUSE.z) < HOUSE.d / 2 + 0.3) &&
		Math.abs(plateauFactor(x, z) - 0.5) > 0.45;
	const tuftGeo = new THREE.ConeGeometry(0.07, 0.35, 3);
	tuftGeo.translate(0, 0.17, 0);
	const tufts = scatter(1400, r, clear);
	const tm = new THREE.InstancedMesh(tuftGeo, mat('#ffffff'), tufts.length * 3);
	const o = new THREE.Object3D();
	const c = new THREE.Color();
	tufts.forEach((p, i) => {
		const y = groundHeight(p.x, p.y);
		for (let k = 0; k < 3; k++) {
			o.position.set(p.x + (k - 1) * 0.07, y, p.y + ((k * 7) % 3 - 1) * 0.05);
			o.rotation.set((k - 1) * 0.35, r() * 3, (k - 1) * 0.25);
			o.scale.setScalar(0.7 + r() * 0.7);
			o.updateMatrix();
			tm.setMatrixAt(i * 3 + k, o.matrix);
			tm.setColorAt(i * 3 + k, c.set(r() > 0.5 ? '#6fb34c' : '#85c75b'));
		}
	});
	g.add(tm);
	const flowers = scatter(260, r, clear);
	const fGeo = new THREE.IcosahedronGeometry(0.08, 0);
	fGeo.translate(0, 0.2, 0);
	const fm = new THREE.InstancedMesh(fGeo, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.08 }), flowers.length);
	const palette = ['#ffffff', '#ffd84d', '#ff9fc4', '#c9a6ff', '#ff7a5c'];
	flowers.forEach((p, i) => {
		o.position.set(p.x, groundHeight(p.x, p.y), p.y);
		o.rotation.set(0, 0, 0);
		o.scale.setScalar(0.8 + r() * 0.6);
		o.updateMatrix();
		fm.setMatrixAt(i, o.matrix);
		fm.setColorAt(i, c.set(palette[Math.floor(r() * palette.length)]));
	});
	g.add(fm);
	return g;
}

export interface World {
	scene: THREE.Scene;
	sun: THREE.DirectionalLight;
	canopies: THREE.InstancedMesh;
	pawPrints: THREE.Group;
}

export function buildWorld(): World {
	const r = rng(7);
	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog('#f2dcc0', 28, 75);
	scene.add(buildSky());
	scene.add(new THREE.HemisphereLight('#cfe8ff', '#6f8f4a', 1.1));
	const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -16;
	sun.shadow.camera.right = 16;
	sun.shadow.camera.top = 16;
	sun.shadow.camera.bottom = -16;
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 70;
	sun.shadow.bias = -0.0008;
	sun.shadow.normalBias = 0.03;
	scene.add(sun, sun.target);
	scene.add(buildTerrain());
	scene.add(buildHouse());
	scene.add(buildPlateauRocks(r));
	const pawPrints = buildPawPrints();
	scene.add(pawPrints);
	const trees = buildTrees(r);
	scene.add(trees.group);
	scene.add(buildHazel().group);
	scene.add(buildPond(r));
	scene.add(buildGrass(r));
	const stump = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.45, 9), mat('#9a6a43')));
	stump.position.set(SALLY_SPOT.x, 0.22, SALLY_SPOT.z);
	scene.add(stump);
	const ring = new THREE.Mesh(new THREE.CircleGeometry(0.36, 9), mat('#d8b07a'));
	ring.rotation.x = -Math.PI / 2;
	ring.position.set(SALLY_SPOT.x, 0.452, SALLY_SPOT.z);
	scene.add(ring);
	circles.push({ x: SALLY_SPOT.x, z: SALLY_SPOT.z, r: 0.55 });
	return { scene, sun, canopies: trees.canopies, pawPrints };
}
