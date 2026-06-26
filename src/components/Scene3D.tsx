import { useMemo, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { heightAt, slopeAt, mulberry32 } from './terrainNoise';
import GradientSky from './GradientSky';
import PostFX from './PostFX';

const SIZE = 280, SEG = 150;
const TREES = 200, GRASS = 4500, ROCKS = 36, BUSHES = 60, FLOWERS = 140;

/* ---------- faceted, vertex-coloured terrain ---------- */
function Terrain({ seed }: { seed: number }) {
	const { geom, mat } = useMemo(() => {
		const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
		g.rotateX(-Math.PI / 2);
		const pos = g.attributes.position as THREE.BufferAttribute;
		const colors = new Float32Array(pos.count * 3);
		const lo = new THREE.Color('#5c7a3c'), hi = new THREE.Color('#7fa057'), rock = new THREE.Color('#8b886e');
		const c = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z, seed);
			pos.setY(i, y);
			const s = Math.min(1, slopeAt(x, z, seed) * 1.8);
			const hN = THREE.MathUtils.clamp((y + 8) / 16, 0, 1);
			c.copy(lo).lerp(hi, hN).lerp(rock, s * 0.8);
			colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
		}
		g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		g.computeVertexNormals();
		return { geom: g, mat: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }) };
	}, [seed]);
	useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);
	return <mesh geometry={geom} material={mat} receiveShadow />;
}

/* ---------- stylized conifers (layered cones), instanced ---------- */
function Trees({ seed }: { seed: number }) {
	const { trunks, foli, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ 0x9e37);
		const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1.1, 6); trunkGeo.translate(0, 0.55, 0);
		const c1 = new THREE.ConeGeometry(1.25, 1.5, 7); c1.translate(0, 1.3, 0);
		const c2 = new THREE.ConeGeometry(1.0, 1.4, 7); c2.translate(0, 2.1, 0);
		const c3 = new THREE.ConeGeometry(0.65, 1.2, 7); c3.translate(0, 2.85, 0);
		const foliGeo = mergeGeometries([c1, c2, c3])!;
		c1.dispose(); c2.dispose(); c3.dispose();
		const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1, flatShading: true });
		const foliMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
		const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
		const foli = new THREE.InstancedMesh(foliGeo, foliMat, TREES);
		trunks.castShadow = true; foli.castShadow = true; foli.receiveShadow = true;
		trunks.frustumCulled = false; foli.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < TREES * 4 && k < TREES; t++) {
			const r = Math.sqrt(rng()) * 130, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (Math.hypot(x, z) < 6 || slopeAt(x, z, seed) > 0.6) continue;
			const s = 0.75 + rng() * 0.95;
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set(0, rng() * 6.283, 0);
			d.scale.set(s, s + rng() * 0.5, s);
			d.updateMatrix();
			trunks.setMatrixAt(k, d.matrix); foli.setMatrixAt(k, d.matrix);
			col.setHSL(0.27 + rng() * 0.07, 0.45 + rng() * 0.2, 0.28 + rng() * 0.12); foli.setColorAt(k, col);
			k++;
		}
		trunks.count = k; foli.count = k;
		trunks.instanceMatrix.needsUpdate = true; foli.instanceMatrix.needsUpdate = true;
		if (foli.instanceColor) foli.instanceColor.needsUpdate = true;
		return { trunks, foli, dispose: () => { trunkGeo.dispose(); foliGeo.dispose(); trunkMat.dispose(); foliMat.dispose(); trunks.dispose(); foli.dispose(); } };
	}, [seed]);
	useEffect(() => dispose, [dispose]);
	return <><primitive object={trunks} /><primitive object={foli} /></>;
}

/* ---------- generic low-poly scatter (rocks / bushes / flowers) ---------- */
function Scatter({ seed, salt, geo, baseColor, count, radius, scaleRange, jitterY = 0, hueVary = 0, palette, castShadow = true, slopeMax = 1.5 }: {
	seed: number; salt: number; geo: THREE.BufferGeometry; baseColor: number; count: number; radius: number; scaleRange: [number, number]; jitterY?: number; hueVary?: number; palette?: number[]; castShadow?: boolean; slopeMax?: number;
}) {
	const { mesh, mat, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ salt);
		const mat = new THREE.MeshStandardMaterial({ color: palette ? 0xffffff : baseColor, roughness: 1, flatShading: true });
		const mesh = new THREE.InstancedMesh(geo, mat, count);
		mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < count * 4 && k < count; t++) {
			const r = Math.sqrt(rng()) * radius, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (slopeAt(x, z, seed) > slopeMax) continue;
			const sx = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0]);
			d.position.set(x, heightAt(x, z, seed) + jitterY, z);
			d.rotation.set((rng() - 0.5) * 0.3, rng() * 6.283, (rng() - 0.5) * 0.3);
			d.scale.set(sx, sx * (0.7 + rng() * 0.6), sx);
			d.updateMatrix();
			mesh.setMatrixAt(k, d.matrix);
			if (palette) col.setHex(palette[(rng() * palette.length) | 0]);
			else { col.set(baseColor); if (hueVary) col.offsetHSL((rng() - 0.5) * hueVary, 0, (rng() - 0.5) * 0.1); }
			mesh.setColorAt(k, col);
			k++;
		}
		mesh.count = k;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		return { mesh, mat, dispose: () => { mat.dispose(); mesh.dispose(); } };
	}, [seed, salt, geo, baseColor, count, radius, scaleRange, jitterY, hueVary, palette, castShadow, slopeMax]);
	useEffect(() => dispose, [dispose]);
	void mat;
	return <primitive object={mesh} />;
}

/* ---------- grass: crossed alpha tufts, instanced, wind sway ---------- */
function makeGrassTuft(size = 64): THREE.CanvasTexture {
	const c = document.createElement('canvas'); c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	for (let i = 0; i < 8; i++) {
		const bx = size * (0.15 + 0.7 * Math.random()), tx = bx + (Math.random() - 0.5) * size * 0.3;
		const w = size * (0.035 + Math.random() * 0.02), ty = size * (0.08 + Math.random() * 0.18);
		const g = ctx.createLinearGradient(0, size, 0, ty); g.addColorStop(0, '#3a6b22'); g.addColorStop(1, '#86c44a');
		ctx.fillStyle = g;
		ctx.beginPath(); ctx.moveTo(bx - w, size); ctx.lineTo(bx + w, size);
		ctx.quadraticCurveTo((bx + tx) / 2 + w, (size + ty) / 2, tx + 0.6, ty);
		ctx.quadraticCurveTo((bx + tx) / 2 - w, (size + ty) / 2, bx - w, size); ctx.fill();
	}
	const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function Grass({ seed }: { seed: number }) {
	const { mesh, mat, dispose } = useMemo(() => {
		const rng = mulberry32(seed ^ 0x51ed);
		const blade = new THREE.PlaneGeometry(0.5, 0.7, 1, 3); blade.translate(0, 0.35, 0);
		const blade2 = blade.clone(); blade2.rotateY(Math.PI / 2);
		const geo = mergeGeometries([blade, blade2])!; blade.dispose(); blade2.dispose();
		const tex = makeGrassTuft();
		const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
		mat.onBeforeCompile = (shader) => {
			shader.uniforms.uTime = { value: 0 };
			mat.userData.shader = shader;
			shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
				`#include <begin_vertex>
				#ifdef USE_INSTANCING
					float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.6;
				#else
					float ph = 0.0;
				#endif
				transformed.x += (sin(uTime * 1.6 + ph) + 0.4 * sin(uTime * 3.1 + ph * 1.7)) * 0.10 * uv.y;`);
		};
		const mesh = new THREE.InstancedMesh(geo, mat, GRASS); mesh.frustumCulled = false;
		const d = new THREE.Object3D(), col = new THREE.Color();
		let k = 0;
		for (let t = 0; t < GRASS * 2 && k < GRASS; t++) {
			const r = Math.sqrt(rng()) * 50, a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (slopeAt(x, z, seed) > 0.7) continue;
			const s = 0.7 + rng() * 1.0;
			d.position.set(x, heightAt(x, z, seed), z);
			d.rotation.set(0, rng() * 6.283, 0); d.scale.set(s, s, s); d.updateMatrix();
			mesh.setMatrixAt(k, d.matrix);
			col.setHSL(0.26 + rng() * 0.08, 0.5 + rng() * 0.2, 0.42 + rng() * 0.16); mesh.setColorAt(k, col);
			k++;
		}
		mesh.count = k; mesh.instanceMatrix.needsUpdate = true;
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

function ShadowBaker({ seed }: { seed: number }) {
	const { gl } = useThree();
	useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }, [seed, gl]);
	return null;
}

export default function Scene3D() {
	const [autoRotate, setAutoRotate] = useState(true);
	const [seed, setSeed] = useState(1);

	// Shared low-poly geometries for the scatter layers.
	const geos = useMemo(() => {
		const rock = new THREE.IcosahedronGeometry(1, 0);
		const bush = new THREE.IcosahedronGeometry(1, 1);
		const flower = new THREE.ConeGeometry(0.18, 0.5, 5); flower.translate(0, 0.25, 0);
		return { rock, bush, flower };
	}, []);
	useEffect(() => () => { geos.rock.dispose(); geos.bush.dispose(); geos.flower.dispose(); }, [geos]);

	return (
		<div className="s3-root">
			<style>{CSS}</style>
			<div className="s3-stage">
				<Canvas shadows dpr={[1, 2]} camera={{ position: [20, 11, 24], fov: 52 }} gl={{ antialias: true }}>
					<GradientSky top="#9fc6ef" bottom="#eaf2e6" />
					<fogExp2 attach="fog" args={['#e3ecdf', 0.016]} />
					<hemisphereLight args={['#bcd6f2', '#5c6b4a', 0.9]} />
					<directionalLight position={[18, 26, 12]} intensity={1.7} color="#fff3df" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
						<orthographicCamera attach="shadow-camera" args={[-80, 80, 80, -80, 1, 220]} />
					</directionalLight>
					<ambientLight intensity={0.2} />

					<group key={seed}>
						<Terrain seed={seed} />
						<Trees seed={seed} />
						<Grass seed={seed} />
						<Scatter seed={seed} salt={0x1} geo={geos.rock} baseColor={0x8b886e} count={ROCKS} radius={120} scaleRange={[0.8, 3.2]} hueVary={0.04} />
						<Scatter seed={seed} salt={0x2} geo={geos.bush} baseColor={0x466e2f} count={BUSHES} radius={115} scaleRange={[0.6, 1.4]} jitterY={0.2} hueVary={0.06} slopeMax={0.7} />
						<Scatter seed={seed} salt={0x3} geo={geos.flower} baseColor={0xffffff} count={FLOWERS} radius={70} scaleRange={[0.5, 1.1]} jitterY={0.1} castShadow={false} slopeMax={0.6} palette={[0xff5a5f, 0xffd166, 0xf4f4f4, 0xff8fab, 0x9b6dff]} />
						<ShadowBaker seed={seed} />
					</group>

					<OrbitControls makeDefault enableDamping autoRotate={autoRotate} autoRotateSpeed={0.4} target={[0, 2, 0]} minDistance={6} maxDistance={120} maxPolarAngle={Math.PI / 2 - 0.05} />
					<AdaptiveDpr pixelated />
					<PostFX />
				</Canvas>
				<div className="s3-panel">
					<button className="s3-reset" onClick={() => setSeed((Math.random() * 1e9) | 0)}>↻ Régénérer</button>
					<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
				</div>
			</div>
			<p className="s3-hint">Forêt low-poly stylisée, 100 % procédurale : ciel dégradé, terrain facetté, conifères, herbe au vent, rochers, buissons &amp; fleurs. « Régénérer » recompose la scène.</p>
		</div>
	);
}

const CSS = `
.s3-root { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: center; }
.s3-stage { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.4); background: #cfe0ee; }
.s3-panel { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 0.45rem; padding: 0.7rem 0.9rem; border-radius: 12px; background: rgba(8,10,18,0.5); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.14); color: #f4f6fb; font-size: 0.85rem; }
.s3-panel label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
.s3-panel input[type="checkbox"] { accent-color: var(--accent-regular, #b07cff); width: 16px; height: 16px; }
.s3-reset { padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--accent-regular, #b07cff); background: var(--accent-regular, #7611a6); color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
.s3-reset:hover { filter: brightness(1.1); }
.s3-hint { color: var(--gray-400, #8a93a3); font-size: var(--text-sm); text-align: center; margin: 0; max-width: 62ch; }
`;
