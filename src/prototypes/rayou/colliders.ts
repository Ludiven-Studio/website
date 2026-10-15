import type { Object3D } from 'three';

export interface Solid {
	id: string;
	kind: 'box' | 'cyl';
	x: number;
	z: number;
	y0: number;
	y1: number;
	hw: number;
	hd: number;
	r: number;
	cos: number;
	sin: number;
	alive: boolean;
	// Moving solids carry whoever stands on them by their last frame delta.
	moving: boolean;
	dx: number;
	dy: number;
	dz: number;
	bouncy?: number;
	breakable?: boolean;
	unsafe?: boolean;
	mesh?: Object3D;
}

const CELL = 8;
const grid = new Map<number, Solid[]>();
export const solids: Solid[] = [];
const movers: Solid[] = [];
let seq = 0;

const key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

function extent(s: Solid): number {
	return s.kind === 'cyl' ? s.r : Math.hypot(s.hw, s.hd);
}

function register(s: Solid): Solid {
	solids.push(s);
	if (s.moving) {
		movers.push(s);
		return s;
	}
	const e = extent(s);
	for (let cx = Math.floor((s.x - e) / CELL); cx <= Math.floor((s.x + e) / CELL); cx++)
		for (let cz = Math.floor((s.z - e) / CELL); cz <= Math.floor((s.z + e) / CELL); cz++) {
			const k = key(cx, cz);
			let list = grid.get(k);
			if (!list) grid.set(k, (list = []));
			list.push(s);
		}
	return s;
}

type Opts = Partial<Pick<Solid, 'id' | 'moving' | 'bouncy' | 'breakable' | 'unsafe' | 'mesh'>>;

const base = (o: Opts) => ({ id: o.id ?? `s${seq++}`, alive: true, moving: !!o.moving, dx: 0, dy: 0, dz: 0, bouncy: o.bouncy, breakable: o.breakable, unsafe: o.unsafe || !!o.moving || !!o.bouncy || !!o.breakable, mesh: o.mesh });

export function addBox(x: number, z: number, hw: number, hd: number, y0: number, y1: number, yaw = 0, o: Opts = {}): Solid {
	return register({ ...base(o), kind: 'box', x, z, y0, y1, hw, hd, r: 0, cos: Math.cos(yaw), sin: Math.sin(yaw) });
}

export function addCyl(x: number, z: number, r: number, y0: number, y1: number, o: Opts = {}): Solid {
	return register({ ...base(o), kind: 'cyl', x, z, y0, y1, hw: 0, hd: 0, r, cos: 1, sin: 0 });
}

export function moveSolid(s: Solid, x: number, y1: number, z: number, y0 = s.y0 + (y1 - s.y1)): void {
	s.dx = x - s.x;
	s.dz = z - s.z;
	s.dy = y1 - s.y1;
	s.x = x;
	s.z = z;
	s.y1 = y1;
	s.y0 = y0;
}

const near: Solid[] = [];
export function query(x: number, z: number): Solid[] {
	near.length = 0;
	const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
	if (list) for (const s of list) if (s.alive) near.push(s);
	for (const s of movers) if (s.alive) near.push(s);
	return near;
}

// Point in the solid's footprint, grown by pad.
export function inside(s: Solid, x: number, z: number, pad: number): boolean {
	const dx = x - s.x, dz = z - s.z;
	if (s.kind === 'cyl') return dx * dx + dz * dz < (s.r + pad) * (s.r + pad);
	const lx = dx * s.cos - dz * s.sin;
	const lz = dx * s.sin + dz * s.cos;
	return Math.abs(lx) < s.hw + pad && Math.abs(lz) < s.hd + pad;
}

// Pushes a circle out of the footprint. Returns true when it moved.
export function pushOut(s: Solid, p: { x: number; z: number }, radius: number): boolean {
	const dx = p.x - s.x, dz = p.z - s.z;
	if (s.kind === 'cyl') {
		const d = Math.hypot(dx, dz);
		const min = s.r + radius;
		if (d >= min) return false;
		const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
		p.x = s.x + nx * min;
		p.z = s.z + nz * min;
		return true;
	}
	const lx = dx * s.cos - dz * s.sin;
	const lz = dx * s.sin + dz * s.cos;
	const cx = Math.max(-s.hw, Math.min(s.hw, lx));
	const cz = Math.max(-s.hd, Math.min(s.hd, lz));
	let ox = lx - cx, oz = lz - cz;
	const d = Math.hypot(ox, oz);
	let nlx: number, nlz: number;
	if (d > 1e-5) {
		if (d >= radius) return false;
		nlx = cx + (ox / d) * radius;
		nlz = cz + (oz / d) * radius;
	} else {
		// Centre inside the box: leave by the nearest face.
		const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
		ox = px < pz ? Math.sign(lx) || 1 : 0;
		oz = px < pz ? 0 : Math.sign(lz) || 1;
		nlx = ox ? ox * (s.hw + radius) : lx;
		nlz = oz ? oz * (s.hd + radius) : lz;
	}
	p.x = s.x + nlx * s.cos + nlz * s.sin;
	p.z = s.z - nlx * s.sin + nlz * s.cos;
	return true;
}

export function resetColliders(): void {
	grid.clear();
	solids.length = 0;
	movers.length = 0;
	seq = 0;
}
