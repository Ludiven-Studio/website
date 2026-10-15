import * as THREE from 'three';

interface Particle {
	life: number;
	max: number;
	size: number;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	grav: number;
	drag: number;
	grow: number;
	color: THREE.Color;
}

export interface Fx {
	group: THREE.Group;
	dust(p: THREE.Vector3, n: number, spread: number): void;
	splash(p: THREE.Vector3): void;
	sparkle(p: THREE.Vector3, color?: string, n?: number): void;
	debris(p: THREE.Vector3, color: string, n?: number): void;
	confetti(p: THREE.Vector3): void;
	ring(p: THREE.Vector3, color?: string): void;
	update(dt: number): void;
}

const CONFETTI = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a78bfa', '#ff9fc4', '#7bd389'];

export function createFx(): Fx {
	const group = new THREE.Group();
	const N = 700;
	const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), N);
	mesh.frustumCulled = false;
	mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	group.add(mesh);
	const parts: Particle[] = [];
	const zero = new THREE.Matrix4().makeScale(0, 0, 0);
	for (let i = 0; i < N; i++) {
		parts.push({ life: 0, max: 1, size: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, grow: 0, color: new THREE.Color() });
		mesh.setMatrixAt(i, zero);
		mesh.setColorAt(i, new THREE.Color('#ffffff'));
	}
	let next = 0;
	const emit = (p: THREE.Vector3, o: Partial<Omit<Particle, 'color'>> & { color: string }) => {
		const q = parts[next];
		next = (next + 1) % N;
		Object.assign(q, { life: o.max ?? 1, max: o.max ?? 1, size: o.size ?? 1, x: p.x, y: p.y, z: p.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, grav: o.grav ?? 0, drag: o.drag ?? 2, grow: o.grow ?? 0 });
		q.color.set(o.color);
	};

	// Ring decals for splashes and bounces.
	const rings: { m: THREE.Mesh; t: number }[] = [];
	for (let i = 0; i < 6; i++) {
		const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
		m.rotation.x = -Math.PI / 2;
		m.visible = false;
		group.add(m);
		rings.push({ m, t: 1 });
	}
	let ringNext = 0;
	const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
	const R = () => Math.random() - 0.5;

	return {
		group,
		dust(p, n, spread) {
			for (let i = 0; i < n; i++)
				emit(p.clone().add(new THREE.Vector3(R() * spread, 0.05, R() * spread)), { color: '#f3e3c8', vx: R() * 1.2, vy: 0.6 + Math.random() * 0.6, vz: R() * 1.2, max: 0.7, size: 1.1, grow: 1.6 });
		},
		splash(p) {
			for (let i = 0; i < 26; i++) {
				const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
				emit(p, { color: i % 3 ? '#bfe8f7' : '#ffffff', vx: Math.cos(a) * s, vy: 3 + Math.random() * 3, vz: Math.sin(a) * s, grav: 14, drag: 0.5, max: 0.9, size: 0.9 });
			}
			this.ring(p, '#ffffff');
		},
		sparkle(p, color = '#ffd84d', n = 18) {
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 1.5 + Math.random() * 1.5;
				emit(p, { color: i % 4 ? color : '#ffffff', vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1, vz: Math.sin(a) * Math.cos(e) * s, drag: 3, max: 0.8, size: 0.6 });
			}
		},
		debris(p, color, n = 20) {
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
				emit(p.clone().add(new THREE.Vector3(R(), Math.random() * 1.2, R())), { color: i % 3 ? color : '#c9b48a', vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, grav: 16, drag: 0.6, max: 1.3, size: 1.4 + Math.random() });
			}
		},
		confetti(p) {
			for (let i = 0; i < 90; i++) emit(p, { color: CONFETTI[i % CONFETTI.length], vx: R() * 5, vy: 4 + Math.random() * 5, vz: R() * 5, grav: 7, drag: 0.8, max: 2.6, size: 0.7 });
		},
		ring(p, color = '#ffffff') {
			const r = rings[ringNext++ % rings.length];
			r.m.position.copy(p).setY(p.y + 0.03);
			(r.m.material as THREE.MeshBasicMaterial).color.set(color);
			r.t = 0;
			r.m.visible = true;
		},
		update(dt) {
			for (let i = 0; i < N; i++) {
				const q = parts[i];
				if (q.life <= 0) continue;
				q.life -= dt;
				if (q.life <= 0) {
					mesh.setMatrixAt(i, zero);
					continue;
				}
				q.vy -= q.grav * dt;
				const k = Math.exp(-q.drag * dt);
				q.vx *= k;
				q.vy *= q.grav ? 1 : k;
				q.vz *= k;
				q.x += q.vx * dt;
				q.y += q.vy * dt;
				q.z += q.vz * dt;
				const u = q.life / q.max;
				const s = q.size * (1 + (1 - u) * q.grow) * Math.min(1, u * 3);
				m4.compose(p4.set(q.x, q.y, q.z), q4.setFromAxisAngle(s4.set(1, 1, 0).normalize(), q.life * 6), s4.setScalar(s));
				mesh.setMatrixAt(i, m4);
				mesh.setColorAt(i, q.color);
			}
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			for (const r of rings) {
				if (!r.m.visible) continue;
				r.t += dt * 1.6;
				r.m.scale.setScalar(0.3 + r.t * 1.6);
				(r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - r.t));
				if (r.t >= 1) r.m.visible = false;
			}
		},
	};
}
