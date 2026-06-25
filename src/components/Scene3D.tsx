import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, Clone, AdaptiveDpr, BakeShadows, Html } from '@react-three/drei';
import * as THREE from 'three';

const HDRI = '/hdris/forest_slope_1k.hdr';
const MODELS = {
	boulder: '/models/boulder_01/boulder_01_1k.gltf',
	rockA: '/models/moon_rock_01/moon_rock_01_1k.gltf',
	rockB: '/models/moon_rock_02/moon_rock_02_1k.gltf',
	trunk: '/models/dead_tree_trunk/dead_tree_trunk_1k.gltf',
};
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

interface Placement { p: [number, number, number]; r?: [number, number, number]; s: number; }

/** Load one GLB, enable shadows on its meshes, and drop a few cloned copies around the scene. */
function Scatter({ url, items }: { url: string; items: Placement[] }) {
	const { scene } = useGLTF(url);
	useMemo(() => {
		scene.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) {
				o.castShadow = true;
				o.receiveShadow = true;
			}
		});
	}, [scene]);
	return (
		<>
			{items.map((it, i) => (
				<Clone key={i} object={scene} position={it.p} rotation={it.r ?? [0, 0, 0]} scale={it.s} />
			))}
		</>
	);
}

function Forest({ background }: { background: boolean }) {
	return (
		<>
			{/* HDRI: image-based lighting (the realism) + optional background. */}
			<Environment files={HDRI} background={background} />
			{/* Sun — crisp shadows. */}
			<directionalLight position={[12, 16, 6]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003}>
				<orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20, 1, 60]} />
			</directionalLight>

			{/* Forest floor. */}
			<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<planeGeometry args={[120, 120]} />
				<meshStandardMaterial color="#4a5638" roughness={1} />
			</mesh>

			{/* Scattered CC0 nature scans (Poly Haven). */}
			<Scatter url={MODELS.boulder} items={[
				{ p: [-3, 0, -1], s: 1.6 },
				{ p: [5.5, 0, 3], r: [0, 1.2, 0], s: 1.1 },
			]} />
			<Scatter url={MODELS.rockA} items={[
				{ p: [2.5, 0, -3], r: [0, 0.6, 0], s: 1.3 },
				{ p: [-5, 0, 4], r: [0, 2.1, 0], s: 1.0 },
				{ p: [7, 0, -4], r: [0, 0.3, 0], s: 0.8 },
			]} />
			<Scatter url={MODELS.rockB} items={[
				{ p: [-1.5, 0, 5], r: [0, 1.7, 0], s: 1.1 },
				{ p: [3.5, 0, 6], r: [0, 0.9, 0], s: 0.9 },
			]} />
			<Scatter url={MODELS.trunk} items={[
				{ p: [-6.5, 0, -3], r: [0, 0.5, 0], s: 1 },
			]} />

			<BakeShadows />
		</>
	);
}

function Loader() {
	return <Html center style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: '0.9rem' }}>Chargement de la scène…</Html>;
}

export default function Scene3D() {
	const [background, setBackground] = useState(true);
	const [autoRotate, setAutoRotate] = useState(true);

	return (
		<div className="s3-root">
			<style>{CSS}</style>
			<div className="s3-stage">
				<Canvas
					shadows
					dpr={[1, 2]}
					camera={{ position: [9, 4, 11], fov: 45 }}
					gl={{ antialias: true }}
				>
					<fog attach="fog" args={['#9fb0bf', 18, 70]} />
					<Suspense fallback={<Loader />}>
						<Forest background={background} />
					</Suspense>
					<OrbitControls makeDefault enableDamping autoRotate={autoRotate} autoRotateSpeed={0.5} target={[0, 0.6, 0]} minDistance={4} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.03} />
					<AdaptiveDpr pixelated />
				</Canvas>
				<div className="s3-panel">
					<label><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Fond HDRI</label>
					<label><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotation auto</label>
				</div>
			</div>
			<p className="s3-hint">Forêt éclairée par une HDRI (IBL) + ombres temps réel · rochers et tronc = scans photogrammétriques CC0 Poly Haven. Glisse pour explorer.</p>
		</div>
	);
}

const CSS = `
.s3-root { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: center; }
.s3-stage { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.4); background: #0b0e14; }
.s3-panel { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.7rem 0.9rem; border-radius: 12px; background: rgba(8,10,18,0.55); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.12); color: #f4f6fb; font-size: 0.85rem; }
.s3-panel label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
.s3-panel input[type="checkbox"] { accent-color: var(--accent-regular, #b07cff); width: 16px; height: 16px; }
.s3-hint { color: var(--gray-400, #8a93a3); font-size: var(--text-sm); text-align: center; margin: 0; max-width: 62ch; }
`;
