import { EffectComposer, N8AO, Bloom, Vignette, SMAA, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';

/** Post-processing chain that "glues" the forest into a realistic look:
 *  ambient occlusion (contact shadows), gentle grade, subtle bloom, vignette, SMAA. */
export default function PostFX() {
	return (
		<EffectComposer enableNormalPass multisampling={0}>
			<N8AO aoRadius={1.4} intensity={2.2} distanceFalloff={1} />
			<BrightnessContrast brightness={0.02} contrast={0.12} />
			<HueSaturation saturation={0.1} hue={0} />
			<Bloom intensity={0.35} luminanceThreshold={0.85} mipmapBlur />
			<Vignette darkness={0.4} offset={0.4} />
			<SMAA />
		</EffectComposer>
	);
}
