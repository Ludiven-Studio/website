import * as THREE from 'three';

export type Mood = 'idle' | 'talk' | 'happy' | 'sad' | 'curl';

export interface Npc {
	root: THREE.Group;
	hand: THREE.Object3D;
	update(dt: number, mood: Mood, faceTo: { x: number; z: number } | null): void;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string) => {
	let m = mats.get(color);
	if (!m) mats.set(color, (m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 })));
	return m;
};

function part(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
	const mesh = new THREE.Mesh(geo, mat(color));
	mesh.position.set(x, y, z);
	mesh.scale.set(sx, sy, sz);
	mesh.castShadow = true;
	return mesh;
}

const sphere = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

function eyePair(head: THREE.Object3D, x: number, y: number, z: number, r: number): THREE.Mesh[] {
	return [-1, 1].map((s) => {
		const e = part(sphere(r, 8, 6), '#2b1d14', s * x, y, z);
		e.add(part(sphere(r * 0.32, 4, 3), '#ffffff', r * 0.25, r * 0.38, r * 0.8));
		head.add(e);
		return e;
	});
}

interface Rig {
	body: THREE.Group;
	head: THREE.Group;
	arms: THREE.Group[];
	eyes: THREE.Mesh[];
	hand: THREE.Object3D;
	hop?: number;
	extra?: (t: number, mood: Mood, dt: number) => void;
}

function animate(root: THREE.Group, rig: Rig): Npc['update'] {
	let time = Math.random() * 10;
	let hopT = 0;
	let blink = 1 + Math.random() * 2;
	let yaw = 0;
	let curl = 0;
	const restY = rig.body.position.y;
	return (dt, mood, faceTo) => {
		time += dt;
		if (faceTo) {
			const want = Math.atan2(faceTo.x - root.position.x, faceTo.z - root.position.z);
			yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * 5);
		}
		root.rotation.y = yaw;
		curl += ((mood === 'curl' ? 1 : 0) - curl) * Math.min(1, dt * 6);
		const b = rig.body;
		if (mood === 'happy') {
			hopT = (hopT + dt * 2.2) % 1;
			b.position.y = restY + Math.sin(hopT * Math.PI) * (rig.hop ?? 0.3);
			b.rotation.y = Math.sin(time * 3) * 0.35;
		} else {
			hopT = 0;
			const bob = mood === 'talk' ? Math.abs(Math.sin(time * 7)) * 0.03 : 0;
			b.position.y += (restY + bob - b.position.y) * Math.min(1, dt * 12);
			b.rotation.y *= 1 - Math.min(1, dt * 6);
		}
		b.scale.y = 1 + Math.sin(time * 2.6) * 0.02 - curl * 0.25;
		b.rotation.x = curl * 0.5;
		rig.head.rotation.z = Math.sin(time * 1.3) * 0.08 + (mood === 'talk' ? Math.sin(time * 5) * 0.08 : 0);
		rig.head.rotation.x = mood === 'sad' ? 0.35 : curl * 0.9;
		const [l, r] = rig.arms;
		if (l && r) {
			l.rotation.x = mood === 'happy' ? -2.4 + Math.sin(time * 12) * 0.3 : -0.4;
			r.rotation.x = mood === 'idle' || mood === 'sad' || mood === 'curl' ? -0.4 : -2.2 + Math.sin(time * (mood === 'happy' ? 12 : 6)) * 0.35;
		}
		blink -= dt;
		if (blink < 0) blink = 2 + Math.random() * 3;
		for (const e of rig.eyes) e.scale.y = blink < 0.12 || mood === 'happy' || curl > 0.5 ? 0.2 : 1;
		rig.extra?.(time, mood, dt);
	};
}

function npc(rig: Rig, root: THREE.Group): Npc {
	return { root, hand: rig.hand, update: animate(root, rig) };
}

function arm(body: THREE.Group, side: number, x: number, y: number, z: number, color: string, len = 0.1, r = 0.03): THREE.Group {
	const a = new THREE.Group();
	a.position.set(side * x, y, z);
	a.add(part(new THREE.CapsuleGeometry(r, len, 2, 5), color, 0, -len * 0.7, 0));
	body.add(a);
	return a;
}

export function createSally(): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const fur = '#c0682f', cream = '#f6e2c2';
	body.add(part(sphere(0.2, 9, 7), fur, 0, 0.26, 0, 1, 1.25, 0.95), part(sphere(0.14), cream, 0, 0.24, 0.09, 1, 1.3, 0.7));
	const head = new THREE.Group();
	head.position.set(0, 0.56, 0.02);
	body.add(head);
	head.add(part(new THREE.IcosahedronGeometry(0.16, 1), fur), part(sphere(0.08, 7, 5), cream, 0, -0.04, 0.12, 1.2, 0.85, 0.9), part(sphere(0.025, 5, 4), '#2b1d14', 0, -0.01, 0.2));
	const eyes = eyePair(head, 0.07, 0.03, 0.13, 0.032);
	for (const s of [-1, 1]) {
		const ear = part(new THREE.ConeGeometry(0.045, 0.13, 5), fur, s * 0.09, 0.15, -0.02);
		ear.rotation.z = -s * 0.3;
		ear.add(part(new THREE.ConeGeometry(0.015, 0.06, 4), '#2b1d14', 0, 0.07, 0));
		head.add(ear, part(sphere(0.03, 5, 4), '#f2a5a0', s * 0.1, -0.04, 0.1, 1, 0.6, 0.5));
		body.add(part(sphere(0.06, 6, 4), fur, s * 0.09, 0.03, 0.06, 0.9, 0.5, 1.5));
	}
	const arms = [-1, 1].map((s) => arm(body, s, 0.13, 0.36, 0.08, fur));
	const hand = new THREE.Object3D();
	hand.position.set(0, -0.15, 0.04);
	arms[1].add(hand);
	const tail = new THREE.Group();
	tail.position.set(0, 0.12, -0.16);
	body.add(tail);
	const puffs = ([[0.02, -0.06, 0.09], [0.14, -0.18, 0.13], [0.32, -0.24, 0.16], [0.52, -0.2, 0.17], [0.68, -0.08, 0.15], [0.74, 0.04, 0.11]] as const).map(([y, z, r]) => {
		const p = part(new THREE.IcosahedronGeometry(r, 1), r > 0.15 ? '#cf7a3c' : fur, 0, y, z);
		tail.add(p);
		return p;
	});
	return npc(
		{
			body,
			head,
			arms,
			eyes,
			hand,
			hop: 0.35,
			extra: (t, mood) => {
				tail.rotation.x = Math.sin(t * 1.7) * 0.08;
				tail.rotation.z = Math.sin(t * 2.3) * (mood === 'happy' ? 0.3 : 0.1);
				puffs.forEach((p, i) => (p.position.x = Math.sin(t * 2.3 - i * 0.5) * 0.02 * i));
			},
		},
		root,
	);
}

export function createOwl(): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const brown = '#8a6142', cream = '#efdcb8', dark = '#5b3d27';
	body.add(part(sphere(0.32, 10, 8), brown, 0, 0.38, 0, 1, 1.15, 0.95));
	body.add(part(sphere(0.24, 9, 7), cream, 0, 0.32, 0.12, 1, 1.2, 0.7));
	for (let i = 0; i < 6; i++) {
		const v = part(new THREE.ConeGeometry(0.035, 0.06, 3), dark, ((i % 3) - 1) * 0.09, 0.2 + Math.floor(i / 3) * 0.12, 0.29);
		v.rotation.x = Math.PI;
		body.add(v);
	}
	const head = new THREE.Group();
	head.position.set(0, 0.78, 0.02);
	body.add(head);
	head.add(part(sphere(0.27, 10, 8), brown, 0, 0, 0, 1.1, 0.9, 1));
	for (const s of [-1, 1]) {
		head.add(part(sphere(0.13, 9, 6), cream, s * 0.11, 0, 0.17, 1, 1, 0.45));
		const glass = part(new THREE.TorusGeometry(0.085, 0.014, 5, 14), '#3a2a1c', s * 0.11, 0.0, 0.25);
		head.add(glass);
		const tuft = part(new THREE.ConeGeometry(0.06, 0.18, 4), dark, s * 0.17, 0.22, -0.02);
		tuft.rotation.z = -s * 0.5;
		head.add(tuft);
		body.add(part(sphere(0.05, 5, 4), '#e9a23b', s * 0.1, 0.03, 0.12, 1, 0.5, 1.3));
	}
	head.add(part(new THREE.ConeGeometry(0.045, 0.12, 4).rotateX(Math.PI / 2 + 0.6), '#e9a23b', 0, -0.07, 0.29));
	const bridge = part(new THREE.BoxGeometry(0.05, 0.012, 0.012), '#3a2a1c', 0, 0.02, 0.26);
	head.add(bridge);
	const eyes = eyePair(head, 0.11, 0, 0.22, 0.05);
	const wings = [-1, 1].map((s) => {
		const w = new THREE.Group();
		w.position.set(s * 0.3, 0.55, -0.02);
		w.add(part(sphere(0.2, 7, 5), dark, 0, -0.18, 0, 0.35, 1.15, 0.8));
		body.add(w);
		return w;
	});
	const hand = new THREE.Object3D();
	hand.position.set(0, -0.25, 0.1);
	wings[1].add(hand);
	return npc(
		{
			body,
			head,
			arms: [],
			eyes,
			hand,
			hop: 0.2,
			extra: (t, mood) => {
				const flap = mood === 'happy' ? Math.sin(t * 14) * 0.9 : mood === 'talk' ? Math.sin(t * 4) * 0.25 : 0;
				wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.1 + Math.max(0, flap))));
				head.rotation.y = mood === 'idle' ? Math.sin(t * 0.4) * 0.6 : 0;
			},
		},
		root,
	);
}

export function createBeaver(): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const fur = '#7a4f2e', light = '#c79a6b';
	body.add(part(sphere(0.3, 10, 8), fur, 0, 0.36, 0, 1, 1.2, 0.95), part(sphere(0.2), light, 0, 0.33, 0.14, 1, 1.25, 0.7));
	const head = new THREE.Group();
	head.position.set(0, 0.78, 0.04);
	body.add(head);
	head.add(part(new THREE.IcosahedronGeometry(0.22, 1), fur), part(sphere(0.12, 8, 6), light, 0, -0.06, 0.15, 1.3, 0.85, 1));
	head.add(part(sphere(0.045, 6, 4), '#2b1d14', 0, -0.0, 0.26, 1.3, 0.8, 1));
	head.add(part(new THREE.BoxGeometry(0.09, 0.08, 0.03), '#fff8ea', 0, -0.15, 0.24));
	const eyes = eyePair(head, 0.09, 0.07, 0.17, 0.035);
	for (const s of [-1, 1]) {
		head.add(part(sphere(0.055, 6, 4), fur, s * 0.17, 0.14, -0.02, 1, 1, 0.6));
		body.add(part(sphere(0.08, 6, 4), fur, s * 0.13, 0.05, 0.08, 0.9, 0.5, 1.5));
	}
	const arms = [-1, 1].map((s) => arm(body, s, 0.22, 0.5, 0.12, fur, 0.14, 0.045));
	const hand = new THREE.Object3D();
	hand.position.set(0, -0.2, 0.04);
	arms[1].add(hand);
	const tail = new THREE.Group();
	tail.position.set(0, 0.08, -0.25);
	tail.add(part(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).scale(1, 1, 1.7), '#4a3324', 0, 0, -0.25));
	body.add(tail);
	return npc(
		{
			body,
			head,
			arms,
			eyes,
			hand,
			hop: 0.25,
			extra: (t, mood) => {
				tail.rotation.x = mood === 'talk' || mood === 'happy' ? Math.max(0, Math.sin(t * 8)) * -0.4 : Math.sin(t * 1.1) * 0.05;
			},
		},
		root,
	);
}

export function createHedgehog(scale = 1): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const face = '#e9cfa6', spike = '#6b4a33';
	body.add(part(sphere(0.24, 10, 8), '#a07a58', 0, 0.22, 0, 1, 0.85, 1.1));
	const quills = new THREE.Group();
	for (let i = 0; i < 26; i++) {
		const a = (i / 26) * Math.PI * 2 * 3.3;
		const e = 0.25 + (i / 26) * 1.0;
		const q = part(new THREE.ConeGeometry(0.05, 0.2, 4), i % 3 ? spike : '#8a6644');
		const dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e) - 0.35).normalize();
		q.position.copy(dir.clone().multiplyScalar(0.22)).add(new THREE.Vector3(0, 0.22, -0.02));
		q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
		quills.add(q);
	}
	body.add(quills);
	const head = new THREE.Group();
	head.position.set(0, 0.24, 0.2);
	body.add(head);
	head.add(part(sphere(0.13, 8, 6), face, 0, 0, 0.02, 1, 0.9, 1.1));
	const snout = part(new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI / 2), face, 0, -0.02, 0.15);
	head.add(snout, part(sphere(0.03, 5, 4), '#2b1d14', 0, -0.02, 0.24));
	const eyes = eyePair(head, 0.06, 0.04, 0.1, 0.026);
	for (const s of [-1, 1]) head.add(part(sphere(0.035, 5, 4), face, s * 0.09, 0.1, -0.02, 1, 1, 0.5));
	const arms = [-1, 1].map((s) => arm(body, s, 0.14, 0.18, 0.12, face, 0.06, 0.025));
	const hand = new THREE.Object3D();
	arms[1].add(hand);
	root.scale.setScalar(scale);
	return npc({ body, head, arms, eyes, hand, hop: 0.2 }, root);
}

export function createRabbit(fur: string, accent: string, scarf: boolean): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	body.add(part(sphere(0.22, 10, 8), fur, 0, 0.27, 0, 1, 1.2, 1), part(sphere(0.14), '#fff8f0', 0, 0.25, 0.1, 1, 1.25, 0.7));
	body.add(part(sphere(0.08, 6, 5), '#ffffff', 0, 0.17, -0.22));
	const head = new THREE.Group();
	head.position.set(0, 0.6, 0.03);
	body.add(head);
	head.add(part(new THREE.IcosahedronGeometry(0.17, 1), fur), part(sphere(0.07, 6, 5), '#fff8f0', 0, -0.06, 0.13, 1.3, 0.8, 0.9));
	head.add(part(sphere(0.025, 5, 4), '#f08a9a', 0, -0.03, 0.2));
	const eyes = eyePair(head, 0.075, 0.03, 0.13, 0.03);
	const ears = [-1, 1].map((s) => {
		const e = new THREE.Group();
		e.position.set(s * 0.07, 0.14, -0.02);
		e.add(part(new THREE.CapsuleGeometry(0.045, 0.24, 3, 6), fur, 0, 0.16, 0, 1, 1, 0.55));
		e.add(part(new THREE.CapsuleGeometry(0.025, 0.18, 3, 5), '#f6b8c4', 0, 0.16, 0.02, 1, 1, 0.4));
		e.rotation.z = -s * 0.18;
		head.add(e);
		return e;
	});
	for (const s of [-1, 1]) body.add(part(sphere(0.07, 6, 4), fur, s * 0.1, 0.03, 0.08, 0.9, 0.5, 1.6));
	if (scarf) {
		const sc = part(new THREE.TorusGeometry(0.12, 0.04, 5, 12), accent, 0, 0.47, 0.01);
		sc.rotation.x = Math.PI / 2;
		body.add(sc, part(new THREE.BoxGeometry(0.06, 0.16, 0.03), accent, 0.06, 0.38, 0.12));
	} else {
		const flower = new THREE.Group();
		flower.position.set(0.12, 0.13, 0.04);
		for (let i = 0; i < 5; i++) flower.add(part(sphere(0.03, 5, 4), accent, Math.cos(i * 1.26) * 0.035, Math.sin(i * 1.26) * 0.035, 0));
		flower.add(part(sphere(0.022, 5, 4), '#ffd84d', 0, 0, 0.01));
		head.add(flower);
	}
	const arms = [-1, 1].map((s) => arm(body, s, 0.14, 0.38, 0.09, fur));
	const hand = new THREE.Object3D();
	hand.position.set(0, -0.15, 0.04);
	arms[1].add(hand);
	return npc(
		{
			body,
			head,
			arms,
			eyes,
			hand,
			hop: 0.45,
			extra: (t, mood) => {
				ears[0].rotation.x = Math.sin(t * 1.9) * 0.1 + (mood === 'sad' ? 0.9 : 0);
				ears[1].rotation.x = Math.max(0, Math.sin(t * 0.7) * 3 - 2.6) * 0.6 + (mood === 'sad' ? 0.9 : 0);
			},
		},
		root,
	);
}

export function createFrog(): Npc {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const green = '#5fae4a', belly = '#d9edb0';
	body.add(part(sphere(0.3, 10, 8), green, 0, 0.24, 0, 1.1, 0.8, 1));
	const throat = part(sphere(0.17, 8, 6), belly, 0, 0.18, 0.18, 1.2, 0.8, 0.8);
	body.add(throat);
	const head = new THREE.Group();
	head.position.set(0, 0.36, 0.1);
	body.add(head);
	head.add(part(sphere(0.24, 10, 7), green, 0, 0, 0.02, 1.15, 0.65, 1));
	const smile = part(new THREE.TorusGeometry(0.14, 0.012, 4, 12, Math.PI), '#2b4a22', 0, -0.03, 0.2);
	smile.rotation.z = Math.PI;
	head.add(smile);
	const eyes: THREE.Mesh[] = [];
	for (const s of [-1, 1]) {
		const bulge = part(sphere(0.09, 8, 6), green, s * 0.13, 0.13, 0.06);
		head.add(bulge);
		const e = part(sphere(0.06, 8, 6), '#2b1d14', s * 0.13, 0.16, 0.12);
		e.add(part(sphere(0.02, 4, 3), '#ffffff', 0.015, 0.025, 0.045));
		head.add(e);
		eyes.push(e);
		body.add(part(sphere(0.1, 6, 5), green, s * 0.27, 0.08, -0.08, 0.8, 0.6, 1.5));
		body.add(part(sphere(0.06, 6, 4), '#7fc35d', s * 0.25, 0.02, 0.12, 1.3, 0.4, 1.2));
	}
	const crown = new THREE.Group();
	crown.position.set(0, 0.2, 0);
	for (let i = 0; i < 4; i++) crown.add(part(new THREE.ConeGeometry(0.035, 0.08, 4), '#f2c14e', Math.cos(i * 1.57) * 0.06, 0.03, Math.sin(i * 1.57) * 0.06));
	crown.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 8), '#f2c14e'));
	head.add(crown);
	const hand = new THREE.Object3D();
	hand.position.set(0, 0.1, 0.3);
	body.add(hand);
	return npc(
		{
			body,
			head,
			arms: [],
			eyes,
			hand,
			hop: 0.55,
			extra: (t, mood) => {
				const puff = mood === 'talk' ? 1 + Math.max(0, Math.sin(t * 9)) * 0.35 : 1 + Math.max(0, Math.sin(t * 1.3) * 4 - 3.4) * 0.3;
				throat.scale.set(1.2 * puff, 0.8 * puff, 0.8 * puff);
			},
		},
		root,
	);
}
