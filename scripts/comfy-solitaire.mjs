/*
 * Solitaire (peg solitaire) assets via ComfyUI (SDXL Turbo):
 *   - tileable polished wood board texture → public/assets/jeux/solitaire/wood.jpg
 * Filled into the board panel (tiled pattern); marbles + holes stay procedural on top.
 *
 * Usage: node scripts/comfy-solitaire.mjs [--preview] [wood]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/solitaire') : resolve('public/assets/jeux/solitaire');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['wood'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, hole, marble, ball, text, watermark, perspective, blurry';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/solitaire/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Polished wood board — warm rich hardwood, smooth varnish, even light so it tiles.
if (want('wood')) {
	const wood = await gen({
		id: 'wood',
		prompt: 'seamless tileable polished wood board texture, warm rich brown hardwood, smooth varnished grain, gentle sheen, even flat lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(wood).modulate({ saturation: 0.98, brightness: 0.9 }).jpeg({ quality: 88 }).toFile(resolve(OUT, 'wood.jpg'));
	console.log('✓ wood.jpg');
}
console.log('done →', OUT);
