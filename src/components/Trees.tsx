import { useMemo } from 'react';
import { useGLTF, Detailed, Clone } from '@react-three/drei';
import { heightAt, mulberry32 } from './terrainNoise';

// CC0 Poly Haven "island_tree_02", decimated to 2 LODs (gltf-transform) + WebP textures.
const LOD0 = '/models/trees/island_lod0.glb';
const LOD1 = '/models/trees/island_lod1.glb';
useGLTF.preload(LOD0);
useGLTF.preload(LOD1);

interface TreeProps { position: [number, number, number]; rotation: [number, number, number]; scale: number; }

function Tree(props: TreeProps) {
	const lod0 = useGLTF(LOD0).scene;
	const lod1 = useGLTF(LOD1).scene;
	return (
		<group {...props}>
			{/* near → full 212k-tri tree; far → 62k-tri LOD (fog hides the swap) */}
			<Detailed distances={[0, 38]}>
				<Clone object={lod0} castShadow />
				<Clone object={lod1} castShadow />
			</Detailed>
		</group>
	);
}

export default function Trees({ seed, count = 42, area = 170 }: { seed: number; count?: number; area?: number }) {
	const items = useMemo(() => {
		const rng = mulberry32(seed ^ 0x7ee5);
		const arr: TreeProps[] = [];
		for (let t = 0; t < count * 3 && arr.length < count; t++) {
			const r = Math.sqrt(rng()) * (area / 2), a = rng() * 6.283;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			if (Math.hypot(x, z) < 7) continue; // keep a clearing around the camera target
			arr.push({ position: [x, heightAt(x, z, seed), z], rotation: [0, rng() * 6.283, 0], scale: 0.8 + rng() * 0.7 });
		}
		return arr;
	}, [seed, count, area]);
	return <>{items.map((p, i) => <Tree key={i} {...p} />)}</>;
}
