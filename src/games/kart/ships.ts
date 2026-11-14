// The four parody ships, built from primitives, nose along +x, about 3 m long.
import * as THREE from 'three';
import type { ShipId } from './race';

export interface ShipMesh {
	root: THREE.Group;
	/** Tilts and spins; the shadow stays flat under root. */
	body: THREE.Group;
	/** Engine glows: scaled and tinted by boost. */
	flames: THREE.Sprite[];
	shadow: THREE.Mesh;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
	if (glowTex) return glowTex;
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const g = c.getContext('2d')!;
	const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	grd.addColorStop(0, 'rgba(255,255,255,1)');
	grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
	grd.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 64, 64);
	glowTex = new THREE.CanvasTexture(c);
	return glowTex;
}

let shadowTex: THREE.Texture | null = null;
function shadowTexture(): THREE.Texture {
	if (shadowTex) return shadowTex;
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const g = c.getContext('2d')!;
	const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
	grd.addColorStop(0, 'rgba(0,0,0,0.6)');
	grd.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 64, 64);
	shadowTex = new THREE.CanvasTexture(c);
	return shadowTex;
}

const std = (color: number | string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
	new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, flatShading: true, ...extra });

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
	m.position.set(x, y, z);
	return m;
}

function flame(color: number, x: number, y: number, z: number, size = 0.9): THREE.Sprite {
	const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
	s.position.set(x, y, z);
	s.scale.setScalar(size);
	return s;
}

function caravane(color: number, body: THREE.Group, flames: THREE.Sprite[]) {
	const cream = std(0xf3ead8);
	const paint = std(color);
	const glass = std(0x7fd3ff, { metalness: 0.6, roughness: 0.1, emissive: 0x16466a });
	const dark = std(0x2a2733);
	body.add(box(2.6, 1.3, 1.8, cream, -0.25, 0.95, 0)); // living box
	body.add(box(2.62, 0.28, 1.82, paint, -0.25, 0.7, 0)); // stripe
	body.add(box(0.9, 0.85, 1.7, cream, 1.35, 0.72, 0)); // cab
	body.add(box(0.06, 0.5, 1.4, glass, 1.81, 0.86, 0)); // windscreen
	body.add(box(0.8, 0.35, 1.6, cream, 1.0, 1.75, 0)); // bunk over the cab
	for (const z of [-0.91, 0.91]) body.add(box(0.9, 0.42, 0.04, glass, -0.4, 1.1, z));
	body.add(box(0.4, 0.06, 1.9, dark, -1.4, 1.65, 0)); // roof rack
	// Fuzzy dice behind the windscreen.
	const dice = std(0xff5fa2, { roughness: 1 });
	for (const [dz, dy] of [[-0.12, 0], [0.12, -0.08]]) body.add(box(0.16, 0.16, 0.16, dice, 1.62, 0.98 + dy, dz));
	body.add(box(1.6, 0.25, 1.95, dark, 0.1, 0.25, 0)); // hover skirt
	// The back the player stares at: window, ladder, spare tyre, tail lights.
	body.add(box(0.04, 0.4, 0.8, glass, -1.56, 1.2, 0.35));
	const rail = std(0x9a9aa8, { metalness: 0.7 });
	for (const z of [-0.55, -0.25]) body.add(box(0.05, 1.1, 0.05, rail, -1.6, 1.05, z));
	for (let i = 0; i < 4; i++) body.add(box(0.05, 0.04, 0.34, rail, -1.6, 0.6 + i * 0.27, -0.4));
	const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.11, 6, 14).rotateY(Math.PI / 2), dark);
	tyre.position.set(-1.62, 1.25, 0.45);
	body.add(tyre);
	const tail = std(0xff2a3a, { emissive: 0xff1a2a, emissiveIntensity: 0.9 });
	for (const z of [-0.8, 0.8]) body.add(box(0.05, 0.22, 0.14, tail, -1.56, 0.62, z));
	for (const z of [-0.5, 0.5]) {
		const n = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 10).rotateZ(Math.PI / 2), dark);
		n.position.set(-1.65, 0.6, z);
		body.add(n);
		flames.push(flame(0x6fd0ff, -1.95, 0.6, z));
	}
}

function croiseur(color: number, body: THREE.Group, flames: THREE.Sprite[]) {
	const hull = std(0xc9ced8, { metalness: 0.5, roughness: 0.35 });
	const paint = std(color, { metalness: 0.4 });
	const dark = std(0x23262e);
	const glass = std(0xffe08a, { emissive: 0x7a5200, metalness: 0.5, roughness: 0.2 });
	// A hood that never ends, then a cockpit the size of a shoebox.
	const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.95, 4.2, 4, 1).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4), hull);
	hood.scale.set(1, 0.55, 1);
	hood.position.set(0.9, 0.55, 0);
	body.add(hood);
	body.add(box(4.0, 0.08, 0.3, paint, 0.9, 0.98, 0)); // racing stripe on the hood
	body.add(box(1.0, 0.7, 1.5, hull, -1.6, 0.7, 0));
	const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glass);
	dome.position.set(-1.55, 1.05, 0);
	body.add(dome);
	for (const z of [-0.95, 0.95]) {
		const fin = box(1.1, 0.08, 0.7, paint, -1.6, 0.6, z);
		fin.rotation.x = z > 0 ? -0.3 : 0.3;
		body.add(fin);
	}
	body.add(box(0.5, 0.5, 1.1, dark, -2.2, 0.7, 0));
	flames.push(flame(0xff9a3c, -2.55, 0.7, 0, 1.3));
}

function taxi(color: number, body: THREE.Group, flames: THREE.Sprite[]) {
	const yellow = std(0xffc928);
	const paint = std(color);
	const dark = std(0x26242c);
	const glass = std(0x9fe3ff, { metalness: 0.6, roughness: 0.1, emissive: 0x15405a });
	body.add(box(2.9, 0.55, 1.75, yellow, 0, 0.55, 0));
	const cabin = box(1.5, 0.6, 1.5, yellow, -0.2, 1.1, 0);
	cabin.rotation.z = 0.04; // a dent or two
	body.add(cabin);
	body.add(box(0.05, 0.42, 1.3, glass, 0.56, 1.1, 0));
	for (const z of [-0.76, 0.76]) body.add(box(1.2, 0.36, 0.04, glass, -0.2, 1.12, z));
	// Checker band in the player's colour.
	for (let i = 0; i < 8; i++) body.add(box(0.3, 0.12, 1.77, i % 2 ? dark : paint, -1.2 + i * 0.34, 0.72, 0));
	const sign = box(0.5, 0.22, 0.25, std(0xffffff, { emissive: 0xffd76a, emissiveIntensity: 0.8 }), -0.2, 1.52, 0);
	body.add(sign);
	const dent = box(0.5, 0.3, 0.06, yellow, 0.9, 0.55, 0.9);
	dent.rotation.y = 0.35;
	body.add(dent);
	body.add(box(2.6, 0.2, 1.9, dark, 0, 0.22, 0));
	const tail = std(0xff2a3a, { emissive: 0xff1a2a, emissiveIntensity: 0.9 });
	for (const z of [-0.7, 0.7]) body.add(box(0.05, 0.16, 0.3, tail, -1.46, 0.62, z));
	body.add(box(0.05, 0.36, 1.2, glass, -0.96, 1.12, 0));
	for (const z of [-0.55, 0.55]) flames.push(flame(0xff6b6b, -1.6, 0.5, z, 0.7));
}

function conserve(color: number, body: THREE.Group, flames: THREE.Sprite[]) {
	const tin = std(0xe4e8ef, { metalness: 0.35, roughness: 0.3 });
	const label = std(color, { metalness: 0.1 });
	const dark = std(0x2b2d36);
	const can = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 14).rotateZ(Math.PI / 2), tin);
	can.position.set(0, 0.95, 0);
	body.add(can);
	const band = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 1.3, 14).rotateZ(Math.PI / 2), label);
	band.position.set(0.05, 0.95, 0);
	body.add(band);
	// The lid, half open: the pilot rides in the can.
	const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 14), tin);
	lid.rotation.z = Math.PI / 2 - 0.9;
	lid.position.set(1.45, 1.45, 0);
	body.add(lid);
	const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), std(0x8ef0a0));
	pilot.position.set(1.05, 1.5, 0);
	body.add(pilot);
	for (const z of [-0.12, 0.12]) {
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), std(0x111111));
		eye.position.set(1.3, 1.58, z);
		body.add(eye);
	}
	for (const z of [-1, 1]) {
		const fin = box(0.8, 0.06, 0.6, label, -0.9, 0.7, z * 0.85);
		fin.rotation.x = z * 0.4;
		body.add(fin);
	}
	const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.5, 12).rotateZ(Math.PI / 2), dark);
	nozzle.position.set(-1.4, 0.95, 0);
	body.add(nozzle);
	flames.push(flame(0x9d7bff, -1.75, 0.95, 0, 1.1));
}

const BUILDERS: Record<ShipId, (c: number, b: THREE.Group, f: THREE.Sprite[]) => void> = { caravane, croiseur, taxi, conserve };

export function buildShip(id: ShipId, color: number): ShipMesh {
	const root = new THREE.Group();
	const body = new THREE.Group();
	const flames: THREE.Sprite[] = [];
	BUILDERS[id](color, body, flames);
	body.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.isMesh) m.castShadow = false;
	});
	for (const f of flames) body.add(f);
	const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
	shadow.position.y = 0.05;
	root.add(shadow, body);
	return { root, body, flames, shadow };
}

export function disposeShip(s: ShipMesh) {
	s.root.traverse((o) => {
		const m = o as THREE.Mesh;
		if (m.geometry) m.geometry.dispose();
		const mat = m.material as THREE.Material | THREE.Material[] | undefined;
		if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
		else mat?.dispose();
	});
}
