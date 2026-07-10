/*
 * Cocottes vs Renards assets via ComfyUI (SDXL Turbo):
 *   - tileable sunny farm grass texture → public/assets/jeux/cocottes-renards/grass.jpg
 * Drawn under the lane field (tiled); lanes become translucent tints so the grass shows
 * through while the row alternation still reads. Hens/foxes stay procedural (colour = type).
 *
 * Usage: node scripts/comfy-cocottes.mjs [--preview] [grass]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/cocottes-renards') : resolve('public/assets/jeux/cocottes-renards');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['grass'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, path, flowers, animal, text, watermark, perspective, blurry';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/cocottes-renards/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Farm grass — bright sunny lawn, top-down, even light so it tiles under the lanes.
if (want('grass')) {
	const grass = await gen({
		id: 'grass',
		prompt: 'seamless tileable sunny farm lawn grass texture, top-down aerial view, bright cheerful green turf, soft short blades, flat even lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	// Keep it a touch soft so translucent lane tints + tufts read on top.
	await sharp(grass).modulate({ saturation: 0.92, brightness: 1.02 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'grass.jpg'));
	console.log('✓ grass.jpg');
}
console.log('done →', OUT);
