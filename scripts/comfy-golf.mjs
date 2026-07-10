/*
 * Mini-golf assets via ComfyUI (SDXL Turbo):
 *   - tileable grass texture for the surrounding rough ground → public/assets/jeux/golf/grass.jpg
 * Applied to the big 2000×2000 rough plane (wrap-repeated). The lane/fairway stays
 * vertex-coloured by altitude; the green stays a flat material.
 *
 * Usage: node scripts/comfy-golf.mjs [--preview] [grass]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/golf') : resolve('public/assets/jeux/golf');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['grass'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, text, watermark, perspective, blurry, path, dirt patch, flowers, ball, hole';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/golf/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Rough grass — natural short lawn, top-down, even light so it tiles cleanly.
if (want('grass')) {
	const grass = await gen({
		id: 'grass',
		prompt: 'seamless tileable grass lawn texture, top-down aerial view, short mowed green turf, natural blades, even flat lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	// Slightly deepen/desaturate so it reads as "rough" behind the brighter fairway.
	await sharp(grass).modulate({ saturation: 0.9, brightness: 0.92 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'grass.jpg'));
	console.log('✓ grass.jpg');
}
console.log('done →', OUT);
