import { Suspense, useMemo, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useTexture, AdaptiveDpr, Html } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { heightAt, slopeAt, mulberry32, hashStr } from './terrainNoise';
import PostFX from './PostFX';
import Trees from './Trees';

const HDRI = '/hdris/forest_slope_1k.hdr';
const ROCK = '/models/moon_rock_01/moon_rock_01_1k.gltf';
const BOULDER = '/models/boulder_01/boulder_01_1k.gltf';
const TRUNK = '/models/dead_tree_trunk/dead_tree_trunk_1k.gltf';
const FLOOR = ['/textures/forest_floor_diff_1k.jpg', '/textures/forest_floor_nor_1k.jpg', '/textures/forest_floor_rough_1k.jpg'];
[ROCK, BOULDER, TRUNK].forEach((u) => useGLTF.preload(u));

const SIZE = 240, SEG = 150;
const GRASS = 5200, ROCKS = 52, BOULDERS = 12, LOGS = 6;

/* ---------- terrain (noise heightmap + PBR forest floor) ---------- */
function Terrain({ seed }: { seed: number }) {
	const [diff, nor, rough] = useTexture(FLOOR);
	const geom = useMemo(() => {
		const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
		g.rotateX(-Math.PI / 2);
		const pos = g.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i), seed));
		g.computeVertexNormals();
		return g;
	}, [seed]);
	const mat = useMemo(() => {
		for (const t of [diff, nor, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(SIZE / 8, SIZE / 8); }
		diff.colorSpace = THREE.SRGBColorSpace;
		return new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, roughnessMap: rough, roughness: 1 });
	}, [diff, nor, rough]);
	useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);
	return <mesh geometry={geom} material={mat} receiveShadow />;
}

/* ---------- grass: crossed alpha tufts, instanced, with a wind sway ---------- */
function makeGrassTuft(size = 64): THREE.CanvasTexture {
	const c = document.createElement('canvas'); c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	for (let i = 0; i < 8; i++) {
		const bx = size * (0.15 + 0.7 * Math.random());
		const tx = bx + (Math.random() - 0.5) * size * 0.3;
		const w = size * (0.035 + Math.random() * 0.02);
		const ty = size * (0.08 + Math.random() * 0.18);
		const g = ctx.createLinearGradient(0, size, 0, ty);
		g.addColorStop(0, '#274d18'); g.addColorStop(1, '#6fae3c');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.moveTo(bx - w, size); ctx.lineTo(bx + w, size);
		ctx.quadraticCurveTo((bx + tx) / 2 + w, (size + ty) / 2, tx + 0.6, ty);
		ctx.quadraticCurveTo((bx + tx) / 2 - w, (size + ty) / 2, bx - w, size);
		ctx.fill();
	}
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function Grass({ seed }: { seed: number }) {
	const { mesh, mat, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ 0x51ed);
		const blade = new THREE.PlaneGeometry(0.5, 0.7, 1, 3); blade.translate(0, 0.35, 0);
		const blade2 = blade.clone(); blade2.rotateY(Math.PI / 2);
		const geo = mergeGeometries([blade, blade2])!;
		blade.dispose(); blade2.dispose();
		const tex = makeGrassTuft();
		const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
		mat.onBeforeCompile = (shader) => {
			shader.uniforms.uTime = { value: 0 };
			mat.userData.shader = shader;
			shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				#ifdef USE_INSTANCING
					float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.6;
				#else
					float ph = 0.0;
				#endif
				float sway = sin(uTime * 1.6 + ph) + 0.4 * sin(uTime * 3.1 + ph * 1.7);
				transformed.x += sway * 0.10 * uv.y;`,
			);
		};
		const mesh = new THREE.InstancedMesh(geo, mat, GRASS); mesh.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < GRASS * 2 && k < GRASS; t++) {
			const r = Math.sqrt(rng()) * 44, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (slopeAt(x, z, seed) > 0.7) continue;
			const s = 0.7 + rng() * 1.0;
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set(0, rng() * 6.283, 0);
			d.scale.set(s, s, s);
			d.updateMatrix();
			mesh.setMatrixAt(k, d.matrix);
			col.setHSL(0.26 + rng() * 0.08, 0.45 + rng() * 0.2, 0.42 + rng() * 0.16); mesh.setColorAt(k, col);
			k++;
		}
		mesh.count = k;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		return { mesh, mat, dispose: () => { geo.dispose(); mat.dispose(); tex.dispose(); mesh.dispose(); } };
	}, [seed]);
	useFrame(({ clock }) => {
		const sh = (mat.userData as { shader?: { uniforms: { uTime: { value: number } } } }).shader;
		if (sh) sh.uniforms.uTime.value = clock.elapsedTime;
	});
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

/* ---------- bake shadows once per seed ---------- */
function ShadowBaker({ seed }: { seed: number }) {
	const { gl } = useThree();
	useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }, [seed, gl]);
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
					<fogExp2 attach="fog" args={['#aab6b0', 0.014]} />
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
					<PostFX />
				</Canvas>
				<div className="s3-panel">
					<button className="s3-reset" onClick={() => setSeed((Math.random() * 1e9) | 0)}>↻ Régénérer</button>
					<label><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Fond HDRI</label>
					<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
				</div>
			</div>
			<p className="s3-hint">Forêt procédurale (terrain bruité + sol PBR, herbe alpha au vent, rochers CC0) — éclairage HDRI, AO &amp; étalonnage. « Régénérer » recompose la scène.</p>
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
