import * as THREE from 'three';
import { baseHeight, riverX, RIVER, LAKE, POND, WATER_Y } from './terrain';

// Stylised water: see-through in the shallows, deeper blue offshore, moving light patterns on
// the bed, sun glints on the ripples and foam along the shore. The depth under each vertex is
// baked once from the height field, so no depth buffer is needed.

const vertex = /* glsl */ `
	attribute float depth;
	varying float vDepth;
	varying vec3 vWorld;
	#include <fog_pars_vertex>
	void main() {
		vDepth = depth;
		vec4 wp = modelMatrix * vec4(position, 1.0);
		vWorld = wp.xyz;
		vec4 mvPosition = viewMatrix * wp;
		gl_Position = projectionMatrix * mvPosition;
		#include <fog_vertex>
	}
`;

const fragment = /* glsl */ `
	uniform float uTime;
	uniform float uLight;
	uniform vec3 uShallow;
	uniform vec3 uDeep;
	uniform vec3 uSunDir;
	uniform vec3 uSunColor;
	uniform vec3 uSky;
	varying float vDepth;
	varying vec3 vWorld;
	#include <common>
	#include <fog_pars_fragment>

	float n2(vec2 p) {
		vec2 i = floor(p), f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
		float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
		float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
		float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
		return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
	}

	// Light focused by the waves on the bed: bright wobbling cells.
	float caustic(vec2 p, float t) {
		vec2 q = p + vec2(sin(p.y * 1.3 + t * 0.9), cos(p.x * 1.1 - t * 0.8)) * 0.6;
		vec2 f = fract(q) - 0.5;
		vec2 g = fract(q * 1.37 + vec2(t * 0.12, -t * 0.09)) - 0.5;
		float a = 1.0 - smoothstep(0.0, 0.42, length(f));
		float b = 1.0 - smoothstep(0.0, 0.42, length(g));
		return pow(max(1.0 - abs(a - b) * 2.2, 0.0), 6.0);
	}

	void main() {
		float t = uTime;
		vec2 p = vWorld.xz;
		float deep = smoothstep(0.0, 1.5, vDepth);
		vec3 col = mix(uShallow, uDeep, deep);

		// Ripples: a sum of slanted waves gives the normal for glints and fresnel.
		vec2 g = vec2(
			sin(p.x * 1.7 + t * 1.3) + 0.7 * sin(p.x * 0.9 - p.y * 1.3 + t * 0.9) + 0.4 * sin((p.x + p.y) * 2.6 + t * 1.9),
			cos(p.y * 1.5 - t * 1.1) + 0.7 * cos(p.y * 0.8 + p.x * 1.1 - t * 0.7) + 0.4 * cos((p.x - p.y) * 2.3 - t * 1.6)
		) * 0.07;
		vec3 n = normalize(vec3(g.x, 1.0, g.y));
		vec3 v = normalize(cameraPosition - vWorld);
		float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
		vec3 h = normalize(uSunDir + v);
		float glint = pow(max(dot(n, h), 0.0), 180.0) * 2.2 + pow(max(dot(n, h), 0.0), 24.0) * 0.12;

		col += (1.0 - deep) * caustic(p * 0.9, t) * 0.28;
		col = mix(col, uSky, fres * 0.45);

		float wobble = n2(p * 2.6 + vec2(t * 0.35, -t * 0.27)) * 0.09 + sin(t * 1.4 + p.x * 0.7 + p.y * 0.5) * 0.025;
		float foam = smoothstep(0.16, 0.03, vDepth + wobble) * step(-0.05, vDepth);
		float rim = smoothstep(0.32, 0.22, vDepth + wobble) - smoothstep(0.22, 0.12, vDepth + wobble);
		col = mix(col, vec3(1.0), clamp(foam * 0.85 + rim * 0.35, 0.0, 1.0));

		col *= uLight;
		col += uSunColor * glint;

		float alpha = mix(0.3, 0.86, deep);
		alpha = clamp(alpha + fres * 0.25 + foam * 0.7 + glint, 0.0, 1.0);
		gl_FragColor = vec4(col, alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		#include <fog_fragment>
	}
`;

export interface Water {
	group: THREE.Group;
	update(time: number, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, sky: THREE.Color): void;
}

// A grid over [x0,x1]×[z0,z1] whose vertices carry the water depth; cells fully under dry
// ground are dropped. `surface` and `bed` give the water level and the ground at a point.
function waterGrid(x0: number, x1: number, z0: number, z1: number, step: number, surface: number, bed: (x: number, z: number) => number, keep: (x: number, z: number) => boolean): THREE.BufferGeometry {
	const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
	const pos: number[] = [], depth: number[] = [], index: number[] = [];
	for (let j = 0; j <= nz; j++)
		for (let i = 0; i <= nx; i++) {
			const x = x0 + i * step, z = z0 + j * step;
			pos.push(x, surface, z);
			depth.push(surface - bed(x, z));
		}
	const at = (i: number, j: number) => j * (nx + 1) + i;
	for (let j = 0; j < nz; j++)
		for (let i = 0; i < nx; i++) {
			const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
			if (Math.max(depth[a], depth[b], depth[c], depth[d]) < -0.05) continue;
			if (!keep(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
			index.push(a, c, b, b, c, d);
		}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
	geo.setIndex(index);
	return geo;
}

// The river bends, so its grid runs in (offset across, z) and is bent onto the curve.
function riverGeometry(): THREE.BufferGeometry {
	const w = RIVER.half + 1, step = 0.5;
	const pos: number[] = [], depth: number[] = [], index: number[] = [];
	const nx = Math.ceil((2 * w) / step), z0 = -80, z1 = 74, nz = Math.ceil((z1 - z0) / 0.75);
	for (let j = 0; j <= nz; j++)
		for (let i = 0; i <= nx; i++) {
			const z = z0 + (j * (z1 - z0)) / nz, x = riverX(z) - w + i * step;
			pos.push(x, WATER_Y, z);
			depth.push(WATER_Y - baseHeight(x, z));
		}
	const at = (i: number, j: number) => j * (nx + 1) + i;
	for (let j = 0; j < nz; j++)
		for (let i = 0; i < nx; i++) {
			const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
			if (Math.max(depth[a], depth[b], depth[c], depth[d]) < -0.05) continue;
			index.push(a, c, b, b, c, d);
		}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
	geo.setIndex(index);
	return geo;
}

export function buildWater(): Water {
	const uniforms = {
		uTime: { value: 0 },
		uLight: { value: 1 },
		uShallow: { value: new THREE.Color('#7fd6d8') },
		uDeep: { value: new THREE.Color('#2a7fb8') },
		uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
		uSunColor: { value: new THREE.Color('#fff6e0') },
		uSky: { value: new THREE.Color('#bfe0f2') },
		...THREE.UniformsLib.fog,
	};
	const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, fog: true });
	const g = new THREE.Group();
	g.add(new THREE.Mesh(riverGeometry(), material));
	const L = LAKE.r + 2;
	g.add(new THREE.Mesh(waterGrid(LAKE.x - L, LAKE.x + L, LAKE.z - L, LAKE.z + L, 0.5, WATER_Y, baseHeight, (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < L), material));
	// The pond is shallow: stretch its depth so it still shows a darker middle.
	const P = POND.r + 0.6, pondY = -0.12;
	g.add(new THREE.Mesh(waterGrid(POND.x - P, POND.x + P, POND.z - P, POND.z + P, 0.25, pondY, (x, z) => pondY - (pondY - baseHeight(x, z)) * 3, (x, z) => Math.hypot(x - POND.x, z - POND.z) < P), material));
	for (const m of g.children) m.renderOrder = 1;

	const tmp = new THREE.Vector3();
	return {
		group: g,
		update(time, sun, hemi, sky) {
			uniforms.uTime.value = time;
			uniforms.uLight.value = Math.min(1.15, 0.25 + hemi.intensity * 0.55 + sun.intensity * 0.12);
			uniforms.uSunDir.value.copy(tmp.copy(sun.position).sub(sun.target.position).normalize());
			uniforms.uSunColor.value.copy(sun.color).multiplyScalar(Math.min(1, sun.intensity / 2.4));
			uniforms.uSky.value.copy(sky);
		},
	};
}
