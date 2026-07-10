/*
 * Drift assets via ComfyUI (SDXL Turbo):
 *   - tileable roadside grass texture for the ground plane → public/assets/jeux/drift/grass.jpg
 * Applied to the 1200×1200 ground (wrap-repeated). The road ribbon has no UVs, so the
 * asphalt stays a flat material; curbs/walls/decor stay procedural.
 *
 * Usage: node scripts/comfy-drift.mjs [--preview] [grass]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/drift') : resolve('public/assets/jeux/drift');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['grass'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, road, track, path, text, watermark, perspective, blurry, flowers';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/drift/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Roadside grass — bright mowed lawn, top-down, even light so it tiles cleanly.
if (want('grass')) {
	const grass = await gen({
		id: 'grass',
		prompt: 'seamless tileable mowed lawn grass texture, top-down aerial view, bright fresh green turf, short even blades, flat lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(grass).modulate({ saturation: 0.95, brightness: 1.0 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'grass.jpg'));
	console.log('✓ grass.jpg');
}
console.log('done →', OUT);
