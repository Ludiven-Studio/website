import * as THREE from 'three';
import { addBox, addCyl, type Solid } from './colliders';

export function rng(seed: number): () => number {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
	const k = Object.keys(extra).length ? '' : String(color);
	if (k && cache.has(k)) return cache.get(k)!;
	const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
	if (k) cache.set(k, m);
	return m;
}

export function shadowed<T extends THREE.Object3D>(o: T, cast = true): T {
	o.traverse((c) => {
		if ((c as THREE.Mesh).isMesh) {
			c.castShadow = cast;
			c.receiveShadow = true;
		}
	});
	return o;
}

export function rockMesh(size: number, color: string, r: () => number): THREE.Mesh {
	const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat(color));
	m.rotation.set(r() * 3, r() * 3, r() * 3);
	return m;
}

// A solid box with its mesh, standing on `y0`.
export function block(g: THREE.Object3D, x: number, z: number, w: number, d: number, y0: number, y1: number, color: string, yaw = 0, opts: Parameters<typeof addBox>[7] = {}): Solid {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), mat(color));
	mesh.position.set(x, (y0 + y1) / 2, z);
	mesh.rotation.y = yaw;
	g.add(shadowed(mesh));
	return addBox(x, z, w / 2, d / 2, y0, y1, yaw, { mesh, ...opts });
}

export function crate(g: THREE.Object3D, x: number, z: number, s: number, y0: number, yaw = 0): Solid {
	const grp = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat('#c08a52'));
	grp.add(body);
	const plank = mat('#9a6634');
	for (const sy of [-1, 1]) {
		const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, s * 0.12, s + 0.04), plank);
		band.position.y = sy * s * 0.38;
		grp.add(band);
	}
	const cross = new THREE.Mesh(new THREE.BoxGeometry(s * 0.12, s * 1.25, s + 0.05), plank);
	cross.rotation.x = Math.PI / 4;
	grp.add(cross);
	grp.position.set(x, y0 + s / 2, z);
	grp.rotation.y = yaw;
	g.add(shadowed(grp));
	return addBox(x, z, s / 2, s / 2, y0, y0 + s, yaw, { mesh: grp });
}

export function stump(g: THREE.Object3D, x: number, z: number, r: number, y0: number, y1: number): Solid {
	const grp = new THREE.Group();
	const bark = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, y1 - y0, 9), mat('#8a5a36'));
	bark.position.y = (y1 - y0) / 2;
	const ring = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 9), mat('#e0b27a'));
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = y1 - y0 + 0.005;
	const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.4, 9), mat('#c8935c'));
	core.rotation.x = -Math.PI / 2;
	core.position.y = y1 - y0 + 0.01;
	grp.add(bark, ring, core);
	grp.position.set(x, y0, z);
	g.add(shadowed(grp));
	return addCyl(x, z, r, y0 - 2, y1, { mesh: grp });
}

// A log lying along its yaw, as a walkable box.
export function logMesh(len: number, r: number): THREE.Group {
	const grp = new THREE.Group();
	const bark = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2), mat('#7d5232'));
	grp.add(bark);
	for (const s of [-1, 1]) {
		const end = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 10), mat('#d9a86c'));
		end.position.x = (s * len) / 2 + s * 0.005;
		end.rotation.y = (s * Math.PI) / 2;
		grp.add(end);
	}
	return shadowed(grp);
}

export function mushroomMesh(capR: number, stemH: number): THREE.Group {
	const g = new THREE.Group();
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(capR * 0.3, capR * 0.38, stemH, 8), mat('#f4ead6'));
	stem.position.y = stemH / 2;
	const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e2493b'));
	cap.scale.y = 0.55;
	cap.position.y = stemH - 0.05;
	g.add(stem, cap);
	const dot = mat('#fff6e8');
	for (let i = 0; i < 7; i++) {
		const a = i * 2.4;
		const rr = i ? capR * 0.62 : 0;
		const d = new THREE.Mesh(new THREE.CircleGeometry(capR * 0.14, 6), dot);
		const y = Math.sqrt(Math.max(0, 1 - (rr / capR) ** 2)) * capR * 0.55;
		d.position.set(Math.cos(a) * rr, stemH - 0.04 + y + 0.01, Math.sin(a) * rr);
		d.lookAt(d.position.clone().add(new THREE.Vector3(Math.cos(a) * rr * 0.6, capR * 0.55, Math.sin(a) * rr * 0.6)));
		g.add(d);
	}
	return shadowed(g);
}

export function brambleMesh(r: number, rand: () => number): THREE.Group {
	const g = new THREE.Group();
	for (let i = 0; i < 7; i++) {
		const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.45 + rand() * 0.3), 0), mat(i % 2 ? '#4e7a35' : '#5d8a3c'));
		const a = rand() * Math.PI * 2;
		b.position.set(Math.cos(a) * r * 0.45, r * (0.4 + rand() * 0.5), Math.sin(a) * r * 0.45);
		b.rotation.set(rand() * 3, rand() * 3, 0);
		g.add(b);
	}
	const thorn = mat('#c9b48a');
	for (let i = 0; i < 16; i++) {
		const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), thorn);
		const a = rand() * Math.PI * 2, e = rand() * 1.2;
		t.position.set(Math.cos(a) * r * 0.8, r * (0.3 + e * 0.6), Math.sin(a) * r * 0.8);
		t.lookAt(t.position.clone().multiplyScalar(2));
		t.rotateX(Math.PI / 2);
		g.add(t);
	}
	const berry = mat('#5b2b6e');
	for (let i = 0; i < 6; i++) {
		const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), berry);
		const a = rand() * Math.PI * 2;
		b.position.set(Math.cos(a) * r * 0.85, r * (0.5 + rand() * 0.6), Math.sin(a) * r * 0.85);
		g.add(b);
	}
	return shadowed(g);
}

// A text sign rendered on a canvas; empty in a non-DOM run.
export function textTexture(lines: string[], w = 256, h = 128, bg = '#d9b07a', fg = '#4a2e18'): THREE.Texture | null {
	if (typeof document === 'undefined') return null;
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const g = c.getContext('2d')!;
	g.fillStyle = bg;
	g.fillRect(0, 0, w, h);
	g.fillStyle = fg;
	g.font = `bold ${Math.floor(h / (lines.length + 1.2))}px system-ui, sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	lines.forEach((l, i) => g.fillText(l, w / 2, ((i + 0.5) * h) / lines.length));
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
