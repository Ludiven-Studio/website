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

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	composer: EffectComposer;
	bloomPass: UnrealBloomPass;
	controls: OrbitControls;
	water: Water;
	dirLight: THREE.DirectionalLight;
	subjects: THREE.Group;
	disposables: { dispose: () => void }[];
}

/** Tiling, asset-free water normal map (height field → finite-difference normals). */
function makeWaterNormals(size = 256): THREE.Texture {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const TAU = Math.PI * 2;
	const h = (x: number, y: number) => {
		const u = x / size, v = y / size;
		return (
			Math.sin(u * TAU * 3 + v * TAU) * 0.5 +
			Math.sin(u * TAU * 5 - v * TAU * 4) * 0.3 +
			Math.sin(u * TAU * 9 + v * TAU * 7) * 0.2
		);
	};
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = h(x + 1, y) - h(x - 1, y);
			const dy = h(x, y + 1) - h(x, y - 1);
			const nx = -dx, ny = -dy, nz = 1;
			const inv = 1 / Math.hypot(nx, ny, nz);
			const i = (y * size + x) * 4;
			img.data[i] = (nx * inv * 0.5 + 0.5) * 255;
			img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
			img.data[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
			img.data[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	return tex;
}

export default function LaboDemo() {
	const [webglError, setWebglError] = useState(false);
	const [ready, setReady] = useState(false);
	const [bloom, setBloom] = useState(true);
	const [bloomStrength, setBloomStrength] = useState(0.7);
	const [water, setWater] = useState(true);
	const [shadows, setShadows] = useState(true);
	const [autoRotate, setAutoRotate] = useState(true);
	const [exposure, setExposure] = useState(1);

	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const rafRef = useRef(0);
	const clockRef = useRef(new THREE.Clock());

	const initScene = useCallback((): boolean => {
		if (!canvasRef.current || !wrapRef.current) return false;
		const wrap = wrapRef.current;
		const w = wrap.clientWidth || 800;
		const hgt = wrap.clientHeight || 450;

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
		renderer.toneMappingExposure = 1;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(55, w / hgt, 0.1, 10000);
		camera.position.set(13, 8, 18);

		// Sun direction (low sun → dramatic speculars + bloom on the water).
		const sun = new THREE.Vector3();
		const phi = THREE.MathUtils.degToRad(90 - 5); // elevation 5°
		const theta = THREE.MathUtils.degToRad(150);
		sun.setFromSphericalCoords(1, phi, theta);

		// Sky.
		const sky = new Sky();
		sky.scale.setScalar(4500);
		const su = sky.material.uniforms;
		su['turbidity'].value = 8;
		su['rayleigh'].value = 2.2;
		su['mieCoefficient'].value = 0.005;
		su['mieDirectionalG'].value = 0.8;
		su['sunPosition'].value.copy(sun);
		scene.add(sky);

		// Image-based reflections (asset-free studio environment).
		const pmrem = new THREE.PMREMGenerator(renderer);
		const roomEnv = new RoomEnvironment();
		scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
		roomEnv.traverse((o) => {
			if (o instanceof THREE.Mesh) {
				o.geometry.dispose();
				(o.material as THREE.Material).dispose();
			}
		});

		// Water.
		const waterNormals = makeWaterNormals(256);
		const water = new Water(new THREE.PlaneGeometry(2000, 2000), {
			textureWidth: 512,
			textureHeight: 512,
			waterNormals,
			sunDirection: sun.clone().normalize(),
			sunColor: 0xffffff,
			waterColor: 0x103a4a,
			distortionScale: 3.4,
			fog: false,
		});
		water.rotation.x = -Math.PI / 2;
		scene.add(water);

		// Lights: directional "sun" (shadows) + soft fill.
		const dirLight = new THREE.DirectionalLight(0xfff2e0, 2.4);
		dirLight.position.copy(sun).multiplyScalar(60);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.set(2048, 2048);
		dirLight.shadow.camera.near = 1;
		dirLight.shadow.camera.far = 160;
		const sc = dirLight.shadow.camera as THREE.OrthographicCamera;
		sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18;
		dirLight.shadow.bias = -0.0003;
		scene.add(dirLight);
		scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x202830, 0.35));

		// Podium (island) — receives shadows.
		const podium = new THREE.Mesh(
			new THREE.CylinderGeometry(5, 5.6, 1.4, 64),
			new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.85, metalness: 0.1 }),
		);
		podium.position.y = 0.2;
		podium.receiveShadow = true;
		podium.castShadow = true;
		scene.add(podium);

		// Glossy PBR subjects — cast shadows, reflect the environment.
		const subjects = new THREE.Group();
		const knot = new THREE.Mesh(
			new THREE.TorusKnotGeometry(1.5, 0.5, 220, 32),
			new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
		);
		knot.position.set(0, 3.6, 0);
		knot.castShadow = true;
		subjects.add(knot);

		const palette = [0xff5a5f, 0x4da3ff, 0xffd166, 0x30d158];
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2;
			const sphere = new THREE.Mesh(
				new THREE.SphereGeometry(0.9, 48, 48),
				new THREE.MeshPhysicalMaterial({ color: palette[i], metalness: 0.9, roughness: 0.05 + i * 0.12, clearcoat: 1 }),
			);
			sphere.position.set(Math.cos(a) * 3.3, 1.7, Math.sin(a) * 3.3);
			sphere.castShadow = true;
			subjects.add(sphere);
		}

		// Emissive core — the bloom showpiece.
		const core = new THREE.Mesh(
			new THREE.IcosahedronGeometry(0.7, 2),
			new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a18, emissiveIntensity: 3 }),
		);
		core.position.set(0, 6.4, 0);
		subjects.add(core);
		scene.add(subjects);

		// Postprocessing: render → bloom → output (tone mapping + colour space).
		const composer = new EffectComposer(renderer);
		composer.setSize(w, hgt);
		composer.addPass(new RenderPass(scene, camera));
		const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, hgt), 0.7, 0.4, 0.85);
		composer.addPass(bloomPass);
		composer.addPass(new OutputPass());

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.target.set(0, 3, 0);
		controls.minDistance = 8;
		controls.maxDistance = 45;
		controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the water
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.6;
		controls.update();

		g3Ref.current = {
			renderer,
			scene,
			camera,
			composer,
			bloomPass,
			controls,
			water,
			dirLight,
			subjects,
			disposables: [waterNormals, pmrem],
		};
		clockRef.current.start();
		setReady(true);
		return true;
	}, []);

	const frame = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		const dt = Math.min(clockRef.current.getDelta(), 0.05);
		g.controls.update();
		(g.water.material as THREE.ShaderMaterial).uniforms['time'].value += dt;
		g.subjects.rotation.y += dt * 0.25;
		g.subjects.children.forEach((o, i) => {
			o.rotation.x += dt * (0.3 + i * 0.05);
			o.rotation.z += dt * 0.2;
		});
		g.composer.render();
		rafRef.current = requestAnimationFrame(frame);
	}, []);

	useEffect(() => {
		if (!initScene()) return;
		rafRef.current = requestAnimationFrame(frame);
		const onResize = () => {
			const g = g3Ref.current, wrap = wrapRef.current;
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
			const g = g3Ref.current;
			if (g) {
				g.controls.dispose();
				g.scene.traverse((o) => {
					if (o instanceof THREE.Mesh) {
						o.geometry.dispose();
						const m = o.material as THREE.Material | THREE.Material[];
						if (Array.isArray(m)) m.forEach((x) => x.dispose());
						else m.dispose();
					}
				});
				g.water.geometry.dispose();
				(g.water.material as THREE.Material).dispose();
				g.disposables.forEach((d) => d.dispose());
				g.composer.dispose();
				g.renderer.dispose();
				g3Ref.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Apply the settings panel to the live scene.
	useEffect(() => {
		const g = g3Ref.current;
		if (!g) return;
		g.bloomPass.enabled = bloom;
		g.bloomPass.strength = bloomStrength;
		g.water.visible = water;
		g.dirLight.castShadow = shadows;
		g.renderer.shadowMap.needsUpdate = true;
		g.controls.autoRotate = autoRotate;
		g.renderer.toneMappingExposure = exposure;
	}, [ready, bloom, bloomStrength, water, shadows, autoRotate, exposure]);

	return (
		<div className="labo-root">
			<style>{CSS}</style>
			<div ref={wrapRef} className="labo-stage">
				<canvas ref={canvasRef} className="labo-canvas" />
				{webglError && <div className="labo-fallback">3D indisponible (WebGL manquant).</div>}
				{!webglError && (
					<div className="labo-panel">
						<label><input type="checkbox" checked={bloom} onChange={(e) => setBloom(e.target.checked)} /> Bloom</label>
						{bloom && (
							<label className="labo-slider">Force
								<input type="range" min={0} max={2} step={0.05} value={bloomStrength} onChange={(e) => setBloomStrength(+e.target.value)} />
							</label>
						)}
						<label><input type="checkbox" checked={water} onChange={(e) => setWater(e.target.checked)} /> Eau</label>
						<label><input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} /> Ombres</label>
						<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
						<label className="labo-slider">Exposition
							<input type="range" min={0.4} max={2} step={0.05} value={exposure} onChange={(e) => setExposure(+e.target.value)} />
						</label>
					</div>
				)}
			</div>
			<p className="labo-hint">Glisse pour tourner · molette pour zoomer · ACES tone mapping + bloom, eau réfléchissante, PBR &amp; ombres temps réel.</p>
		</div>
	);
}

const CSS = `
.labo-root { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: center; }
.labo-stage { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.4); background: #0b0e14; }
.labo-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.labo-fallback { position: absolute; inset: 0; display: grid; place-items: center; color: var(--gray-100, #fff); }
.labo-panel { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 0.9rem; border-radius: 12px; background: rgba(8,10,18,0.55); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.12); color: #f4f6fb; font-size: 0.85rem; }
.labo-panel label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
.labo-panel .labo-slider { flex-direction: column; align-items: flex-start; gap: 0.15rem; }
.labo-panel input[type="range"] { width: 130px; accent-color: var(--accent-regular, #b07cff); }
.labo-panel input[type="checkbox"] { accent-color: var(--accent-regular, #b07cff); width: 16px; height: 16px; }
.labo-hint { color: var(--gray-400, #8a93a3); font-size: var(--text-sm); text-align: center; margin: 0; max-width: 60ch; }
`;
