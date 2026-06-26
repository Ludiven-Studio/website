import * as THREE from 'three';
import { useMemo } from 'react';

/** Big inward sphere with a vertical colour gradient — the stylized sky (replaces the photoreal HDRI). */
export default function GradientSky({ top = '#9fc6ef', bottom = '#e9f1e4' }: { top?: string; bottom?: string }) {
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				side: THREE.BackSide,
				depthWrite: false,
				fog: false,
				uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
				vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
				fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
					void main(){ float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }`,
			}),
		[top, bottom],
	);
	return (
		<mesh material={mat} frustumCulled={false}>
			<sphereGeometry args={[400, 32, 16]} />
		</mesh>
	);
}
