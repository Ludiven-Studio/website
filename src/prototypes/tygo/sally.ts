import * as THREE from 'three';

export type SallyMood = 'idle' | 'talk' | 'happy';

export interface Sally {
	root: THREE.Group;
	hand: THREE.Object3D;
	update(dt: number, mood: SallyMood, faceTo: THREE.Vector3 | null): void;
}

const mat = (color: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
	const mesh = new THREE.Mesh(geo, m);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	return mesh;
}

export function createSally(): Sally {
	const fur = mat('#c0682f');
	const cream = mat('#f6e2c2');
	const dark = mat('#2b1d14');
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);

	const torso = part(new THREE.SphereGeometry(0.2, 9, 7), fur, 0, 0.26, 0);
	torso.scale.set(1, 1.25, 0.95);
	const belly = part(new THREE.SphereGeometry(0.14, 8, 6), cream, 0, 0.24, 0.09);
	belly.scale.set(1, 1.3, 0.7);
	body.add(torso, belly);

	const head = new THREE.Group();
	head.position.set(0, 0.56, 0.02);
	body.add(head);
	head.add(part(new THREE.IcosahedronGeometry(0.16, 1), fur));
	const snout = part(new THREE.SphereGeometry(0.08, 7, 5), cream, 0, -0.04, 0.12);
	snout.scale.set(1.2, 0.85, 0.9);
	head.add(snout, part(new THREE.SphereGeometry(0.025, 5, 4), dark, 0, -0.01, 0.2));
	const eyes: THREE.Mesh[] = [];
	for (const side of [-1, 1]) {
		const eye = part(new THREE.SphereGeometry(0.032, 7, 5), dark, side * 0.07, 0.03, 0.13);
		eye.add(part(new THREE.SphereGeometry(0.01, 4, 3), mat('#ffffff'), 0.008, 0.012, 0.026));
		head.add(eye);
		eyes.push(eye);
		const ear = part(new THREE.ConeGeometry(0.045, 0.13, 5), fur, side * 0.09, 0.15, -0.02);
		ear.rotation.z = -side * 0.3;
		ear.add(part(new THREE.ConeGeometry(0.015, 0.06, 4), dark, 0, 0.07, 0));
		head.add(ear);
		const cheek = part(new THREE.SphereGeometry(0.03, 5, 4), mat('#f2a5a0'), side * 0.1, -0.04, 0.1);
		cheek.scale.set(1, 0.6, 0.5);
		head.add(cheek);
	}

	const arms: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const arm = new THREE.Group();
		arm.position.set(side * 0.13, 0.36, 0.08);
		arm.add(part(new THREE.CapsuleGeometry(0.03, 0.1, 2, 5), fur, 0, -0.07, 0));
		body.add(arm);
		arms.push(arm);
		const foot = part(new THREE.SphereGeometry(0.06, 6, 4), fur, side * 0.09, 0.03, 0.06);
		foot.scale.set(0.9, 0.5, 1.5);
		body.add(foot);
	}
	const hand = new THREE.Object3D();
	hand.position.set(0, -0.15, 0.04);
	arms[1].add(hand);

	// Big S-shaped tail made of growing puffs.
	const tail = new THREE.Group();
	tail.position.set(0, 0.12, -0.16);
	body.add(tail);
	const puffs: THREE.Mesh[] = [];
	const curve: [y: number, z: number, r: number][] = [[0.02, -0.06, 0.09], [0.14, -0.18, 0.13], [0.32, -0.24, 0.16], [0.52, -0.2, 0.17], [0.68, -0.08, 0.15], [0.74, 0.04, 0.11]];
	for (const [y, z, r] of curve) {
		const p = part(new THREE.IcosahedronGeometry(r, 1), r > 0.15 ? mat('#cf7a3c') : fur, 0, y, z);
		tail.add(p);
		puffs.push(p);
	}

	let time = 0;
	let hop = 0;
	let blink = 1.5;
	let yaw = 0;

	return {
		root,
		hand,
		update(dt: number, mood: SallyMood, faceTo: THREE.Vector3 | null) {
			time += dt;
			if (faceTo) {
				const want = Math.atan2(faceTo.x - root.position.x, faceTo.z - root.position.z);
				let d = want - yaw;
				d = Math.atan2(Math.sin(d), Math.cos(d));
				yaw += d * Math.min(1, dt * 5);
			}
			root.rotation.y = yaw;
			if (mood === 'happy') {
				hop = (hop + dt * 2.2) % 1;
				body.position.y = Math.sin(hop * Math.PI) * 0.35;
				body.rotation.y = Math.sin(time * 3) * 0.4;
			} else {
				hop = 0;
				body.position.y = THREE.MathUtils.damp(body.position.y, mood === 'talk' ? Math.abs(Math.sin(time * 7)) * 0.03 : 0, 12, dt);
				body.rotation.y = THREE.MathUtils.damp(body.rotation.y, 0, 6, dt);
			}
			body.scale.y = 1 + Math.sin(time * 2.6) * 0.02;
			head.rotation.z = Math.sin(time * 1.3) * 0.08 + (mood === 'talk' ? Math.sin(time * 5) * 0.08 : 0);
			arms[0].rotation.x = mood === 'happy' ? -2.4 + Math.sin(time * 12) * 0.3 : -0.4;
			arms[1].rotation.x = mood === 'idle' ? -0.4 : -2.2 + Math.sin(time * (mood === 'happy' ? 12 : 6)) * 0.35;
			tail.rotation.x = Math.sin(time * 1.7) * 0.08;
			tail.rotation.z = Math.sin(time * 2.3) * (mood === 'happy' ? 0.3 : 0.1);
			puffs.forEach((p, i) => (p.position.x = Math.sin(time * 2.3 - i * 0.5) * 0.02 * i));
			blink -= dt;
			if (blink < 0) blink = 2 + Math.random() * 3;
			for (const e of eyes) e.scale.y = blink < 0.12 || mood === 'happy' ? 0.2 : 1;
		},
	};
}
