import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast, SMAA } from '@react-three/postprocessing';

/** Light, stylized post-processing — subtle bloom + grade + vignette + SMAA (no heavy photoreal AO). */
export default function PostFX() {
	return (
		<EffectComposer multisampling={0}>
			<Bloom intensity={0.25} luminanceThreshold={0.9} mipmapBlur />
			<HueSaturation saturation={0.1} hue={0} />
			<BrightnessContrast brightness={0.02} contrast={0.08} />
			<Vignette darkness={0.4} offset={0.4} />
			<SMAA />
		</EffectComposer>
	);
}
