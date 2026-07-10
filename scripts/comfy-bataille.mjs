/*
 * Bataille assets via ComfyUI (SDXL Turbo):
 *   - stylized top-down sea water texture → public/assets/jeux/bataille/water.jpg
 * Set behind the CSS grid; unrevealed cells become translucent so the sea shows through.
 * Hit/miss markers stay on top.
 *
 * Usage: node scripts/comfy-bataille.mjs [--preview] [water]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/bataille') : resolve('public/assets/jeux/bataille');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['water'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/bataille/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Sea — stylized top-down ocean, calm ripples, even light so cells read on top.
if (want('water')) {
	const water = await gen({
		id: 'water',
		prompt: 'seamless tileable top-down ocean water texture, deep blue sea, gentle small ripples, calm stylized flat cartoon water, even soft lighting, subtle highlights, no seams',
		negative: 'ship, boat, land, island, coast, horizon, foam edge, object, grid, text, watermark, perspective, strong shadows, vignette, blurry',
		w: 768,
		h: 768,
		steps: 7,
	});
	await sharp(water).modulate({ saturation: 1.0, brightness: 0.9 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'water.jpg'));
	console.log('✓ water.jpg');
}
console.log('done →', OUT);
