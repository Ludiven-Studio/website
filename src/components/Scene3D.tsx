import { Suspense, useMemo, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, AdaptiveDpr, Html } from '@react-three/drei';
import * as THREE from 'three';

const HDRI = '/hdris/forest_slope_1k.hdr';
const ROCK = '/models/moon_rock_01/moon_rock_01_1k.gltf';
const BOULDER = '/models/boulder_01/boulder_01_1k.gltf';
const TRUNK = '/models/dead_tree_trunk/dead_tree_trunk_1k.gltf';
[ROCK, BOULDER, TRUNK].forEach((u) => useGLTF.preload(u));

// Terrain / population tuning.
const SIZE = 240, SEG = 150, HILL = 16, NF = 0.02;
const TREES = 240, GRASS = 5200, ROCKS = 52, BOULDERS = 12, LOGS = 6;

/* ---------- deterministic noise ---------- */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function hash2(ix: number, iz: number, seed: number): number {
	let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
	const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
	const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
	const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
	return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x: number, z: number, seed: number): number {
	let amp = 1, freq = 1, sum = 0, norm = 0;
	for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * freq, z * freq, seed + o * 101); norm += amp; amp *= 0.5; freq *= 2; }
	return sum / norm;
}
const heightAt = (x: number, z: number, seed: number): number => (fbm(x * NF, z * NF, seed) - 0.5) * HILL;
function slopeAt(x: number, z: number, seed: number): number {
	const e = 1.5;
	const hx = heightAt(x + e, z, seed) - heightAt(x - e, z, seed);
	const hz = heightAt(x, z + e, seed) - heightAt(x, z - e, seed);
	return Math.hypot(hx, hz) / (2 * e);
}
const hashStr = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };

/* ---------- terrain ---------- */
function Terrain({ seed }: { seed: number }) {
	const { geom, mat } = useMemo(() => {
		const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
		g.rotateX(-Math.PI / 2);
		const pos = g.attributes.position as THREE.BufferAttribute;
		const colors = new Float32Array(pos.count * 3);
		const grass = new THREE.Color('#3a5226'), dirt = new THREE.Color('#6b6038'), rock = new THREE.Color('#5c5c5e');
		const c = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i), z = pos.getZ(i);
			const y = heightAt(x, z, seed);
			pos.setY(i, y);
			const s = Math.min(1, slopeAt(x, z, seed) * 1.6);
			const hN = THREE.MathUtils.clamp((y + HILL / 2) / HILL, 0, 1);
			c.copy(grass).lerp(dirt, hN * 0.5).lerp(rock, s);
			colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
		}
		g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		g.computeVertexNormals();
		const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
		return { geom: g, mat };
	}, [seed]);
	useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);
	return <mesh geometry={geom} material={mat} receiveShadow />;
}

/* ---------- procedural trees (instanced) ---------- */
function Trees({ seed }: { seed: number }) {
	const { group, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ 0x9e37);
		const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
		const foliGeo = new THREE.ConeGeometry(1.6, 5, 8); foliGeo.translate(0, 2.4 + 2.5, 0);
		const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 });
		const foliMat = new THREE.MeshStandardMaterial({ color: 0x2f5e2a, roughness: 1 });
		const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
		const foli = new THREE.InstancedMesh(foliGeo, foliMat, TREES);
		trunks.castShadow = true; foli.castShadow = true; trunks.frustumCulled = false; foli.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < TREES * 4 && k < TREES; t++) {
			const r = Math.sqrt(rng()) * 108, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (Math.hypot(x, z) < 6 || slopeAt(x, z, seed) > 0.55) continue;
			const s = 0.8 + rng() * 0.9;
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set(0, rng() * 6.283, 0);
			d.scale.set(s, s + rng() * 0.4, s);
			d.updateMatrix();
			trunks.setMatrixAt(k, d.matrix); foli.setMatrixAt(k, d.matrix);
			col.setHSL(0.27 + rng() * 0.08, 0.4 + rng() * 0.2, 0.2 + rng() * 0.12); foli.setColorAt(k, col);
			k++;
		}
		trunks.count = k; foli.count = k;
		trunks.instanceMatrix.needsUpdate = true; foli.instanceMatrix.needsUpdate = true;
		if (foli.instanceColor) foli.instanceColor.needsUpdate = true;
		const group = new THREE.Group(); group.add(trunks, foli);
		return { group, dispose: () => { trunkGeo.dispose(); foliGeo.dispose(); trunkMat.dispose(); foliMat.dispose(); trunks.dispose(); foli.dispose(); } };
	}, [seed]);
	useEffect(() => dispose, [dispose]);
	return <primitive object={group} />;
}

/* ---------- grass (instanced quads) ---------- */
function Grass({ seed }: { seed: number }) {
	const { mesh, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ 0x51ed);
		const geo = new THREE.PlaneGeometry(0.32, 0.75); geo.translate(0, 0.37, 0);
		const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
		const mesh = new THREE.InstancedMesh(geo, mat, GRASS); mesh.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < GRASS * 2 && k < GRASS; t++) {
			const r = Math.sqrt(rng()) * 44, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (slopeAt(x, z, seed) > 0.7) continue;
			const s = 0.7 + rng() * 0.9;
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set((rng() - 0.5) * 0.4, rng() * 6.283, (rng() - 0.5) * 0.4);
			d.scale.set(s, s, s);
			d.updateMatrix();
			mesh.setMatrixAt(k, d.matrix);
			col.setHSL(0.26 + rng() * 0.08, 0.45 + rng() * 0.2, 0.28 + rng() * 0.14); mesh.setColorAt(k, col);
			k++;
		}
		mesh.count = k;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		return { mesh, dispose: () => { geo.dispose(); mat.dispose(); mesh.dispose(); } };
	}, [seed]);
	useEffect(() => dispose, [dispose]);
	return <primitive object={mesh} />;
}

/* ---------- scattered photogrammetry scans (instanced) ---------- */
function ScanInstances({ url, seed, count, scale, slopeMax = 1.5, minR = 0, radius = 95 }: { url: string; seed: number; count: number; scale: [number, number]; slopeMax?: number; minR?: number; radius?: number }) {
	const { scene } = useGLTF(url);
	const baked = useMemo(() => {
		scene.updateMatrixWorld(true);
		let found: THREE.Mesh | undefined;
		scene.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
		const src = found!;
		const g = src.geometry.clone();
		g.applyMatrix4(src.matrixWorld);
		g.computeBoundingBox();
		const bb = g.boundingBox!;
		g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
		return { g, mat: src.material as THREE.Material };
	}, [scene]);
	useEffect(() => () => baked.g.dispose(), [baked]);

	const { mesh, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ hashStr(url));
		const mesh = new THREE.InstancedMesh(baked.g, baked.mat, count);
		mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
		const d = new THREE.Object3D();
		let k = 0;
		for (let t = 0; t < count * 6 && k < count; t++) {
			const r = minR + Math.sqrt(rng()) * (radius - minR), a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (slopeAt(x, z, seed) > slopeMax) continue;
			const s = scale[0] + rng() * (scale[1] - scale[0]);
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set(0, rng() * 6.283, 0);
			d.scale.setScalar(s);
			d.updateMatrix();
			mesh.setMatrixAt(k, d.matrix);
			k++;
		}
		mesh.count = k;
		mesh.instanceMatrix.needsUpdate = true;
		return { mesh, dispose: () => mesh.dispose() };
	}, [seed, baked, count, url, scale, slopeMax, minR, radius]);
	useEffect(() => dispose, [dispose]);
	return <primitive object={mesh} />;
}

/* ---------- bake shadows once per seed (perf) ---------- */
function ShadowBaker({ seed }: { seed: number }) {
	const { gl } = useThree();
	useEffect(() => {
		gl.shadowMap.autoUpdate = false;
		gl.shadowMap.needsUpdate = true;
	}, [seed, gl]);
	return null;
}

function Loader() {
	return <Html center style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: '0.9rem' }}>Génération de la forêt…</Html>;
}

export default function Scene3D() {
	const [background, setBackground] = useState(true);
	const [autoRotate, setAutoRotate] = useState(true);
	const [seed, setSeed] = useState(1);

	return (
		<div className="s3-root">
			<style>{CSS}</style>
			<div className="s3-stage">
				<Canvas shadows dpr={[1, 2]} camera={{ position: [22, 12, 26], fov: 50 }} gl={{ antialias: true }}>
					<fog attach="fog" args={['#9fb0bf', 30, 150]} />
					<Environment files={HDRI} background={background} />
					<directionalLight position={[40, 60, 20]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
						<orthographicCamera attach="shadow-camera" args={[-70, 70, 70, -70, 1, 200]} />
					</directionalLight>
					<Suspense fallback={<Loader />}>
						<group key={seed}>
							<Terrain seed={seed} />
							<Trees seed={seed} />
							<Grass seed={seed} />
							<ScanInstances url={ROCK} seed={seed} count={ROCKS} scale={[1.1, 2.4]} slopeMax={1.5} minR={4} radius={95} />
							<ScanInstances url={BOULDER} seed={seed} count={BOULDERS} scale={[1.4, 2.8]} slopeMax={1.5} minR={8} radius={90} />
							<ScanInstances url={TRUNK} seed={seed} count={LOGS} scale={[0.9, 1.4]} slopeMax={0.6} minR={6} radius={80} />
							<ShadowBaker seed={seed} />
						</group>
					</Suspense>
					<OrbitControls makeDefault enableDamping autoRotate={autoRotate} autoRotateSpeed={0.45} target={[0, 2, 0]} minDistance={6} maxDistance={90} maxPolarAngle={Math.PI / 2 - 0.04} />
					<AdaptiveDpr pixelated />
				</Canvas>
				<div className="s3-panel">
					<button className="s3-reset" onClick={() => setSeed((Math.random() * 1e9) | 0)}>↻ Régénérer</button>
					<label><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Fond HDRI</label>
					<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
				</div>
			</div>
			<p className="s3-hint">Forêt générée procéduralement (terrain bruité, arbres, herbe et rochers CC0) éclairée par une HDRI. « Régénérer » recompose le relief et la végétation.</p>
		</div>
	);
}

const CSS = `
.s3-root { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: center; }
.s3-stage { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.4); background: #0b0e14; }
.s3-panel { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 0.45rem; padding: 0.7rem 0.9rem; border-radius: 12px; background: rgba(8,10,18,0.55); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.12); color: #f4f6fb; font-size: 0.85rem; }
.s3-panel label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
.s3-panel input[type="checkbox"] { accent-color: var(--accent-regular, #b07cff); width: 16px; height: 16px; }
.s3-reset { padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--accent-regular, #b07cff); background: var(--accent-regular, #7611a6); color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
.s3-reset:hover { filter: brightness(1.1); }
.s3-hint { color: var(--gray-400, #8a93a3); font-size: var(--text-sm); text-align: center; margin: 0; max-width: 62ch; }
`;
