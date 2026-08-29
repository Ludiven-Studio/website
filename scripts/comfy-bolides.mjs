/*
 * Bolides assets via ComfyUI (SDXL Turbo):
 *   - seamless asphalt grain tile for the arena floor → public/assets/jeux/bolides/grain.jpg
 * The floor is a CanvasTexture whose colour IS the score, so the grain ships as a separate
 * multiply layer: greyscale, mirror-tiled (a fine grain hides the symmetry at 4 world units
 * per tile), and squeezed into a narrow band under white so it modulates value, never hue.
 *
 * Usage: node scripts/comfy-bolides.mjs [--preview] [--variant a|b|c] [--floor N]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/bolides') : resolve('public/assets/jeux/bolides');
const TMP = resolve('D:/tmp/comfy/bolides');
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

const arg = (name, def) => {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
// The tile ships at full range; strength is a shader uniform so it can be swept without a re-bake.
const WANT = arg('--variant', 'all');

const TILE_NEG = 'seams, border, frame, vignette, lighting gradient, strong shadows, road markings, white lines, paint stripes, manhole, object, car, text, watermark, perspective, blurry, colorful, bright';

const VARIANTS = {
	a: 'seamless tileable asphalt road surface texture, top-down orthographic, fine gravel aggregate speckle, dense uniform grain, matte, flat even lighting, macro detail, no seams',
	b: 'seamless tileable worn concrete slab texture, top-down orthographic, micro cracks and pitting, fine porous grain, matte, flat even lighting, macro detail, no seams',
	c: 'seamless tileable scuffed tarmac texture, top-down orthographic, brushed sweeping scratches, fine sand grain, matte, flat even lighting, macro detail, no seams',
};

async function gen(id, prompt) {
	const pid = await submit({ id, prompt, negative: TILE_NEG, w: 512, h: 512, steps: 8 });
	const imgs = await waitForImages(pid);
	const tmp = resolve(TMP, `_${id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

/** 4-way mirror: guarantees a seamless wrap. Only usable because the grain is isotropic noise. */
async function mirrorTile(buf, size = 512) {
	const half = size / 2;
	const q = await sharp(buf).resize(half, half, { fit: 'fill' }).greyscale().toBuffer();
	return sharp({ create: { width: size, height: size, channels: 3, background: '#000' } })
		.composite([
			{ input: q, left: 0, top: 0 },
			{ input: await sharp(q).flop().toBuffer(), left: half, top: 0 },
			{ input: await sharp(q).flip().toBuffer(), left: 0, top: half },
			{ input: await sharp(q).flip().flop().toBuffer(), left: half, top: half },
		])
		.png()
		.toBuffer();
}

for (const [key, prompt] of Object.entries(VARIANTS)) {
	if (WANT !== 'all' && WANT !== key) continue;
	const raw = await gen(`grain-${key}`, prompt);
	const tiled = await mirrorTile(raw);
	// Two passes: sharp runs normalise AFTER linear whatever the call order, so chaining them
	// restretches the band back to 0-255 and the squeeze silently does nothing.
	const flat = await sharp(tiled).normalise().toBuffer();
	// PNG, not JPEG: DCT ringing on a high-frequency noise tile leaks across the wrap edge and
	// puts back the seam the mirror was there to remove. 256 px over ~4 world units is ample.
	const name = WANT === 'all' ? `grain-${key}.png` : 'grain.png';
	await sharp(flat).resize(256, 256).toColourspace('b-w').png({ compressionLevel: 9 })
		.toFile(resolve(OUT, name));
	const st = await sharp(flat).stats();
	console.log(`✓ ${name}  mean ${st.channels[0].mean.toFixed(1)} sd ${st.channels[0].stdev.toFixed(1)}`);
}
console.log('done →', OUT);
