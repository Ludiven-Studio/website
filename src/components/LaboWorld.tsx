import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

interface Car { x: number; z: number; axis: 'x' | 'z'; dir: number; speed: number; }
interface World {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	composer: EffectComposer;
	bloomPass: UnrealBloomPass;
	controls: OrbitControls;
	water: Water;
	sky: Sky;
	dirLight: THREE.DirectionalLight;
	hemi: THREE.HemisphereLight;
	buildingMat: THREE.MeshStandardMaterial;
	cars: THREE.InstancedMesh;
	carData: Car[];
	disposables: { dispose: () => void }[];
}

const CITY_R = 44;
const LAND_R = 100;

/** Tiling water normal map (height field → finite-difference normals), asset-free. */
function makeWaterNormals(size = 256): THREE.Texture {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const T = Math.PI * 2;
	const h = (x: number, y: number) => {
		const u = x / size, v = y / size;
		return Math.sin(u * T * 3 + v * T) * 0.5 + Math.sin(u * T * 5 - v * T * 4) * 0.3 + Math.sin(u * T * 9 + v * T * 7) * 0.2;
	};
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const nx = -(h(x + 1, y) - h(x - 1, y)), ny = -(h(x, y + 1) - h(x, y - 1)), nz = 1;
		const inv = 1 / Math.hypot(nx, ny, nz), i = (y * size + x) * 4;
		img.data[i] = (nx * inv * 0.5 + 0.5) * 255;
		img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
		img.data[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
		img.data[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	return tex;
}

/** Building façade: dark wall with a grid of windows, most lit (emissive map for the bloom-at-night look). */
function makeWindowTexture(rng: () => number): THREE.Texture {
	const cols = 6, rows = 22, cw = 12, ch = 12;
	const c = document.createElement('canvas');
	c.width = cols * cw;
	c.height = rows * ch;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#05060a';
	ctx.fillRect(0, 0, c.width, c.height);
	const tints = ['#ffd9a0', '#fff1c8', '#bfe0ff', '#ffe7b0'];
	for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
		if (rng() < 0.28) continue; // dark window
		ctx.fillStyle = tints[(rng() * tints.length) | 0];
		ctx.fillRect(col * cw + 2, r * ch + 2, cw - 4, ch - 4);
	}
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// Tiny deterministic PRNG so the city looks the same each mount.
function mulberry(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export default function LaboWorld() {
	const [webglError, setWebglError] = useState(false);
	const [ready, setReady] = useState(false);
	const [night, setNight] = useState(true);
	const [bloom, setBloom] = useState(true);
	const [autoRotate, setAutoRotate] = useState(true);
	const [exposure, setExposure] = useState(1);

	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gRef = useRef<World | null>(null);
	const rafRef = useRef(0);
	const clockRef = useRef(new THREE.Clock());

	const applyTime = useCallback((isNight: boolean) => {
		const g = gRef.current;
		if (!g) return;
		const elev = isNight ? 1.5 : 26;
		const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(150));
		g.sky.material.uniforms['sunPosition'].value.copy(sun);
		g.sky.material.uniforms['rayleigh'].value = isNight ? 0.6 : 2.2;
		g.sky.material.uniforms['turbidity'].value = isNight ? 12 : 8;
		g.dirLight.position.copy(sun).multiplyScalar(80);
		g.dirLight.color.set(isNight ? 0x6a7cff : 0xfff0d8);
		g.dirLight.intensity = isNight ? 0.25 : 2.6;
		g.hemi.intensity = isNight ? 0.12 : 0.5;
		g.buildingMat.emissiveIntensity = isNight ? 1.7 : 0.0;
		(g.water.material as THREE.ShaderMaterial).uniforms['sunDirection'].value.copy(sun).normalize();
		(g.water.material as THREE.ShaderMaterial).uniforms['waterColor'].value.set(isNight ? 0x0a1622 : 0x114455);
	}, []);

	const initScene = useCallback((): boolean => {
		if (!canvasRef.current || !wrapRef.current) return false;
		const wrap = wrapRef.current;
		const w = wrap.clientWidth || 800, hgt = wrap.clientHeight || 450;
		const rng = mulberry(20260626);

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return false;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.setSize(w, hgt, false);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(55, w / hgt, 0.5, 12000);
		camera.position.set(70, 48, 80);

		const sky = new Sky();
		sky.scale.setScalar(6000);
		sky.material.uniforms['mieCoefficient'].value = 0.005;
		sky.material.uniforms['mieDirectionalG'].value = 0.8;
		scene.add(sky);

		const pmrem = new THREE.PMREMGenerator(renderer);
		const roomEnv = new RoomEnvironment();
		scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
		roomEnv.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });

		// Sea.
		const waterNormals = makeWaterNormals(256);
		const water = new Water(new THREE.PlaneGeometry(8000, 8000), {
			textureWidth: 512, textureHeight: 512, waterNormals,
			sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x0a1622, distortionScale: 3, fog: false,
		});
		water.rotation.x = -Math.PI / 2;
		water.position.y = -0.6;
		scene.add(water);

		// Land (island) + city asphalt.
		const land = new THREE.Mesh(new THREE.CircleGeometry(LAND_R, 80), new THREE.MeshStandardMaterial({ color: 0x33502f, roughness: 1 }));
		land.rotation.x = -Math.PI / 2;
		land.receiveShadow = true;
		scene.add(land);
		const asphalt = new THREE.Mesh(new THREE.CircleGeometry(CITY_R + 4, 64), new THREE.MeshStandardMaterial({ color: 0x191b21, roughness: 0.9 }));
		asphalt.rotation.x = -Math.PI / 2;
		asphalt.position.y = 0.02;
		asphalt.receiveShadow = true;
		scene.add(asphalt);

		// Lights.
		const dirLight = new THREE.DirectionalLight(0xfff0d8, 2.6);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.set(2048, 2048);
		dirLight.shadow.camera.near = 1;
		dirLight.shadow.camera.far = 320;
		const sc = dirLight.shadow.camera as THREE.OrthographicCamera;
		sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
		dirLight.shadow.bias = -0.0004;
		scene.add(dirLight);
		const hemi = new THREE.HemisphereLight(0x9fc0ff, 0x202a18, 0.4);
		scene.add(hemi);

		// City buildings (instanced; windows via emissive map).
		const SPACING = 7, dummy = new THREE.Object3D();
		const sites: { x: number; z: number; fw: number; fd: number; h: number }[] = [];
		for (let gx = -CITY_R; gx <= CITY_R; gx += SPACING) {
			for (let gz = -CITY_R; gz <= CITY_R; gz += SPACING) {
				const x = gx + (rng() - 0.5) * 1.5, z = gz + (rng() - 0.5) * 1.5;
				if (Math.hypot(x, z) > CITY_R) continue;
				if (rng() < 0.12) continue; // square / gap
				sites.push({ x, z, fw: 3.4 + rng() * 1.6, fd: 3.4 + rng() * 1.6, h: 5 + rng() * rng() * 34 });
			}
		}
		const buildingMat = new THREE.MeshStandardMaterial({
			color: 0xffffff, roughness: 0.55, metalness: 0.1,
			emissive: 0xffffff, emissiveMap: makeWindowTexture(rng), emissiveIntensity: 1.7,
		});
		const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMat, sites.length);
		buildings.castShadow = true;
		buildings.receiveShadow = true;
		const tint = new THREE.Color();
		sites.forEach((s, i) => {
			dummy.position.set(s.x, s.h / 2, s.z);
			dummy.scale.set(s.fw, s.h, s.fd);
			dummy.rotation.set(0, 0, 0);
			dummy.updateMatrix();
			buildings.setMatrixAt(i, dummy.matrix);
			tint.setHSL(0.58 + rng() * 0.05, 0.12, 0.18 + rng() * 0.22);
			buildings.setColorAt(i, tint);
		});
		buildings.instanceMatrix.needsUpdate = true;
		if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
		scene.add(buildings);

		// Forest ring (instanced trunks + foliage).
		const TREES = 700;
		const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 });
		const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2c, roughness: 1 });
		const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1, 5), trunkMat, TREES);
		const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 7), leafMat, TREES);
		leaves.castShadow = true;
		for (let i = 0; i < TREES; i++) {
			const a = rng() * Math.PI * 2, r = (CITY_R + 8) + rng() * (LAND_R - CITY_R - 16);
			const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.8 + rng() * 1.4;
			dummy.position.set(x, 0.5 * s, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, rng() * 6.28, 0); dummy.updateMatrix();
			trunks.setMatrixAt(i, dummy.matrix);
			dummy.position.set(x, (1 + 1) * s, z); dummy.scale.set(s, s, s); dummy.updateMatrix();
			leaves.setMatrixAt(i, dummy.matrix);
		}
		trunks.instanceMatrix.needsUpdate = true;
		leaves.instanceMatrix.needsUpdate = true;
		scene.add(trunks, leaves);

		// Distant mountains (snow-capped cones near the coast).
		const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 1, flatShading: true });
		const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef3ff, roughness: 0.8, flatShading: true });
		const mtns = new THREE.Group();
		for (let i = 0; i < 14; i++) {
			const a = (i / 14) * Math.PI * 2 + rng() * 0.2, r = LAND_R - 6 - rng() * 8;
			const hgtM = 26 + rng() * 30, rad = 12 + rng() * 8;
			const rock = new THREE.Mesh(new THREE.ConeGeometry(rad, hgtM, 6 + ((rng() * 3) | 0)), rockMat);
			rock.position.set(Math.cos(a) * r, hgtM / 2 - 1, Math.sin(a) * r);
			const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, hgtM * 0.32, 6), snowMat);
			cap.position.set(rock.position.x, hgtM - hgtM * 0.16 - 1, rock.position.z);
			mtns.add(rock, cap);
		}
		scene.add(mtns);

		// Moving cars (instanced) on a few straight streets.
		const CARS = 26;
		const carMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.5, emissive: 0xff3030, emissiveIntensity: 0.4 });
		const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.7, 1.1), carMat, CARS);
		const carData: Car[] = [];
		for (let i = 0; i < CARS; i++) {
			const axis: 'x' | 'z' = rng() < 0.5 ? 'x' : 'z';
			const lane = (Math.round((rng() * 2 - 1) * 5) * SPACING) + (rng() < 0.5 ? 1.4 : -1.4);
			carData.push({ axis, x: axis === 'x' ? (rng() * 2 - 1) * CITY_R : lane, z: axis === 'z' ? (rng() * 2 - 1) * CITY_R : lane, dir: rng() < 0.5 ? 1 : -1, speed: 8 + rng() * 10 });
			const c2 = new THREE.Color().setHSL(rng(), 0.5, 0.5);
			cars.setColorAt(i, c2);
		}
		if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
		scene.add(cars);

		// Postprocessing.
		const composer = new EffectComposer(renderer);
		composer.setSize(w, hgt);
		composer.addPass(new RenderPass(scene, camera));
		const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, hgt), 0.9, 0.5, 0.8);
		composer.addPass(bloomPass);
		composer.addPass(new OutputPass());

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.target.set(0, 8, 0);
		controls.minDistance = 25;
		controls.maxDistance = 220;
		controls.maxPolarAngle = Math.PI / 2 - 0.04;
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.5;
		controls.update();

		gRef.current = {
			renderer, scene, camera, composer, bloomPass, controls, water, sky, dirLight, hemi, buildingMat, cars, carData,
			disposables: [waterNormals, pmrem, buildingMat.emissiveMap as THREE.Texture],
		};
		applyTime(true);
		clockRef.current.start();
		setReady(true);
		return true;
	}, [applyTime]);

	const frame = useCallback(() => {
		const g = gRef.current;
		if (!g) return;
		const dt = Math.min(clockRef.current.getDelta(), 0.05);
		g.controls.update();
		(g.water.material as THREE.ShaderMaterial).uniforms['time'].value += dt * 0.6;
		const dummy = new THREE.Object3D();
		g.carData.forEach((c, i) => {
			if (c.axis === 'x') { c.x += c.dir * c.speed * dt; if (c.x > CITY_R) c.x = -CITY_R; if (c.x < -CITY_R) c.x = CITY_R; }
			else { c.z += c.dir * c.speed * dt; if (c.z > CITY_R) c.z = -CITY_R; if (c.z < -CITY_R) c.z = CITY_R; }
			dummy.position.set(c.x, 0.4, c.z);
			dummy.rotation.set(0, c.axis === 'x' ? 0 : Math.PI / 2, 0);
			dummy.updateMatrix();
			g.cars.setMatrixAt(i, dummy.matrix);
		});
		g.cars.instanceMatrix.needsUpdate = true;
		g.composer.render();
		rafRef.current = requestAnimationFrame(frame);
	}, []);

	useEffect(() => {
		if (!initScene()) return;
		rafRef.current = requestAnimationFrame(frame);
		const onResize = () => {
			const g = gRef.current, wrap = wrapRef.current;
			if (!g || !wrap) return;
			const w = wrap.clientWidth, hgt = wrap.clientHeight;
			if (!w || !hgt) return;
			g.camera.aspect = w / hgt;
			g.camera.updateProjectionMatrix();
			g.renderer.setSize(w, hgt, false);
			g.composer.setSize(w, hgt);
		};
		const ro = new ResizeObserver(onResize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		return () => {
			cancelAnimationFrame(rafRef.current);
			ro.disconnect();
			const g = gRef.current;
			if (g) {
				g.controls.dispose();
				g.scene.traverse((o) => {
					if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
						o.geometry.dispose();
						const m = o.material as THREE.Material | THREE.Material[];
						if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose();
					}
				});
				g.water.geometry.dispose();
				(g.water.material as THREE.Material).dispose();
				g.disposables.forEach((d) => d.dispose());
				g.composer.dispose();
				g.renderer.dispose();
				gRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => { applyTime(night); }, [ready, night, applyTime]);
	useEffect(() => {
		const g = gRef.current;
		if (!g) return;
		g.bloomPass.enabled = bloom;
		g.controls.autoRotate = autoRotate;
		g.renderer.toneMappingExposure = exposure;
	}, [ready, bloom, autoRotate, exposure]);

	return (
		<div className="lw-root">
			<style>{CSS}</style>
			<div ref={wrapRef} className="lw-stage">
				<canvas ref={canvasRef} className="lw-canvas" />
				{webglError && <div className="lw-fallback">3D indisponible (WebGL manquant).</div>}
				{!webglError && (
					<div className="lw-panel">
						<label><input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} /> Nuit</label>
						<label><input type="checkbox" checked={bloom} onChange={(e) => setBloom(e.target.checked)} /> Bloom</label>
						<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
						<label className="lw-slider">Exposition
							<input type="range" min={0.4} max={2} step={0.05} value={exposure} onChange={(e) => setExposure(+e.target.value)} />
						</label>
					</div>
				)}
			</div>
			<p className="lw-hint">Île procédurale : ville (fenêtres émissives + voitures), forêt instanciée, montagnes enneigées et mer réfléchissante. Glisse pour explorer.</p>
		</div>
	);
}

const CSS = `
.lw-root { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: center; }
.lw-stage { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.4); background: #05070d; }
.lw-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.lw-fallback { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; }
.lw-panel { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 0.9rem; border-radius: 12px; background: rgba(8,10,18,0.55); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.12); color: #f4f6fb; font-size: 0.85rem; }
.lw-panel label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
.lw-panel .lw-slider { flex-direction: column; align-items: flex-start; gap: 0.15rem; }
.lw-panel input[type="range"] { width: 130px; accent-color: var(--accent-regular, #b07cff); }
.lw-panel input[type="checkbox"] { accent-color: var(--accent-regular, #b07cff); width: 16px; height: 16px; }
.lw-hint { color: var(--gray-400, #8a93a3); font-size: var(--text-sm); text-align: center; margin: 0; max-width: 62ch; }
`;
