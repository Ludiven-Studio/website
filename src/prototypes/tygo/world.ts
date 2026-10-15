import * as THREE from 'three';
import {
	baseHeight,
	groundHeight,
	distToPath,
	plateauFactor,
	riverX,
	mountPolar,
	ringOf,
	MOUNT,
	R_OUT,
	R_TOP,
	RING_W,
	RIVER,
	LAKE,
	POND,
	WATER_Y,
	BANK,
} from './terrain';
import { mat } from './props';

export interface Sky {
	mesh: THREE.Mesh;
	stars: THREE.Points;
	set(t: number): void;
}

export interface Env {
	scene: THREE.Scene;
	sun: THREE.DirectionalLight;
	hemi: THREE.HemisphereLight;
	sky: Sky;
	water: THREE.Material[];
}

// Time of day: 0 morning, 0.5 afternoon, 0.8 sunset, 1 night.
const PALETTE = [
	{ t: 0, top: '#7cc0ee', mid: '#c4e4f4', bot: '#ffe6c4', sun: '#fff0d4', si: 2.4, hi: 1.1, fog: '#f2dfc6' },
	{ t: 0.45, top: '#5aa8e6', mid: '#b4dcf2', bot: '#fff1d6', sun: '#fff6e6', si: 2.6, hi: 1.15, fog: '#e8eef0' },
	{ t: 0.75, top: '#6f8fd0', mid: '#f3b98a', bot: '#ffcf8a', sun: '#ffb46a', si: 2.1, hi: 0.95, fog: '#f2c79c' },
	{ t: 0.9, top: '#3a3f7a', mid: '#b56a8a', bot: '#f59a6a', sun: '#ff8a5a', si: 1.2, hi: 0.7, fog: '#a8728a' },
	{ t: 1, top: '#0d1433', mid: '#1f2a5c', bot: '#3b3f74', sun: '#9fb4ff', si: 0.45, hi: 0.45, fog: '#1d2550' },
];

function buildSky(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight): Sky {
	const uniforms = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(300, 24, 12),
		new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
			uniforms,
			vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
			fragmentShader:
				'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bottom, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
		}),
	);
	mesh.renderOrder = -1;
	scene.add(mesh);

	const pts: number[] = [];
	for (let i = 0; i < 500; i++) {
		const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.3;
		pts.push(Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280);
	}
	const sg = new THREE.BufferGeometry();
	sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fffbe8', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
	scene.add(stars);

	const c = new THREE.Color(), d = new THREE.Color();
	const lerp = (key: 'top' | 'mid' | 'bot' | 'sun' | 'fog', a: (typeof PALETTE)[0], b: (typeof PALETTE)[0], u: number) => c.set(a[key]).lerp(d.set(b[key]), u);
	return {
		mesh,
		stars,
		set(t: number) {
			let i = 0;
			while (i < PALETTE.length - 2 && t > PALETTE[i + 1].t) i++;
			const a = PALETTE[i], b = PALETTE[i + 1];
			const u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
			uniforms.top.value.copy(lerp('top', a, b, u));
			uniforms.mid.value.copy(lerp('mid', a, b, u));
			uniforms.bottom.value.copy(lerp('bot', a, b, u));
			sun.color.copy(lerp('sun', a, b, u));
			sun.intensity = a.si + (b.si - a.si) * u;
			hemi.intensity = a.hi + (b.hi - a.hi) * u;
			(scene.fog as THREE.Fog).color.copy(lerp('fog', a, b, u));
			(stars.material as THREE.PointsMaterial).opacity = Math.max(0, (t - 0.85) / 0.15);
		},
	};
}

const GRASS = ['#8cc65a', '#7dbb4e', '#97cd63', '#86c255'];

function faceColor(c: THREE.Color, cx: number, cz: number, ys: number[], slope: number) {
	const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
	const y = (ys[0] + ys[1] + ys[2]) / 3;
	if (slope > 0.9) c.set(hash > 0.5 ? '#a08a74' : '#93806c');
	else if (y < WATER_Y + 0.15) c.set(hash > 0.5 ? '#c9b07e' : '#bca372');
	else if (y < WATER_Y + 0.6 && (Math.abs(cx - riverX(cz)) < RIVER.half + 1 || Math.hypot(cx - LAKE.x, cz - LAKE.z) < LAKE.r + 2.5 || Math.hypot(cx - POND.x, cz - POND.z) < POND.r + 0.9))
		c.set(hash > 0.5 ? '#d9c08f' : '#cfb582');
	else if (distToPath(cx, cz) < 0.85 + 0.25 * Math.sin(cx * 2.1)) c.set(hash > 0.5 ? '#e2c48e' : '#d8b97f');
	else if (plateauFactor(cx, cz) > 0.9) c.set(hash > 0.5 ? '#9fcf68' : '#93c75c');
	else if (cx < -28) c.set(hash > 0.5 ? '#6faa4a' : '#78b350');
	else c.set(GRASS[Math.floor(hash * GRASS.length)]);
}

function finish(positions: number[]): THREE.Mesh {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	const colors = new Float32Array(positions.length);
	const c = new THREE.Color();
	for (let f = 0; f < positions.length; f += 9) {
		const ys = [positions[f + 1], positions[f + 4], positions[f + 7]];
		const cx = (positions[f] + positions[f + 3] + positions[f + 6]) / 3;
		const cz = (positions[f + 2] + positions[f + 5] + positions[f + 8]) / 3;
		const span = Math.max(Math.hypot(positions[f] - positions[f + 3], positions[f + 2] - positions[f + 5]), Math.hypot(positions[f] - positions[f + 6], positions[f + 2] - positions[f + 8]), 1e-3);
		faceColor(c, cx, cz, ys, (Math.max(...ys) - Math.min(...ys)) / span);
		for (let k = 0; k < 3; k++) c.toArray(colors, f + k * 3);
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geo.computeVertexNormals();
	const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
	mesh.receiveShadow = true;
	return mesh;
}

function buildTerrain(): THREE.Mesh {
	const x0 = -82, x1 = 106, z0 = -80, z1 = 74, step = 1;
	const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
	const hs = new Float32Array((nx + 1) * (nz + 1));
	for (let j = 0; j <= nz; j++)
		for (let i = 0; i <= nx; i++) {
			const x = x0 + i * step, z = z0 + j * step;
			hs[j * (nx + 1) + i] = baseHeight(x, z);
		}
	const out: number[] = [];
	const v = (i: number, j: number) => [x0 + i * step, hs[j * (nx + 1) + i], z0 + j * step];
	for (let j = 0; j < nz; j++)
		for (let i = 0; i < nx; i++) {
			const cx = x0 + (i + 0.5) * step, cz = z0 + (j + 0.5) * step;
			// The terrace mesh covers the mountain.
			if (mountPolar(cx, cz).d < R_OUT - 0.8) continue;
			const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
			if ((i + j) % 2) out.push(...a, ...c, ...b, ...b, ...c, ...d);
			else out.push(...a, ...c, ...d, ...a, ...d, ...b);
		}
	return finish(out);
}

function buildMountain(): THREE.Mesh {
	const radii = [0, 2.5];
	for (let b = R_TOP; b <= R_OUT; b += RING_W) {
		radii.push(b - 0.03, b + 0.03);
		if (b < R_OUT) radii.push(b + 1, b + 2);
	}
	const segs = 180;
	const pt = (r: number, i: number) => {
		const a = (i / segs) * Math.PI * 2;
		const x = MOUNT.x + Math.cos(a) * r, z = MOUNT.z + Math.sin(a) * r;
		return [x, groundHeight(x, z), z];
	};
	const out: number[] = [];
	for (let ri = 0; ri < radii.length - 1; ri++)
		for (let i = 0; i < segs; i++) {
			const a = pt(radii[ri], i), b = pt(radii[ri], i + 1), c = pt(radii[ri + 1], i), d = pt(radii[ri + 1], i + 1);
			out.push(...a, ...b, ...c, ...c, ...b, ...d);
		}
	// Radial walls where a ramp or a chasm cuts a ring.
	for (let i = 0; i < segs; i++)
		for (let ri = 0; ri < radii.length - 1; ri++) {
			const r0 = radii[ri], r1 = radii[ri + 1];
			const a = pt(r0, i), b = pt(r1, i);
			const a2 = pt(r0, i + 1), b2 = pt(r1, i + 1);
			const dropA = Math.abs(a[1] - a2[1]), dropB = Math.abs(b[1] - b2[1]);
			if (dropA < 0.6 && dropB < 0.6) continue;
			if (ringOf((r0 + r1) / 2) < 0) continue;
			const lowA = a[1] < a2[1] ? a : a2, highA = a[1] < a2[1] ? a2 : a;
			const lowB = b[1] < b2[1] ? b : b2, highB = b[1] < b2[1] ? b2 : b;
			const wa = [highA[0], lowA[1], highA[2]], wb = [highB[0], lowB[1], highB[2]];
			out.push(...wa, ...highA, ...wb, ...wb, ...highA, ...highB);
		}
	const mesh = finish(out);
	(mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
	return mesh;
}

function buildWater(): { group: THREE.Group; mats: THREE.Material[] } {
	const g = new THREE.Group();
	const m = new THREE.MeshStandardMaterial({ color: '#4fb0d4', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86 });
	const pos: number[] = [];
	for (let z = -80; z < 74; z += 1) {
		const xa0 = riverX(z) - RIVER.half - 1, xa1 = riverX(z) + RIVER.half + 1;
		const xb0 = riverX(z + 1) - RIVER.half - 1, xb1 = riverX(z + 1) + RIVER.half + 1;
		pos.push(xa0, WATER_Y, z, xb0, WATER_Y, z + 1, xa1, WATER_Y, z, xa1, WATER_Y, z, xb0, WATER_Y, z + 1, xb1, WATER_Y, z + 1);
	}
	const rg = new THREE.BufferGeometry();
	rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	rg.computeVertexNormals();
	const river = new THREE.Mesh(rg, m);
	river.receiveShadow = true;
	g.add(river);
	const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 1.8, 40), m);
	lake.rotation.x = -Math.PI / 2;
	lake.position.set(LAKE.x, WATER_Y, LAKE.z);
	lake.receiveShadow = true;
	g.add(lake);
	const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 0.5, 28), m);
	pond.rotation.x = -Math.PI / 2;
	pond.position.set(POND.x, -0.12, POND.z);
	g.add(pond);
	void BANK;
	return { group: g, mats: [m] };
}

export function buildEnv(lite = false): Env {
	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog('#f2dcc0', 40, 120);
	const hemi = new THREE.HemisphereLight('#cfe8ff', '#6f8f4a', 1.1);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
	const S = 18;
	Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 90 });
	sun.shadow.bias = -0.0008;
	sun.shadow.normalBias = 0.03;
	scene.add(sun, sun.target);
	const sky = buildSky(scene, sun, hemi);
	scene.add(buildTerrain());
	scene.add(buildMountain());
	const water = buildWater();
	scene.add(water.group);
	sky.set(0);
	return { scene, sun, hemi, sky, water: water.mats };
}

export { mat };
