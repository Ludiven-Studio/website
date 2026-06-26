import { useMemo, useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { heightAt, slopeAt, mulberry32 } from './terrainNoise';
import GradientSky from './GradientSky';
import PostFX from './PostFX';

const WATER_LEVEL = -2.6, EYE = 1.5;
// Infinite streaming: world split into CHUNK-sized tiles, R rings loaded around the focus point.
const CHUNK = 64, TSEG = 28, R = 2, R_GRASS = 1;
const TREES_PC = 12, ROCK_PC = 2, BUSH_PC = 4, FLOWER_PC = 14, GRASS_PC = 300;

const chunkSeed = (cx: number, cz: number, seed: number) => ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(seed, 83492791)) >>> 0);

/* ---------- shared, reusable resources (built once, used by every chunk) ---------- */
function makeGroundTexture(size = 256): THREE.CanvasTexture {
	const c = document.createElement('canvas'); c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#c7c7ba'; ctx.fillRect(0, 0, size, size);
	for (let i = 0; i < 2600; i++) {
		const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 2.6 + 0.6;
		ctx.fillStyle = Math.random() < 0.5 ? `rgba(120,120,104,${0.25 + Math.random() * 0.3})` : `rgba(214,214,198,${0.2 + Math.random() * 0.3})`;
		ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
	}
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(CHUNK / 9, CHUNK / 9);
	return tex;
}
function makeGrassTuft(size = 64): THREE.CanvasTexture {
	const c = document.createElement('canvas'); c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	for (let i = 0; i < 8; i++) {
		const bx = size * (0.15 + 0.7 * Math.random()), tx = bx + (Math.random() - 0.5) * size * 0.3;
		const w = size * (0.035 + Math.random() * 0.02), ty = size * (0.08 + Math.random() * 0.18);
		const g = ctx.createLinearGradient(0, size, 0, ty); g.addColorStop(0, '#3a6b22'); g.addColorStop(1, '#86c44a');
		ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - w, size); ctx.lineTo(bx + w, size);
		ctx.quadraticCurveTo((bx + tx) / 2 + w, (size + ty) / 2, tx + 0.6, ty);
		ctx.quadraticCurveTo((bx + tx) / 2 - w, (size + ty) / 2, bx - w, size); ctx.fill();
	}
	const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

interface Shared {
	terrainMat: THREE.MeshStandardMaterial;
	trunkGeo: THREE.BufferGeometry; foliGeo: THREE.BufferGeometry; trunkMat: THREE.Material; foliMat: THREE.Material;
	rockGeo: THREE.BufferGeometry; bushGeo: THREE.BufferGeometry; flowerGeo: THREE.BufferGeometry; litMat: THREE.Material;
	grassGeo: THREE.BufferGeometry; grassMat: THREE.MeshStandardMaterial; groundTex: THREE.Texture; grassTex: THREE.Texture;
}
function buildShared(): Shared {
	const groundTex = makeGroundTexture();
	const terrainMat = new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, flatShading: true, roughness: 1 });
	const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1.1, 6); trunkGeo.translate(0, 0.55, 0);
	const c1 = new THREE.ConeGeometry(1.25, 1.5, 7); c1.translate(0, 1.3, 0);
	const c2 = new THREE.ConeGeometry(1.0, 1.4, 7); c2.translate(0, 2.1, 0);
	const c3 = new THREE.ConeGeometry(0.65, 1.2, 7); c3.translate(0, 2.85, 0);
	const foliGeo = mergeGeometries([c1, c2, c3])!; c1.dispose(); c2.dispose(); c3.dispose();
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1, flatShading: true });
	const foliMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
	const rockGeo = new THREE.IcosahedronGeometry(1, 0);
	const bushGeo = new THREE.IcosahedronGeometry(1, 1);
	const flowerGeo = new THREE.ConeGeometry(0.18, 0.5, 5); flowerGeo.translate(0, 0.25, 0);
	const litMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
	const blade = new THREE.PlaneGeometry(0.5, 0.7, 1, 3); blade.translate(0, 0.35, 0);
	const blade2 = blade.clone(); blade2.rotateY(Math.PI / 2);
	const grassGeo = mergeGeometries([blade, blade2])!; blade.dispose(); blade2.dispose();
	const grassTex = makeGrassTuft();
	const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
	grassMat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = { value: 0 };
		grassMat.userData.shader = shader;
		shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
			`#include <begin_vertex>
			#ifdef USE_INSTANCING
				float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.6;
			#else
				float ph = 0.0;
			#endif
			transformed.x += (sin(uTime * 1.6 + ph) + 0.4 * sin(uTime * 3.1 + ph * 1.7)) * 0.10 * uv.y;`);
	};
	return { terrainMat, trunkGeo, foliGeo, trunkMat, foliMat, rockGeo, bushGeo, flowerGeo, litMat, grassGeo, grassMat, groundTex, grassTex };
}
function disposeShared(s: Shared) {
	s.terrainMat.dispose(); s.trunkGeo.dispose(); s.foliGeo.dispose(); s.trunkMat.dispose(); s.foliMat.dispose();
	s.rockGeo.dispose(); s.bushGeo.dispose(); s.flowerGeo.dispose(); s.litMat.dispose(); s.grassGeo.dispose(); s.grassMat.dispose();
	s.groundTex.dispose(); s.grassTex.dispose();
}

/* ---------- one streamed chunk: terrain tile + its instanced vegetation ---------- */
const LO = new THREE.Color('#5c7a3c'), HI = new THREE.Color('#7fa057'), ROCKC = new THREE.Color('#8b886e'), SAND = new THREE.Color('#cdbf93'), WET = new THREE.Color('#9a8c63');

function Chunk({ cx, cz, seed, shared, grass }: { cx: number; cz: number; seed: number; shared: Shared; grass: boolean }) {
	const { group, terrainGeo, instanced } = useMemo(() => {
		const rng = mulberry32(chunkSeed(cx, cz, seed));
		const ox = cx * CHUNK, oz = cz * CHUNK;
		const group = new THREE.Group();

		// terrain tile (world-space verts so neighbours line up)
		const tg = new THREE.PlaneGeometry(CHUNK, CHUNK, TSEG, TSEG);
		tg.rotateX(-Math.PI / 2); tg.translate(ox, 0, oz);
		const pos = tg.attributes.position as THREE.BufferAttribute;
		const colors = new Float32Array(pos.count * 3); const c = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z, seed); pos.setY(i, y);
			const sl = Math.min(1, slopeAt(x, z, seed) * 1.8), hN = THREE.MathUtils.clamp((y + 8) / 16, 0, 1);
			c.copy(LO).lerp(HI, hN).lerp(ROCKC, sl * 0.8);
			if (y < WATER_LEVEL) c.copy(WET); else c.lerp(SAND, THREE.MathUtils.clamp((WATER_LEVEL + 1.6 - y) / 1.6, 0, 1));
			colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
		}
		tg.setAttribute('color', new THREE.BufferAttribute(colors, 3)); tg.computeVertexNormals(); tg.computeBoundingSphere();
		const terrain = new THREE.Mesh(tg, shared.terrainMat); terrain.receiveShadow = true; group.add(terrain);

		const instanced: THREE.InstancedMesh[] = [];
		const d = new THREE.Object3D(), col = new THREE.Color();
		const rx = () => ox + (rng() - 0.5) * CHUNK, rz = () => oz + (rng() - 0.5) * CHUNK;

		// trees (trunk + foliage), cast shadows
		const trunks = new THREE.InstancedMesh(shared.trunkGeo, shared.trunkMat, TREES_PC);
		const foli = new THREE.InstancedMesh(shared.foliGeo, shared.foliMat, TREES_PC);
		trunks.castShadow = true; foli.castShadow = true;
		let kt = 0;
		for (let t = 0; t < TREES_PC * 4 && kt < TREES_PC; t++) {
			const x = rx(), z = rz();
			if (slopeAt(x, z, seed) > 0.6 || heightAt(x, z, seed) < WATER_LEVEL + 1.4) continue;
			const s = 0.75 + rng() * 0.95;
			d.position.set(x, heightAt(x, z, seed), z); d.rotation.set(0, rng() * 6.283, 0); d.scale.set(s, s + rng() * 0.5, s); d.updateMatrix();
			trunks.setMatrixAt(kt, d.matrix); foli.setMatrixAt(kt, d.matrix);
			col.setHSL(0.27 + rng() * 0.07, 0.45 + rng() * 0.2, 0.28 + rng() * 0.12); foli.setColorAt(kt, col); kt++;
		}
		trunks.count = kt; foli.count = kt;
		for (const m of [trunks, foli]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
		if (foli.instanceColor) foli.instanceColor.needsUpdate = true;
		group.add(trunks, foli); instanced.push(trunks, foli);

		// generic scatter helper
		const scatter = (geo: THREE.BufferGeometry, n: number, scale: [number, number], opts: { minH: number; slopeMax: number; jitterY?: number; palette?: number[]; baseHsl?: [number, number, number]; cast?: boolean }) => {
			const m = new THREE.InstancedMesh(geo, shared.litMat, n); m.castShadow = !!opts.cast;
			let k = 0;
			for (let t = 0; t < n * 4 && k < n; t++) {
				const x = rx(), z = rz();
				if (slopeAt(x, z, seed) > opts.slopeMax || heightAt(x, z, seed) < opts.minH) continue;
				const sx = scale[0] + rng() * (scale[1] - scale[0]);
				d.position.set(x, heightAt(x, z, seed) + (opts.jitterY ?? 0), z); d.rotation.set((rng() - 0.5) * 0.3, rng() * 6.283, (rng() - 0.5) * 0.3); d.scale.set(sx, sx * (0.7 + rng() * 0.6), sx); d.updateMatrix();
				m.setMatrixAt(k, d.matrix);
				if (opts.palette) col.setHex(opts.palette[(rng() * opts.palette.length) | 0]);
				else { col.setHSL(opts.baseHsl![0], opts.baseHsl![1], opts.baseHsl![2]); col.offsetHSL((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.1); }
				m.setColorAt(k, col); k++;
			}
			m.count = k; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
			if (m.instanceColor) m.instanceColor.needsUpdate = true;
			group.add(m); instanced.push(m);
		};
		scatter(shared.rockGeo, ROCK_PC, [0.8, 3.0], { minH: WATER_LEVEL - 1, slopeMax: 1.5, baseHsl: [0.11, 0.12, 0.42] });
		scatter(shared.bushGeo, BUSH_PC, [0.6, 1.4], { minH: WATER_LEVEL + 0.9, slopeMax: 0.7, jitterY: 0.2, baseHsl: [0.28, 0.45, 0.3] });
		if (grass) {
			scatter(shared.flowerGeo, FLOWER_PC, [0.5, 1.1], { minH: WATER_LEVEL + 0.9, slopeMax: 0.6, jitterY: 0.1, palette: [0xff5a5f, 0xffd166, 0xf4f4f4, 0xff8fab, 0x9b6dff] });
			// grass tufts
			const gm = new THREE.InstancedMesh(shared.grassGeo, shared.grassMat, GRASS_PC);
			let kg = 0;
			for (let t = 0; t < GRASS_PC * 2 && kg < GRASS_PC; t++) {
				const x = rx(), z = rz();
				if (slopeAt(x, z, seed) > 0.7 || heightAt(x, z, seed) < WATER_LEVEL + 0.9) continue;
				const s = 0.7 + rng() * 1.0;
				d.position.set(x, heightAt(x, z, seed), z); d.rotation.set(0, rng() * 6.283, 0); d.scale.set(s, s, s); d.updateMatrix();
				gm.setMatrixAt(kg, d.matrix); col.setHSL(0.26 + rng() * 0.08, 0.5 + rng() * 0.2, 0.42 + rng() * 0.16); gm.setColorAt(kg, col); kg++;
			}
			gm.count = kg; gm.instanceMatrix.needsUpdate = true; gm.computeBoundingSphere();
			if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
			group.add(gm); instanced.push(gm);
		}
		return { group, terrainGeo: tg, instanced };
	}, [cx, cz, seed, shared, grass]);
	useEffect(() => () => { terrainGeo.dispose(); instanced.forEach((m) => m.dispose()); }, [terrainGeo, instanced]);
	return <primitive object={group} />;
}

/* ---------- streaming manager: keep R rings of chunks around the focus point ---------- */
function World({ seed, shared, walk }: { seed: number; shared: Shared; walk: boolean }) {
	const { camera } = useThree();
	const [focus, setFocus] = useState({ cx: 0, cz: 0 });
	useFrame(() => {
		const fx = walk ? camera.position.x : 0, fz = walk ? camera.position.z : 0;
		const cx = Math.round(fx / CHUNK), cz = Math.round(fz / CHUNK);
		if (cx !== focus.cx || cz !== focus.cz) setFocus({ cx, cz });
		const sh = (shared.grassMat.userData as { shader?: { uniforms: { uTime: { value: number } } } }).shader;
		if (sh) sh.uniforms.uTime.value += 1 / 60;
	});
	const list: { cx: number; cz: number; grass: boolean }[] = [];
	for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
		list.push({ cx: focus.cx + dx, cz: focus.cz + dz, grass: Math.max(Math.abs(dx), Math.abs(dz)) <= R_GRASS });
	}
	return <>{list.map((c) => <Chunk key={`${seed}-${c.cx}-${c.cz}`} cx={c.cx} cz={c.cz} seed={seed} shared={shared} grass={c.grass} />)}</>;
}

/* ---------- sun that follows the focus so shadows stay around the player ---------- */
function SunLight({ walk }: { walk: boolean }) {
	const { camera } = useThree();
	const ref = useRef<THREE.DirectionalLight>(null);
	useFrame(() => {
		const l = ref.current; if (!l) return;
		const px = walk ? camera.position.x : 0, pz = walk ? camera.position.z : 0;
		l.position.set(px + 18, 30, pz + 12); l.target.position.set(px, 0, pz); l.target.updateMatrixWorld();
	});
	return (
		<directionalLight ref={ref} intensity={1.7} color="#fff3df" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
			<orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50, 1, 220]} />
		</directionalLight>
	);
}

/* ---------- infinite water (follows the camera) ---------- */
function Water({ walk }: { walk: boolean }) {
	const { camera } = useThree();
	const ref = useRef<THREE.Mesh>(null);
	const { mat, geo } = useMemo(() => {
		const mat = new THREE.ShaderMaterial({
			transparent: true,
			uniforms: { uTime: { value: 0 }, uShallow: { value: new THREE.Color('#8fd0df') }, uDeep: { value: new THREE.Color('#2f6f88') } },
			vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
			fragmentShader: `uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; varying vec3 vW;
				void main(){ float r = 0.5 + 0.5 * sin(vW.x * 0.25 + uTime * 0.8) * sin(vW.z * 0.3 - uTime * 0.6);
					float r2 = 0.5 + 0.5 * sin((vW.x + vW.z) * 0.6 + uTime * 1.3);
					gl_FragColor = vec4(mix(uDeep, uShallow, r * 0.55 + r2 * 0.2 + 0.1), 0.82); }`,
		});
		const geo = new THREE.PlaneGeometry((2 * R + 2) * CHUNK, (2 * R + 2) * CHUNK); geo.rotateX(-Math.PI / 2);
		return { mat, geo };
	}, []);
	useFrame((_, dt) => {
		mat.uniforms.uTime.value += Math.min(dt, 0.05);
		const m = ref.current; if (!m) return;
		m.position.set(walk ? camera.position.x : 0, WATER_LEVEL, walk ? camera.position.z : 0);
	});
	useEffect(() => () => { mat.dispose(); geo.dispose(); }, [mat, geo]);
	return <mesh ref={ref} geometry={geo} material={mat} renderOrder={1} />;
}

/* ---------- first-person walk: drag to look (cursor free), ZQSD/WASD to move, eye at EYE above ground, no bounds ---------- */
function WalkControls({ seed }: { seed: number }) {
	const { camera, gl } = useThree();
	const keys = useMemo<Record<string, boolean>>(() => ({}), []);
	const look = useMemo(() => ({ yaw: 0, pitch: -0.08, dragging: false, lx: 0, ly: 0 }), []);
	useEffect(() => {
		camera.position.set(0, heightAt(0, 0, seed) + EYE, 12); look.yaw = 0; look.pitch = -0.08;
		const el = gl.domElement;
		const kd = (e: KeyboardEvent) => { keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); };
		const ku = (e: KeyboardEvent) => { keys[e.code] = false; };
		const pd = (e: PointerEvent) => { look.dragging = true; look.lx = e.clientX; look.ly = e.clientY; el.style.cursor = 'grabbing'; };
		const pm = (e: PointerEvent) => { if (!look.dragging) return; look.yaw -= (e.clientX - look.lx) * 0.0026; look.pitch = Math.max(-1.2, Math.min(1.0, look.pitch - (e.clientY - look.ly) * 0.0026)); look.lx = e.clientX; look.ly = e.clientY; };
		const pu = () => { look.dragging = false; el.style.cursor = 'grab'; };
		el.style.cursor = 'grab';
		window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
		el.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
		return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); el.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); el.style.cursor = ''; };
	}, [seed, camera, gl, keys, look]);
	const fwd = useMemo(() => new THREE.Vector3(), []);
	const right = useMemo(() => new THREE.Vector3(), []);
	const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
	useFrame((_, dt) => {
		camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
		const spd = 8 * Math.min(dt, 0.05);
		camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, up).normalize();
		let mx = 0, mz = 0;
		if (keys['KeyW'] || keys['KeyZ'] || keys['ArrowUp']) { mx += fwd.x; mz += fwd.z; }
		if (keys['KeyS'] || keys['ArrowDown']) { mx -= fwd.x; mz -= fwd.z; }
		if (keys['KeyD'] || keys['ArrowRight']) { mx += right.x; mz += right.z; }
		if (keys['KeyA'] || keys['KeyQ'] || keys['ArrowLeft']) { mx -= right.x; mz -= right.z; }
		const len = Math.hypot(mx, mz);
		if (len > 0) { camera.position.x += (mx / len) * spd; camera.position.z += (mz / len) * spd; }
		camera.position.y = heightAt(camera.position.x, camera.position.z, seed) + EYE;
	});
	return null;
}

export default function Scene3D() {
	const [autoRotate, setAutoRotate] = useState(true);
	const [walk, setWalk] = useState(false);
	const [water, setWater] = useState(true);
	const [seed, setSeed] = useState(1);

	const shared = useMemo(() => buildShared(), []);
	useEffect(() => () => disposeShared(shared), [shared]);

	return (
		<div className="s3-root">
			<style>{CSS}</style>
			<div className="s3-stage">
				<Canvas shadows dpr={[1, 2]} camera={{ position: [22, 12, 26], fov: 52 }} gl={{ antialias: true }}>
					<GradientSky top="#9fc6ef" bottom="#eaf2e6" />
					<fogExp2 attach="fog" args={['#e3ecdf', 0.009]} />
					<hemisphereLight args={['#bcd6f2', '#5c6b4a', 0.9]} />
					<SunLight walk={walk} />
					<ambientLight intensity={0.2} />
					{water && <Water walk={walk} />}
					<World seed={seed} shared={shared} walk={walk} />
					{walk ? <WalkControls seed={seed} /> : (
						<OrbitControls makeDefault enableDamping autoRotate={autoRotate} autoRotateSpeed={0.4} target={[0, 2, 0]} minDistance={6} maxDistance={120} maxPolarAngle={Math.PI / 2 - 0.05} />
					)}
					<AdaptiveDpr pixelated />
					<PostFX />
				</Canvas>
				<div className="s3-panel">
					<button className="s3-reset" onClick={() => setSeed((Math.random() * 1e9) | 0)}>↻ Régénérer</button>
					<label><input type="checkbox" checked={walk} onChange={(e) => setWalk(e.target.checked)} /> Marcher (monde infini)</label>
					<label><input type="checkbox" checked={water} onChange={(e) => setWater(e.target.checked)} /> Eau</label>
					{!walk && <label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>}
				</div>
			</div>
			<p className="s3-hint">{walk ? 'Monde infini : glisse pour regarder · ZQSD / WASD / flèches pour avancer (les chunks se génèrent autour de toi).' : 'Décor low-poly stylisé, 100 % procédural. Active « Marcher » pour explorer un monde sans fin à pied.'}</p>
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
