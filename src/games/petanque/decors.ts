/**
 * PETANQUE — the decors the shop sells, ported from the Unity game (VillageBuilder, PortBuilder,
 * Scenery): the village square by day, the same square at dusk, the harbour. The garden ('jardin')
 * is the website's own decor and stays in render3d.ts. A decor plays nothing: the pitch, its planks
 * and everything the engine reads are the same under every one of them.
 *
 * Same numbers as Unity, placed at the same world coordinates (Unity's World.Of is render3d's
 * wx/wz). Three.js is right-handed where Unity is left-handed, so the whole square shows mirrored
 * against the app, as the pitch already does — except the house fronts, whose atlas carries text
 * (BOULANGERIE): their `right` is taken in three.js's own hand so the signs read.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashN } from './terrain';
import type { SunSetup } from './render3d';

export type DecorId = 'jardin' | 'place' | 'soir' | 'port';
export const DECOR_IDS: DecorId[] = ['jardin', 'place', 'soir', 'port'];
export type TownId = Exclude<DecorId, 'jardin'>;

export const isDecorId = (v: unknown): v is DecorId => typeof v === 'string' && (DECOR_IDS as string[]).includes(v);

export interface TownDecor {
	group: THREE.Group;
	/** Linear haze the scene should take, or null for none. */
	fog: { color: number; near: number; far: number } | null;
	dispose(): void;
}

/* ---------- Unity's numbers, metres ---------- */

const RING = 27; // the house fronts stand on this circle
// Unity's 34, pushed out past the closed streets: at 34 m the ground stopped short of the house that
// closes each street, and the sky showed under it.
const PAVING_R = 37;
const TREE_X = 6;
const TREE_Z = [-13, -6.5, 0, 6.5, 13];
// Tex_Facades: four styles 2 x 2 in 1024 px blocks, the last the café's; bands in px from a block's
// top at 100 px a metre: the top storey under the eaves, a plain storey, the ground floor, bare plaster.
const ATLAS_PX = 2048, BLOCK_PX = 1024;
const GROUND_H = 3.4, STOREY_H = 2.8, TOP_H = 3.4;
type Band = [number, number];
const TOP_BAND: Band = [0, 340], UPPER_BAND: Band = [340, 280], GROUND_BAND: Band = [620, 340], PLAIN_BAND: Band = [960, 64];
const QUAY_X = 9; // the quay's edge: the water starts there
const WATER_DROP = 0.55;
/* render3d's drinks stand (BAR_AT, x -5.5 z 1.4, its counter, awning and posts): nothing of the
   square may stand in it. Unity has no stand, so one plane tree and one bench step aside. */
const BAR_BOX = { x0: -7.2, x1: -3.8, z0: -0.5, z1: 3.3 };

type RGB = [number, number, number];
// A Provençal square: each front's near-white plaster takes one. Linear, as Unity's mesh colours.
const PLASTERS: RGB[] = [
	[0.97, 0.80, 0.55], [0.98, 0.87, 0.64], [0.96, 0.76, 0.66], [1.00, 0.95, 0.85],
	[0.93, 0.69, 0.53], [0.93, 0.89, 0.81], [0.99, 0.82, 0.62], [0.95, 0.83, 0.77],
];
// Boat paints, written as seen: converted to linear where they are used, as PortBuilder does.
const PAINTS: RGB[] = [
	[0.2, 0.42, 0.7], [0.75, 0.22, 0.2], [0.2, 0.55, 0.42], [0.95, 0.75, 0.25], [0.3, 0.6, 0.75], [0.55, 0.3, 0.5],
];

// Scenery.cs: (0.76, 0.82, 0.88) by day, (0.6, 0.48, 0.5) at dusk.
const DAY_FOG = { color: 0xc2d1e0, near: 40, far: 420 };
const DUSK_FOG = { color: 0x997a80, near: 40, far: 280 };

/* ---------- small maths ---------- */

type V = THREE.Vector3;
const v3 = (x: number, y: number, z: number): V => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);
const RIGHT = v3(1, 0, 0);
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scaleRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const srgbToLinear = (c: number): number => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
/** Unity's Color.linear: a colour written as seen, as the shader reads it. */
const toLinear = (c: RGB): RGB => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
const D2R = Math.PI / 180;
/** Unity's Quaternion.Euler: z, then x, then y, in degrees. */
const euler = (x: number, y: number, z: number): THREE.Quaternion =>
	new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, 'YXZ'));
/** Unity's Quaternion.LookRotation with +y up: local +z onto `fwd`. */
function lookRotation(fwd: V): THREE.Quaternion {
	const z = fwd.clone().normalize();
	const x = UP.clone().cross(z).normalize();
	const y = z.clone().cross(x);
	return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/* ---------- geometry ---------- */

interface Parts { pos: number[]; nor?: number[]; uv?: number[]; col?: number[]; idx: number[] }

const parts = (withNor = false, withUv = false, withCol = false): Parts =>
	({ pos: [], idx: [], ...(withNor ? { nor: [] } : {}), ...(withUv ? { uv: [] } : {}), ...(withCol ? { col: [] } : {}) });

function toGeo(p: Parts): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
	if (p.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
	if (p.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
	if (p.col) g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
	g.setIndex(p.idx);
	if (!p.nor) g.computeVertexNormals();
	return g;
}

const put = (a: number[], v: V): void => { a.push(v.x, v.y, v.z); };

/** A UV rect: u0..u1 along the quad, v0..v1 up it. */
interface Rect { u0: number; v0: number; u1: number; v1: number }

/** Unity's Quads: corner, corner + along, corner + along + up, corner + up, each its tint. */
class Quads {
	readonly p = parts(false, true, true);
	add(corner: V, along: V, up: V, r: Rect, c: RGB): void {
		const i = this.p.pos.length / 3;
		put(this.p.pos, corner);
		put(this.p.pos, corner.clone().add(along));
		put(this.p.pos, corner.clone().add(along).add(up));
		put(this.p.pos, corner.clone().add(up));
		this.p.uv!.push(r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1);
		for (let k = 0; k < 4; k++) this.p.col!.push(c[0], c[1], c[2]);
		// Counter-clockwise from the side cross(along, up) points to: a front faces the square.
		this.p.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
	}
}

/* Unit icospheres, filled once: the icosahedron split in four once (a crown's tufts, the bulbs), then
   twice (a crown's lumps). */
const ico = { v: [] as V[], t: [] as number[], tuftV: [] as V[], tuftT: [] as number[] };
function fillIco(): void {
	if (ico.v.length) return;
	const g = (1 + Math.sqrt(5)) / 2;
	for (const [x, y, z] of [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]])
		ico.v.push(v3(x, y, z).normalize());
	ico.t.push(0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
		3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1);
	for (let level = 0; level < 2; level++) {
		const mids = new Map<number, number>();
		const mid = (a: number, b: number): number => {
			const key = a < b ? a * 100000 + b : b * 100000 + a;
			const got = mids.get(key);
			if (got !== undefined) return got;
			ico.v.push(ico.v[a].clone().add(ico.v[b]).multiplyScalar(0.5).normalize());
			mids.set(key, ico.v.length - 1);
			return ico.v.length - 1;
		};
		const next: number[] = [];
		for (let i = 0; i < ico.t.length; i += 3) {
			const a = ico.t[i], b = ico.t[i + 1], c = ico.t[i + 2];
			const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
			next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
		}
		ico.t.length = 0;
		ico.t.push(...next);
		if (level === 0) {
			ico.tuftV.push(...ico.v.map((p) => p.clone()));
			ico.tuftT.push(...ico.t);
		}
	}
}

/* Unity's primitives, unit sized as Unity's: a cube 1 m, a cylinder 1 m across and 2 m tall, both
   centred. Normals only: the buckets they go to are untextured. */
const baseBox = (): THREE.BufferGeometry => {
	const g = new THREE.BoxGeometry(1, 1, 1);
	g.deleteAttribute('uv');
	return g;
};
const baseCyl = (sides: number): THREE.BufferGeometry => {
	const g = new THREE.CylinderGeometry(0.5, 0.5, 2, sides);
	g.deleteAttribute('uv');
	return g;
};

/* ---------- textures ---------- */

// Pooled for the session, like render3d's ground tiles: a deal or a decor change never refetches.
const texPool = new Map<string, Promise<THREE.Texture>>();

function decorTex(file: string, opts: { srgb?: boolean; clamp?: boolean } = {}): Promise<THREE.Texture> {
	const url = `/assets/jeux/petanque/decor/${file}`;
	let p = texPool.get(url);
	if (!p) {
		p = new THREE.TextureLoader().loadAsync(url).then((t) => {
			t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
			t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
			t.anisotropy = 8;
			return t;
		});
		p.catch(() => texPool.delete(url)); // a failed load may succeed next time
		texPool.set(url, p);
	}
	return p;
}

const TEXTURES: Record<TownId, string[]> = {
	place: ['paving.webp', 'facades.webp', 'facades-mask.webp', 'roof.webp', 'bark.webp', 'leaves.webp', 'leaf-card.webp', 'leaf-shadow.webp', 'awning.webp'],
	soir: ['paving.webp', 'facades.webp', 'facades-mask.webp', 'facades-glow.webp', 'roof.webp', 'bark.webp', 'leaves.webp', 'leaf-card.webp', 'awning.webp'],
	port: ['paving.webp', 'facades.webp', 'facades-mask.webp', 'roof.webp', 'bark.webp', 'leaves.webp', 'leaf-card.webp', 'leaf-shadow.webp'],
};
const CLAMPED = new Set(['facades.webp', 'facades-mask.webp', 'facades-glow.webp', 'awning.webp', 'leaf-card.webp']);
const LINEAR = new Set(['facades-mask.webp']);

/** Fetch a decor's textures ahead of its first deal, so it does not lay its square untextured. */
export function preloadTown(id: TownId): Promise<void> {
	return Promise.all(TEXTURES[id].map((f) => decorTex(f, { clamp: CLAMPED.has(f), srgb: !LINEAR.has(f) }))).then(() => undefined);
}

let blobMap: THREE.CanvasTexture | null = null;
/** A soft round blot, the light pools' shape (Unity's Tex_Blob). */
function blob(): THREE.CanvasTexture {
	if (blobMap) return blobMap;
	const S = 128;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
	grad.addColorStop(0.75, 'rgba(255,255,255,0.22)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, S, S);
	blobMap = new THREE.CanvasTexture(c);
	blobMap.colorSpace = THREE.SRGBColorSpace;
	return blobMap;
}

/* ---------- materials ---------- */

interface TintOpts { wrap?: number; mask?: boolean; triplanar?: number; cutout?: boolean; noFlip?: boolean }

/**
 * Unity's Petanque/Tinted: one texture tinted by the mesh's colour, diffuse sun wrapped round the
 * volume, ambient from the sky. With `mask`, the mask's green says where the house's colour goes:
 * plaster takes it, the stone, the shutters and the glass keep theirs. `triplanar` maps the texture
 * by world position (the crowns have no UVs). `noFlip` keeps the normals as built: a crown and its
 * leaf cards are lit as one volume from any side.
 */
function tinted(o: TintOpts): THREE.MeshLambertMaterial {
	const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
	if (o.cutout) {
		m.alphaTest = 0.5;
		m.alphaToCoverage = true; // the far mips would otherwise thin a crown's rim to nothing
	}
	const wrap = o.wrap ?? 0;
	m.onBeforeCompile = (sh) => {
		if (wrap > 0) {
			sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>',
				THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
					'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
					`float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${wrap.toFixed(3)} ) / ${(1 + wrap).toFixed(3)} );`));
		}
		if (o.mask) {
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <map_fragment>', `float tintW = 1.0;
#ifdef USE_MAP
	diffuseColor.rgb *= texture2D( map, vMapUv ).rgb;
	#ifdef USE_ALPHAMAP
	tintW = texture2D( alphaMap, vAlphaMapUv ).g;
	#endif
#endif`)
				.replace('#include <color_fragment>', `#ifdef USE_COLOR
	diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, tintW );
#endif`)
				.replace('#include <alphamap_fragment>', '');
		}
		if (o.triplanar) {
			sh.vertexShader = sh.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNorm;')
				.replace('#include <fog_vertex>', `#include <fog_vertex>
	vTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vTriNorm = normalize( mat3( modelMatrix ) * objectNormal );`);
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNorm;')
				.replace('#include <map_fragment>', `#ifdef USE_MAP
	vec3 triW = pow( abs( normalize( vTriNorm ) ), vec3( 4.0 ) );
	triW /= triW.x + triW.y + triW.z;
	vec3 triP = vTriPos * ${o.triplanar.toFixed(3)};
	diffuseColor *= texture2D( map, triP.zy ) * triW.x + texture2D( map, triP.xz ) * triW.y + texture2D( map, triP.xy ) * triW.z;
#endif`);
		}
		if (o.noFlip) {
			sh.fragmentShader = sh.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;');
		}
	};
	m.customProgramCacheKey = () => `petanque-town-${wrap}-${o.mask ? 1 : 0}-${o.triplanar ?? 0}-${o.cutout ? 1 : 0}-${o.noFlip ? 1 : 0}`;
	return m;
}

/** Unity's Petanque/Glow: the halo round a lit bulb, added, brightest in its middle. One quad per
 *  light, turned to the eye in the vertex shader, all of them in one instanced draw. */
function glowMaterial(fog: { near: number; far: number }): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: { color: { value: new THREE.Color(1, 0.72, 0.42).multiplyScalar(0.6) } },
		vertexShader: `
			varying vec2 vP;
			varying float vDepth;
			void main() {
				vec3 c = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
				float s = length( instanceMatrix[ 0 ].xyz );
				vec4 mv = modelViewMatrix * vec4( c, 1.0 );
				mv.xy += position.xy * s;
				vP = position.xy * 2.0;
				vDepth = - mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		// Added as seen, not in linear light: the frame buffer holds display values, so a halo
		// converted to them first would come out fatter than Unity's.
		fragmentShader: `
			uniform vec3 color;
			varying vec2 vP;
			varying float vDepth;
			void main() {
				float r2 = dot( vP, vP );
				if ( r2 >= 1.0 ) discard;
				// Fog fades an added glow to nothing, not to the fog's colour.
				float fade = 1.0 - clamp( ( vDepth - ${fog.near.toFixed(1)} ) / ${(fog.far - fog.near).toFixed(1)}, 0.0, 1.0 );
				gl_FragColor = vec4( color * pow( 1.0 - r2, 1.1 ) * fade, 1.0 );
			}`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
}

/** Unity's Petanque/Sea: deep blue mirroring more of the sky as the eye grazes it (Schlick), a few
 *  slow swells, the sun's glitter. Fogged per pixel, out to the camera's far plane so the clipped
 *  edge meets the haze instead of drawing a line. */
function seaMaterial(sun: SunSetup, fog: { color: number; near: number }): THREE.ShaderMaterial {
	const lin = (c: RGB): THREE.Color => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
	return new THREE.ShaderMaterial({
		uniforms: {
			time: { value: 0 },
			deep: { value: lin([0.04, 0.22, 0.34]) },
			shallow: { value: lin([0.08, 0.36, 0.42]) },
			skyCol: { value: lin([0.62, 0.75, 0.88]) },
			fogCol: { value: new THREE.Color(fog.color) },
			sunDir: { value: sun.dir.clone() },
			sunCol: { value: sun.color.clone().multiplyScalar(Math.min(1.2, sun.intensity / 2.6)) },
		},
		vertexShader: `
			varying vec3 vPos;
			void main() {
				vec4 w = modelMatrix * vec4( position, 1.0 );
				vPos = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
			}`,
		fragmentShader: `
			uniform float time;
			uniform vec3 deep, shallow, skyCol, fogCol, sunDir, sunCol;
			varying vec3 vPos;
			void main() {
				vec2 p = vPos.xz;
				float t = time * 0.6;
				vec2 g = vec2(
					0.5 * cos( p.x * 0.35 + p.y * 0.12 + t ) + 0.3 * cos( p.x * 1.3 - p.y * 0.9 + t * 1.7 ) + 0.2 * cos( p.x * 3.1 + p.y * 2.3 - t * 2.3 ),
					0.5 * cos( p.y * 0.3 - p.x * 0.1 + t * 0.8 ) + 0.3 * cos( p.y * 1.5 + p.x * 0.7 - t * 1.4 ) + 0.2 * cos( p.y * 2.9 - p.x * 2.6 + t * 2.1 ) );
				vec3 n = normalize( vec3( - g.x * 0.12, 1.0, - g.y * 0.12 ) );
				vec3 toEye = cameraPosition - vPos;
				float dist = length( toEye );
				vec3 v = toEye / dist;
				float fresnel = 0.04 + 0.96 * pow( 1.0 - clamp( dot( n, v ), 0.0, 1.0 ), 5.0 );
				vec3 c = mix( mix( shallow, deep, clamp( dist / 30.0, 0.0, 1.0 ) ), skyCol, fresnel );
				c += sunCol * 1.6 * pow( clamp( dot( n, normalize( sunDir + v ) ), 0.0, 1.0 ), 180.0 );
				c = mix( c, fogCol, clamp( ( dist - ${fog.near.toFixed(1)} ) / 180.0, 0.0, 1.0 ) );
				gl_FragColor = vec4( c, 1.0 );
				#include <colorspace_fragment>
			}`,
	});
}

/* ---------- the build ---------- */

type Hash = (k: number, salt: number) => number;
type Bucket = 'paving' | 'facade' | 'roof' | 'bark' | 'crown' | 'cards' | 'iron' | 'wood' | 'fabric' | 'bulb' | 'awning'
	| 'painted' | 'rock' | 'red' | 'stone' | 'shade' | 'pool';

/**
 * Everything that stands round the pitch for a bought decor, the ground of the surroundings
 * included (paving, quay): the caller lays no apron. `y` is the level the surroundings stand on,
 * just under the pitch's lowest point.
 */
export function buildTown(id: TownId, seed: number, y: number, sun: SunSetup): TownDecor {
	const dusk = id === 'soir', port = id === 'port';
	const fog = dusk ? DUSK_FOG : DAY_FOG;
	const H: Hash = (k, salt) => hashN(k, (seed ^ salt) | 0);
	const group = new THREE.Group();
	const junk: { dispose(): void }[] = [];
	let disposed = false;

	const buckets = new Map<Bucket, THREE.BufferGeometry[]>();
	const add = (b: Bucket, g: THREE.BufferGeometry): void => {
		const list = buckets.get(b);
		if (list) list.push(g); else buckets.set(b, [g]);
	};
	const wires: number[] = []; // line segments, pairs of points
	const glows: { at: V; size: number }[] = [];

	const box = baseBox(), cyl = baseCyl(16), cylFine = baseCyl(28);
	junk.push(box, cyl, cylFine);
	const m4 = new THREE.Matrix4();
	/** A Unity primitive put at `at`, turned by `rot`, scaled by `size`. */
	const prim = (b: Bucket, base: THREE.BufferGeometry, at: V, rot: THREE.Quaternion, size: V): void => {
		add(b, base.clone().applyMatrix4(m4.compose(at, rot, size)));
	};
	const NO_TURN = new THREE.Quaternion();

	/* ----- ground ----- */

	{
		// A flat disc, cut straight at the quay on a harbour. 2 m a texture tile, eight setts of 25 cm.
		const p = parts(false, true);
		const n = 72, maxX = port ? QUAY_X : PAVING_R;
		p.pos.push(0, y + 0.002, 0);
		p.uv!.push(0, 0);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const x = Math.min(Math.cos(a) * PAVING_R, maxX), z = Math.sin(a) * PAVING_R;
			p.pos.push(x, y + 0.002, z);
			p.uv!.push(x / 2, z / 2);
			p.idx.push(0, i === n - 1 ? 1 : i + 2, i + 1);
		}
		add('paving', toGeo(p));
	}

	/* ----- houses ----- */

	const bandUv = (style: number, band: Band): Rect => {
		const x = (style % 2) * BLOCK_PX;
		const top = Math.floor(style / 2) * BLOCK_PX + band[0] + 0.5;
		const bottom = Math.floor(style / 2) * BLOCK_PX + band[0] + band[1] - 0.5;
		return { u0: x / ATLAS_PX, v0: 1 - bottom / ATLAS_PX, u1: (x + BLOCK_PX) / ATLAS_PX, v1: 1 - top / ATLAS_PX };
	};

	const roof = (centre: V, right: V, inward: V, w: number, d: number, rise: number, tint: RGB): void => {
		const hr = right.clone().multiplyScalar(w / 2), hd = inward.clone().multiplyScalar(d / 2);
		const ridge = v3(0, rise, 0);
		const fl = centre.clone().sub(hr).add(hd), fr = centre.clone().add(hr).add(hd);
		const bl = centre.clone().sub(hr).sub(hd), br = centre.clone().add(hr).sub(hd);
		const rl = centre.clone().sub(hr).add(ridge), rr = centre.clone().add(hr).add(ridge);
		const slope = Math.sqrt((d * d) / 4 + rise * rise) / 2, run = w / 2;
		const p = parts(false, true, true);
		for (const q of [fl, fr, rr, rl, br, bl, rl, rr, fl, rl, bl, fr, br, rr]) put(p.pos, q);
		p.uv!.push(0, 0, run, 0, run, slope, 0, slope, 0, 0, run, 0, run, slope, 0, slope,
			0, 0, d / 4, rise / 2, d / 2, 0, 0, 0, d / 2, 0, d / 4, rise / 2);
		for (let i = 0; i < 14; i++) p.col!.push(tint[0], tint[1], tint[2]);
		p.idx.push(0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13);
		add('roof', toGeo(p));
	};

	/** A house whose front stands on `front` (its middle, at the ground), facing the pitch, roofed. */
	const building = (front: V, width: number, depth: number, style: number, storeys: number, tint: RGB, tiles: RGB): void => {
		const inward = v3(-front.x, 0, -front.z).normalize();
		// Right as seen from the square, in three.js's hand: the atlas then reads left to right.
		const right = inward.clone().negate().cross(UP).normalize();
		const q = new Quads();
		const corner = front.clone().addScaledVector(inward, 0.02).addScaledVector(right, -width / 2);
		let h = 0;
		const band = (b: Band, metres: number): void => {
			q.add(corner.clone().add(v3(0, h, 0)), right.clone().multiplyScalar(width), v3(0, metres, 0), bandUv(style, b), tint);
			h += metres;
		};
		band(GROUND_BAND, GROUND_H);
		for (let k = 0; k < storeys; k++) band(UPPER_BAND, STOREY_H);
		band(TOP_BAND, TOP_H);
		const bare = bandUv(style, PLAIN_BAND);
		const back = inward.clone().multiplyScalar(-depth);
		const up = v3(0, h, 0);
		q.add(front.clone().addScaledVector(right, width / 2), back, up, bare, tint);
		q.add(front.clone().addScaledVector(right, -width / 2).add(back), back.clone().negate(), up, bare, tint);
		q.add(front.clone().addScaledVector(right, width / 2).add(back), right.clone().multiplyScalar(-width), up, bare, tint);
		add('facade', toGeo(q.p));
		roof(front.clone().addScaledVector(inward, -depth / 2).add(v3(0, h, 0)), right, inward, width + 0.3, depth + 0.6, 1.6, tiles);
	};

	{
		// Fronts along the ring, three short streets each closed by a house. The café faces the long side.
		const count = 18, depth = 9, step = 360 / count;
		for (let i = 0; i < count; i++) {
			const street = i % 6 === 2;
			const a = i * step * D2R;
			if (port && Math.cos(a) > 0.2) continue; // the water side
			const cafe = i === 0;
			const front = v3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(RING + (street ? depth : 0)).add(v3(0, y, 0));
			const width = 2 * RING * Math.sin(step * 0.5 * D2R) * 1.02;
			const style = cafe ? 3 : Math.floor(H(i, 0x2c3) * 3) % 3;
			const storeys = cafe ? 1 : Math.floor(H(i, 0x7a1) * 3) % 3;
			const tint = PLASTERS[Math.floor(H(i, 0x9e1) * PLASTERS.length) % PLASTERS.length];
			// Tiles of every age: some redder, some greyed.
			const tiles = lerpRGB([1, 0.96, 0.92], [0.84, 0.8, 0.78], H(i, 0x9e2));
			building(front, width, depth, style, storeys, tint, tiles);
		}
	}

	/* ----- plane trees and palms ----- */

	const leafGreen = (k: number): RGB => lerpRGB([1, 1, 0.86], [0.86, 0.98, 0.96], H(k, 0x5d));

	/** The trunk, flared at the foot and tapering to the fork, and three branches into the crown. */
	const wood = (foot: V, top: V, k: number): void => {
		const p = parts(true, true);
		const limb = (a: V, b: V, ra: number, rb: number, flare: number): void => {
			const sides = 10, rings = 6;
			const axis = b.clone().sub(a).normalize();
			const side = axis.clone().cross(Math.abs(axis.y) > 0.9 ? RIGHT : UP).normalize();
			const other = axis.clone().cross(side);
			const len = a.distanceTo(b);
			const start = p.pos.length / 3;
			for (let r = 0; r <= rings; r++) {
				const f = r / rings;
				const rad = lerp(ra, rb, f) * (1 + flare * Math.pow(1 - f, 6));
				const c = a.clone().lerp(b, f);
				for (let s = 0; s <= sides; s++) {
					const ang = (s / sides) * Math.PI * 2;
					const dir = side.clone().multiplyScalar(Math.cos(ang)).addScaledVector(other, Math.sin(ang));
					put(p.pos, c.clone().addScaledVector(dir, rad));
					put(p.nor!, dir);
					p.uv!.push((s / sides) * 2, (f * len) / 0.8);
				}
			}
			// Counter-clockwise from outside: the normals are given, and a back face would flip them.
			for (let r = 0; r < rings; r++)
				for (let s = 0; s < sides; s++) {
					const i0 = start + r * (sides + 1) + s, i1 = i0 + sides + 1;
					p.idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
				}
		};
		limb(foot, top, 0.27, 0.19, 0.5);
		const fork = foot.clone().lerp(top, 0.85);
		for (let b = 0; b < 3; b++) {
			const ang = (b / 3 + H(k * 5 + b, 0x5b) * 0.25) * Math.PI * 2;
			const dir = v3(Math.cos(ang), 1.3, Math.sin(ang)).normalize();
			limb(fork, fork.clone().addScaledVector(dir, 1.6 + H(k * 5 + b, 0x5c) * 0.8), 0.14, 0.06, 0);
		}
		add('bark', toGeo(p));
	};

	/** A crown: a dozen lumpy blobs in a dome, lit as one volume (each normal bent toward the
	 *  crown's), darker inside and underneath. No UVs: the leaves are mapped by world position. */
	const crown = (k: number, centre: V, rxz: number, ry: number): void => {
		fillIco();
		const p = parts(true, false, true);
		const green = leafGreen(k);
		for (let b = 0; b < 17; b++) {
			const h1 = H(k * 24 + b, 0x5e), h2 = H(k * 24 + b, 0x5f), h3 = H(k * 24 + b, 0x60);
			// One in the middle, a ring of seven round it, four on top, then five small tufts on its rim.
			let at: V, r: number;
			if (b === 0) { at = v3(0, 0, 0); r = 0.62; }
			else if (b < 8) { const a = ((b - 1 + h1 * 0.6) / 7) * Math.PI * 2; at = v3(Math.cos(a), -0.15 + 0.3 * h2, Math.sin(a)).multiplyScalar(0.6); r = 0.42 + 0.12 * h3; }
			else if (b < 12) { const a = ((b - 8 + h1 * 0.8) / 4) * Math.PI * 2; at = v3(Math.cos(a) * 0.35, 0.55, Math.sin(a) * 0.35); r = 0.38 + 0.12 * h3; }
			else { const a = ((b - 12 + h1) / 5) * Math.PI * 2; at = v3(Math.cos(a) * 0.95, -0.05 + 0.55 * h2, Math.sin(a) * 0.95); r = 0.2 + 0.1 * h3; }
			const bc = v3(at.x * rxz, at.y * ry, at.z * rxz);
			const br = r * rxz, p1 = h1 * 6.3, p2 = h2 * 6.3, p3 = h3 * 6.3;
			const tuft = b >= 12;
			const tone = scaleRGB(lerpRGB([1.04, 1.02, 0.9], [0.92, 0.98, 1.02], h3), 0.9 + 0.2 * h2);
			const start = p.pos.length / 3;
			for (const u of tuft ? ico.tuftV : ico.v) {
				// Lumps, then smaller leafy bumps on them: the outline is foliage, not a ball.
				const bump = 1 + 0.2 * (Math.sin(3.1 * u.x + 2.3 * u.y + p1) * 0.5 + Math.sin(4.7 * u.z - 1.9 * u.x + p2) * 0.35 + Math.sin(6.3 * u.y + 2.9 * u.z + p3) * 0.25)
					+ 0.06 * Math.sin(9.7 * u.x + 8.3 * u.z + p2) * Math.sin(10.9 * u.y - 7.1 * u.x + p3);
				const q = bc.clone().add(v3(u.x, u.y * 0.85, u.z).multiplyScalar(br * bump));
				const e = v3(q.x / rxz, q.y / ry, q.z / rxz); // 1 on the crown's shell
				const shell = v3(e.x / rxz, e.y / ry, e.z / rxz).normalize();
				put(p.nor!, u.clone().lerp(shell, 0.6).normalize());
				const ao = (0.38 + 0.62 * clamp01((e.length() - 0.35) / 0.7)) * clamp01(0.62 + 0.45 * shell.y);
				p.col!.push(green[0] * tone[0] * ao, green[1] * tone[1] * ao, green[2] * tone[2] * ao);
				put(p.pos, centre.clone().add(q));
			}
			for (const i of tuft ? ico.tuftT : ico.t) p.idx.push(start + i);
		}
		add('crown', toGeo(p));
	};

	/** Sprigs of leaves round a crown's rim: cut-out cards standing half out of its shell, on its sides
	 *  and top, lit as the crown and darker low down. */
	const cards = (k: number, centre: V, rxz: number, ry: number, count: number, size: number): void => {
		const p = parts(true, true, true);
		const green = leafGreen(k);
		for (let i = 0; i < count; i++) {
			const h1 = H(k * 64 + i, 0x6a1), h2 = H(k * 64 + i, 0x6a2), h3 = H(k * 64 + i, 0x6a3);
			const a = h1 * Math.PI * 2, up = lerp(-0.25, 0.95, Math.sqrt(h2));
			const dir = v3(Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up));
			const at = centre.clone().add(v3(dir.x * rxz, dir.y * ry, dir.z * rxz).multiplyScalar(0.92 + 0.12 * h3));
			const normal = v3(dir.x / rxz, dir.y / ry, dir.z / rxz).normalize();
			// A fin standing out of the crown: on the outline, where it shows, it stands across the view.
			const t1 = normal.clone().cross(Math.abs(normal.y) > 0.9 ? RIGHT : UP).normalize();
			const t2 = normal.clone().cross(t1);
			const spin = h3 * Math.PI * 2, s = size * (0.8 + 0.4 * h2) * 0.5;
			const r = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin));
			const o = p.pos.length / 3;
			put(p.pos, at.clone().addScaledVector(r, -s).addScaledVector(normal, -s));
			put(p.pos, at.clone().addScaledVector(r, s).addScaledVector(normal, -s));
			put(p.pos, at.clone().addScaledVector(r, s).addScaledVector(normal, s));
			put(p.pos, at.clone().addScaledVector(r, -s).addScaledVector(normal, s));
			p.uv!.push(0, 0, 1, 0, 1, 1, 0, 1);
			const ao = clamp01(0.62 + 0.45 * normal.y) * (0.92 + 0.12 * h1);
			for (let q = 0; q < 4; q++) {
				put(p.nor!, normal);
				p.col!.push(green[0] * ao, green[1] * ao, green[2] * ao);
			}
			p.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
		}
		add('cards', toGeo(p));
	};

	/* What a crown casts, painted: the shadow camera is fitted to the pitch (render3d), so as in the
	   garden the decor's shade is laid on the ground by hand. A flat ragged disc across the crown's
	   middle casts its own shape, carried away from the sun; the leaf mask lets the sun through it in
	   spots. It lies on the paving, under the pitch, so the pitch itself is never dappled. */
	const reach = Math.tan(Math.PI / 2 - Math.max(sun.el, 0.05));
	const awayX = -Math.cos(sun.az), awayZ = -Math.sin(sun.az);
	const shade = (centre: V, rxz: number, ry: number, k: number): void => {
		// The crown is a volume: the lower the sun, the longer the patch, its sun flecks drawn out with it.
		const stretch = 1 + Math.min(0.75 * ry * reach, 2.5 * rxz) / rxz;
		const room = Math.max(0, RING - 1.5 - Math.hypot(centre.x, centre.z) - rxz * stretch);
		const off = Math.min((centre.y - y) * reach, room);
		const ox = centre.x + awayX * off, oz = centre.z + awayZ * off;
		const n = 24;
		const p = parts(false, true);
		p.pos.push(ox, y + 0.012, oz);
		p.uv!.push(centre.x / 1.6, centre.z / 1.6);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const r = rxz * (0.8 + 0.2 * H(k * 32 + i, 0x5f1));
			const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
			const along = (dx * awayX + dz * awayZ) * (stretch - 1);
			p.pos.push(ox + dx + awayX * along, y + 0.012, oz + dz + awayZ * along);
			p.uv!.push((centre.x + dx) / 1.6, (centre.z + dz) / 1.6);
			p.idx.push(0, ((i + 1) % n) + 1, i + 1);
		}
		add('shade', toGeo(p));
	};

	const planeTree = (foot: V, h: number, k: number): void => {
		const top = foot.clone().add(v3((H(k, 0x54) - 0.5) * 0.5, h, (H(k, 0x55) - 0.5) * 0.5));
		wood(foot, top, k);
		const rxz = 2.5 + H(k, 0x56) * 0.7, ry = 1.7 + H(k, 0x57) * 0.5;
		const centre = top.clone().add(v3(0, ry * 0.45, 0));
		crown(k, centre, rxz, ry);
		cards(k, centre, rxz, ry, 44, 1.1);
		if (!dusk) shade(centre, rxz, ry, k);
	};

	/** A palm on the quay: a ringed, leaning trunk under arching fronds. Returns the top of the trunk. */
	const palm = (foot: V, h: number, k: number): V => {
		const p = parts(false, false, true);
		const lean = v3((H(k, 0x71) - 0.5) * 0.9, 0, (H(k, 0x72) - 0.5) * 0.9);
		const rings = 10, sides = 8;
		const spine = (f: number): V => foot.clone().add(v3(0, h * f, 0)).addScaledVector(lean, f * f);
		for (let r = 0; r <= rings; r++) {
			const f = r / rings;
			const at = spine(f);
			const rad = lerp(0.24, 0.16, f);
			const bark = toLinear(scaleRGB(r % 2 === 0 ? [0.5, 0.42, 0.32] : [0.38, 0.31, 0.24], 0.85 + 0.15 * H(k * 16 + r, 0x73)));
			for (let s = 0; s <= sides; s++) {
				const a = (s / sides) * Math.PI * 2;
				put(p.pos, at.clone().add(v3(Math.cos(a) * rad, 0, Math.sin(a) * rad)));
				p.col!.push(bark[0], bark[1], bark[2]);
			}
		}
		for (let r = 0; r < rings; r++)
			for (let s = 0; s < sides; s++) {
				const i0 = r * (sides + 1) + s, i1 = i0 + sides + 1;
				p.idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
			}
		const top = spine(1);
		const fronds = 11;
		for (let fi = 0; fi < fronds; fi++) {
			const a = ((fi + H(k * 16 + fi, 0x74) * 0.5) / fronds) * Math.PI * 2;
			const outward = v3(Math.cos(a), 0, Math.sin(a));
			const side = UP.clone().cross(outward);
			const len = 2.2 + H(k * 16 + fi, 0x75) * 0.9;
			const rise = 0.5 + H(k * 16 + fi, 0x76) * 0.5;
			const green = toLinear(lerpRGB([0.24, 0.42, 0.16], [0.36, 0.5, 0.2], H(k * 16 + fi, 0x77)));
			const segs = 7;
			const start = p.pos.length / 3;
			for (let sg = 0; sg <= segs; sg++) {
				const f = sg / segs;
				const q = top.clone().addScaledVector(outward, len * f).add(v3(0, rise * Math.sin(f * Math.PI * 0.8) - 1.2 * f * f, 0));
				const w = 0.45 * Math.sin(Math.min(1, f * 1.4 + 0.08) * Math.PI) + 0.03;
				// A shallow V across the frond, so it catches the light from two sides.
				put(p.pos, q.clone().addScaledVector(side, -w).add(v3(0, -w * 0.25, 0)));
				put(p.pos, q);
				put(p.pos, q.clone().addScaledVector(side, w).add(v3(0, -w * 0.25, 0)));
				for (let qq = 0; qq < 3; qq++) {
					const c = scaleRGB(green, (qq === 1 ? 1.1 : 0.85) * (0.75 + 0.25 * f));
					p.col!.push(c[0], c[1], c[2]);
				}
			}
			for (let sg = 0; sg < segs; sg++) {
				const i0 = start + sg * 3, i1 = i0 + 3;
				p.idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1, i0 + 1, i1 + 1, i0 + 2, i0 + 2, i1 + 1, i1 + 2);
			}
		}
		add('painted', toGeo(p));
		return top;
	};

	/** Out of the drinks stand's way: a foot inside its box steps to the box's near end, along z. */
	const clearOfBar = (foot: V, margin: number): V => {
		if (foot.x < BAR_BOX.x0 - margin || foot.x > BAR_BOX.x1 + margin || foot.z < BAR_BOX.z0 - margin || foot.z > BAR_BOX.z1 + margin) return foot;
		const lo = BAR_BOX.z0 - margin, hi = BAR_BOX.z1 + margin;
		foot.z = foot.z - lo < hi - foot.z ? lo : hi;
		return foot;
	};

	// Two rows along the long sides; where the string lights hang (x, height, z).
	const anchors: V[] = [];
	{
		let k = 0;
		for (const side of [-1, 1]) {
			for (const z of TREE_Z) {
				k++;
				const foot = clearOfBar(v3(side * (TREE_X + H(k, 0x51) * 0.8), y, z + (H(k, 0x52) - 0.5) * 1.2), 0.6);
				const h = 4.2 + H(k, 0x53) * 1.4;
				if (port && side > 0) {
					anchors.push(palm(foot, h + 1.2, k).add(v3(0, -0.5, 0)));
					continue;
				}
				planeTree(foot, h, k);
				anchors.push(v3(foot.x - side * 0.3, y + h - 0.4, foot.z));
			}
		}
		// A row across each end, behind the pitch: what the eye meets past the jack.
		for (const end of [-1, 1]) {
			for (const x of [-10, -4.5, 4.5, 10]) {
				k++;
				if (port && x > QUAY_X - 2) continue; // in the water
				planeTree(v3(x + (H(k, 0x51) - 0.5), y, end * (19.5 + H(k, 0x52))), 4.6 + H(k, 0x53) * 1.6, k);
			}
		}
	}

	/* ----- street furniture ----- */

	for (const side of [-1, 1]) {
		for (const z0 of [-9.5, -3.25, 3.25, 9.5]) {
			// The bench by the drinks stand moves up the row, out of its way.
			const z = side < 0 && z0 === 3.25 ? 4.6 : z0;
			const at = v3(side * 4.6, y, z);
			const facing = lookRotation(v3(-side, 0, 0));
			const off = (x: number, yy: number, zz: number): V => v3(x, yy, zz).applyQuaternion(facing).add(at);
			for (let s = 0; s < 3; s++) prim('wood', box, off(0, 0.45, -0.18 + s * 0.13), facing, v3(1.8, 0.04, 0.1));
			for (let s = 0; s < 2; s++) prim('wood', box, off(0, 0.65 + s * 0.16, -0.27), facing.clone().multiply(euler(-12, 0, 0)), v3(1.8, 0.1, 0.035));
			for (const x of [-0.75, 0.75]) {
				prim('iron', box, off(x, 0.22, -0.05), facing, v3(0.06, 0.44, 0.46));
				prim('iron', box, off(x, 0.62, -0.2), facing, v3(0.05, 0.4, 0.08));
			}
		}
	}

	fillIco();
	const bead = toGeo({ pos: ico.tuftV.flatMap((u) => [u.x * 0.5, u.y * 0.5, u.z * 0.5]), nor: ico.tuftV.flatMap((u) => [u.x, u.y, u.z]), idx: [...ico.tuftT] });
	junk.push(bead);
	const pools: { at: V; sx: number; sz: number }[] = [];

	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			const foot = v3(sx * 5.2, y, sz * 16.5);
			prim('iron', cyl, foot.clone().add(v3(0, 1.9, 0)), NO_TURN, v3(0.11, 1.9, 0.11));
			prim('iron', cyl, foot.clone().add(v3(0, 0.3, 0)), NO_TURN, v3(0.24, 0.3, 0.24));
			prim('iron', box, foot.clone().add(v3(0, 3.95, 0)), NO_TURN, v3(0.34, 0.08, 0.34));
			const glass = foot.clone().add(v3(0, 4.2, 0));
			prim('bulb', box, glass, NO_TURN, v3(0.26, 0.38, 0.26));
			if (dusk) {
				glows.push({ at: glass, size: 0.9 });
				pools.push({ at: foot.clone().add(v3(0, 0.006, 0)), sx: 4.5, sz: 4.5 });
			}
			prim('iron', box, foot.clone().add(v3(0, 4.45, 0)), euler(0, 45, 0), v3(0.38, 0.1, 0.38));
		}
	}

	{
		// Bulbs on a sagging wire from one row of trees to the other, zigzagging over the pitch.
		const half = anchors.length / 2;
		for (let i = 0; i + 1 < half; i++) {
			const a = anchors[i % 2 === 0 ? i : half + i];
			const b = anchors[i % 2 === 0 ? half + i + 1 : i + 1];
			const n = 24;
			const pts: V[] = [];
			for (let k = 0; k <= n; k++) {
				const t = k / n;
				pts.push(a.clone().lerp(b, t).add(v3(0, -4 * t * (1 - t) * 0.9, 0)));
			}
			for (let k = 0; k < n; k++) wires.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
			for (let k = 1; k < n; k++) {
				const at = pts[k].clone().add(v3(0, -0.07, 0));
				prim('bulb', bead, at, NO_TURN, v3(0.1, 0.1, 0.1));
				if (dusk) glows.push({ at, size: 0.32 });
			}
		}
	}

	/* ----- the café, or the harbour ----- */

	if (!port) {
		// House 0 stands at angle 0: its front faces -x at x = RING. The slope takes the top three
		// quarters of the awning texture, the valance under its edge the bottom one.
		const fx = RING - 0.05;
		const p = parts(false, true);
		for (const [x, yy, z] of [[fx, 3.3, -5], [fx, 3.3, 5], [fx - 2.2, 2.6, 5], [fx - 2.2, 2.6, -5], [fx - 2.2, 2.6, -5], [fx - 2.2, 2.6, 5], [fx - 2.2, 2.3, 5], [fx - 2.2, 2.3, -5]])
			p.pos.push(x, y + yy, z);
		p.uv!.push(1, 1, 0, 1, 0, 0.25, 1, 0.25, 1, 0.25, 0, 0.25, 0, 0, 1, 0);
		p.idx.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
		add('awning', toGeo(p));
		// At dusk the café's light spills out under its awning.
		if (dusk) pools.push({ at: v3(fx - 2.5, y + 0.006, 0), sx: 7, sz: 13 });

		const cone = new THREE.ConeGeometry(1.3, 0.45, 16, 1, true);
		cone.translate(0, 0.225, 0); // Unity's cone stands on its rim
		cone.deleteAttribute('uv');
		junk.push(cone);
		for (let t = 0; t < 4; t++) {
			const at = v3(RING - 4.2 - (t % 2) * 2.6, y, -3.6 + t * 2.4 + (H(t, 0x61) - 0.5) * 0.6);
			prim('iron', cylFine, at.clone().add(v3(0, 0.74, 0)), NO_TURN, v3(0.7, 0.015, 0.7));
			prim('iron', cyl, at.clone().add(v3(0, 0.37, 0)), NO_TURN, v3(0.05, 0.37, 0.05));
			for (let c = 0; c < 2; c++) {
				const ang = (c * 180 + H(t * 2 + c, 0x62) * 40) * D2R;
				const seat = at.clone().add(v3(Math.cos(ang) * 0.6, 0, Math.sin(ang) * 0.6));
				const face = lookRotation(at.clone().sub(seat));
				prim('wood', box, seat.clone().add(v3(0, 0.45, 0)), face, v3(0.4, 0.04, 0.4));
				prim('wood', box, v3(0, 0.7, -0.19).applyQuaternion(face).add(seat), face, v3(0.4, 0.45, 0.03));
				prim('iron', box, seat.clone().add(v3(0, 0.22, 0)), face, v3(0.36 * 0.9, 0.44 * 0.9, 0.36 * 0.9));
			}
			if (t % 2 === 0) {
				prim('iron', cyl, at.clone().add(v3(0, 1.2, 0)), NO_TURN, v3(0.04, 1.2, 0.04));
				prim('fabric', cone, at.clone().add(v3(0, 2.1, 0)), NO_TURN, v3(1, 1, 1));
			}
		}
	}

	let sea: THREE.Mesh | null = null;
	if (port) {
		const water = y - WATER_DROP;
		{
			// The quay's face, down from the paving into the water.
			const half = 60, drop = y - water + 0.6;
			const p = parts(false, true);
			p.pos.push(QUAY_X, y + 0.01, -half, QUAY_X, y + 0.01, half, QUAY_X, water - 0.6, half, QUAY_X, water - 0.6, -half);
			p.uv!.push(-half / 2, drop / 2, half / 2, drop / 2, half / 2, 0, -half / 2, 0);
			p.idx.push(0, 1, 2, 0, 2, 3);
			add('paving', toGeo(p));
			// The coping along the edge: a pale stone lip.
			prim('stone', box, v3(QUAY_X - 0.2, y + 0.06, 0), NO_TURN, v3(0.45, 0.12, half * 2));
		}
		{
			const far = 900;
			const g = new THREE.BufferGeometry();
			g.setAttribute('position', new THREE.Float32BufferAttribute([
				QUAY_X - 0.5, water, -far, QUAY_X - 0.5, water, far, far, water, far, far, water, -far,
			], 3));
			g.setIndex([0, 1, 2, 0, 2, 3]);
			const mat = seaMaterial(sun, DAY_FOG);
			junk.push(g, mat);
			sea = new THREE.Mesh(g, mat);
			sea.onBeforeRender = () => { mat.uniforms.time.value = performance.now() / 1000; };
		}
		{
			// Pointus along the quay, each moored by two lines to its bollards.
			let z = -24, k = 0;
			while (z < 24) {
				const len = 5 + H(k, 0x81) * 1.8, beam = 1.9 + H(k, 0x82) * 0.4;
				const paint = toLinear(PAINTS[Math.floor(H(k, 0x83) * PAINTS.length) % PAINTS.length]);
				const band = toLinear(PAINTS[Math.floor(H(k, 0x84) * PAINTS.length) % PAINTS.length]);
				const x = QUAY_X + 0.5 + beam / 2 + H(k, 0x85) * 0.3;
				const pos = v3(x, water - 0.3, z + len / 2);
				const rot = euler(0, (H(k, 0x86) - 0.5) * 8, (H(k, 0x87) - 0.5) * 3);
				add('painted', hullGeo(len, beam, 0.85, paint, band).applyMatrix4(m4.compose(pos, rot, v3(1, 1, 1))));
				// A short mast forward, as on a pointu.
				prim('fabric', cyl, v3(0, 1.6, len * 0.22).applyQuaternion(rot).add(pos), NO_TURN, v3(0.07, 1.1, 0.07));
				for (const end of [-0.38, 0.38]) {
					const at = v3(QUAY_X - 0.45, y + 0.18, z + len / 2 + end * len);
					prim('iron', cyl, at, NO_TURN, v3(0.22, 0.18, 0.22));
					const from = at.clone().add(v3(0, 0.15, 0));
					const to = v3(-beam * 0.3, 0.8, end * len * 0.9).applyQuaternion(rot).add(pos);
					let prev = from;
					for (let i = 1; i < 8; i++) {
						const f = i / 7;
						const q = from.clone().lerp(to, f).add(v3(0, -4 * f * (1 - f) * 0.25, 0));
						wires.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
						prev = q;
					}
				}
				z += len + 1.2 + H(k, 0x88) * 2.5;
				k++;
			}
		}
		{
			// A stone breakwater across the harbour's mouth, its lighthouse at the end, seen from the circle.
			const x = 55, z0 = -20, z1 = 45;
			prim('rock', box, v3(x, water + 0.8, (z0 + z1) / 2), NO_TURN, v3(5, 2.2, z1 - z0));
			prim('fabric', cylFine, v3(x, water + 6.5, z1), NO_TURN, v3(2.2, 5, 2.2));
			prim('red', cylFine, v3(x, water + 9.5, z1), NO_TURN, v3(2.25, 1, 2.25));
			prim('bulb', cylFine, v3(x, water + 11.8, z1), NO_TURN, v3(1.3, 0.8, 1.3));
			prim('red', cylFine, v3(x, water + 12.8, z1), NO_TURN, v3(1.7, 0.25, 1.7));
		}
	}

	/* ----- materials, one draw per bucket ----- */

	const later = (mat: THREE.Material, file: string, slot: 'map' | 'alphaMap' | 'emissiveMap'): void => {
		void decorTex(file, { clamp: CLAMPED.has(file), srgb: !LINEAR.has(file) }).then((t) => {
			if (disposed) return; // the decor changed while the file was on its way
			(mat as THREE.MeshLambertMaterial)[slot] = t;
			mat.needsUpdate = true;
		}, () => { /* keep the plain colour */ });
	};
	const make = (b: Bucket): THREE.Material => {
		switch (b) {
			case 'paving': { const m = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide }); later(m, 'paving.webp', 'map'); return m; }
			case 'facade': {
				const m = tinted({ mask: true });
				later(m, 'facades.webp', 'map');
				later(m, 'facades-mask.webp', 'alphaMap');
				if (dusk) {
					// The square at dusk: lit rooms, the café and the shop glow.
					m.emissive.set(0xffffff);
					later(m, 'facades-glow.webp', 'emissiveMap');
				}
				return m;
			}
			case 'roof': { const m = tinted({}); later(m, 'roof.webp', 'map'); return m; }
			case 'bark': { const m = new THREE.MeshStandardMaterial({ roughness: 0.95 }); later(m, 'bark.webp', 'map'); return m; }
			case 'crown': { const m = tinted({ wrap: 0.5, triplanar: 0.45, noFlip: true }); later(m, 'leaves.webp', 'map'); return m; }
			case 'cards': { const m = tinted({ wrap: 0.5, cutout: true, noFlip: true }); later(m, 'leaf-card.webp', 'map'); return m; }
			case 'iron': return new THREE.MeshStandardMaterial({ color: 0x242629, metalness: 0.6, roughness: 0.65 });
			case 'wood': return new THREE.MeshStandardMaterial({ color: 0x2e5b3a, roughness: 0.7 });
			case 'fabric': return new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1, side: THREE.DoubleSide });
			case 'bulb': return new THREE.MeshBasicMaterial({ color: dusk ? 0xfff0c8 : 0xffe096, side: THREE.DoubleSide });
			case 'awning': {
				const m = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
				later(m, 'awning.webp', 'map');
				return m;
			}
			case 'painted': return tinted({ wrap: 0.25 });
			case 'rock': return new THREE.MeshStandardMaterial({ color: 0x747069, roughness: 0.95 });
			case 'red': return new THREE.MeshStandardMaterial({ color: 0xb82e2a, roughness: 0.7 });
			case 'stone': return new THREE.MeshStandardMaterial({ color: 0x9c937e, roughness: 1 });
			case 'shade': {
				const m = new THREE.MeshBasicMaterial({
					color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide,
					polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
				});
				later(m, 'leaf-shadow.webp', 'map');
				return m;
			}
			case 'pool': return new THREE.MeshBasicMaterial({
				map: blob(), color: new THREE.Color(1, 0.7, 0.4), transparent: true, opacity: 0.32, depthWrite: false,
				blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
			});
		}
	};

	if (pools.length) {
		const quad = new THREE.PlaneGeometry(1, 1);
		quad.rotateX(-Math.PI / 2);
		for (const pl of pools) add('pool', quad.clone().applyMatrix4(m4.compose(pl.at, NO_TURN, v3(pl.sx, 1, pl.sz))));
		quad.dispose();
	}

	for (const [b, list] of buckets) {
		const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
		if (list.length > 1) for (const g of list) g.dispose();
		if (!geo) continue;
		const mat = make(b);
		junk.push(geo, mat);
		const mesh = new THREE.Mesh(geo, mat);
		mesh.castShadow = false;
		mesh.receiveShadow = b === 'paving';
		if (b === 'shade') mesh.renderOrder = 1; // over the paving, under every ring the HUD draws
		if (b === 'pool') mesh.renderOrder = 2;
		group.add(mesh);
	}

	if (wires.length) {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
		const mat = new THREE.LineBasicMaterial({ color: 0x222222 });
		junk.push(g, mat);
		group.add(new THREE.LineSegments(g, mat));
	}

	if (glows.length) {
		const quad = new THREE.PlaneGeometry(1, 1);
		const mat = glowMaterial(fog);
		const inst = new THREE.InstancedMesh(quad, mat, glows.length);
		glows.forEach((gl, i) => inst.setMatrixAt(i, m4.compose(gl.at, NO_TURN, v3(gl.size, gl.size, gl.size))));
		inst.instanceMatrix.needsUpdate = true;
		inst.frustumCulled = false; // the base quad's bounds say nothing of where the instances are
		inst.renderOrder = 3;
		junk.push(quad, mat, { dispose: () => inst.dispose() });
		group.add(inst);
	}

	if (sea) group.add(sea);

	for (const o of group.children) {
		o.matrixAutoUpdate = false;
		o.updateMatrix();
	}

	return {
		group,
		fog: { ...fog },
		dispose() {
			disposed = true;
			for (const d of junk) d.dispose(); // pooled textures are shared across deals: never here
		},
	};
}

/** A pointu's hull: pointed at both ends, a painted band under the gunwale, a pale deck. Along z,
 *  keel at y 0, `depth` deep. Colours linear. */
function hullGeo(len: number, beam: number, depth: number, paint: RGB, band: RGB): THREE.BufferGeometry {
	const p = parts(false, false, true);
	const stations = 14;
	// Each station a U across the hull, from the port gunwale down to the keel and up again.
	const across = [-1, -0.95, -0.78, -0.45, 0, 0.45, 0.78, 0.95, 1];
	const down = [1, 0.75, 0.45, 0.18, 0, 0.18, 0.45, 0.75, 1];
	const white = toLinear([0.92, 0.92, 0.9]), deck = toLinear([0.78, 0.7, 0.56]), keel = scaleRGB(paint, 0.8);
	for (let s = 0; s <= stations; s++) {
		const f = (s / stations) * 2 - 1; // -1 stern .. 1 bow
		const half = (beam / 2) * Math.pow(Math.max(0, 1 - f * f), 0.55);
		const sheer = 0.12 * f * f; // the ends rise a little
		for (let i = 0; i < across.length; i++) {
			p.pos.push(across[i] * half, depth * down[i] + sheer, (f * len) / 2);
			const c = down[i] > 0.72 ? band : down[i] > 0.4 ? white : keel;
			p.col!.push(c[0], c[1], c[2]);
		}
	}
	const w = across.length;
	for (let s = 0; s < stations; s++)
		for (let i = 0; i < w - 1; i++) {
			const a = s * w + i, b = a + w;
			p.idx.push(a, b, a + 1, a + 1, b, b + 1);
		}
	const d0 = p.pos.length / 3;
	for (let s = 0; s <= stations; s++) {
		const f = (s / stations) * 2 - 1;
		const half = (beam / 2) * Math.pow(Math.max(0, 1 - f * f), 0.55) * 0.92;
		const yy = depth * 0.92 + 0.12 * f * f;
		p.pos.push(-half, yy, (f * len) / 2, half, yy, (f * len) / 2);
		p.col!.push(deck[0], deck[1], deck[2], deck[0], deck[1], deck[2]);
	}
	for (let s = 0; s < stations; s++) {
		const a = d0 + s * 2;
		p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
	}
	return toGeo(p);
}
