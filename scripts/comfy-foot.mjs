/*
 * Foot (1v1 side-view) assets via ComfyUI (SDXL Turbo):
 *   - stadium sky background (opaque, wide) → public/assets/jeux/foot/sky.jpg
 *   - mowed pitch grass strip (opaque)      → public/assets/jeux/foot/grass.jpg
 * Players, ball and goals stay procedural on top.
 *
 * Usage: node scripts/comfy-foot.mjs [--preview] [sky|grass]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/foot') : resolve('public/assets/jeux/foot');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['sky', 'grass'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/foot/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// 1) Sky — bright cheerful stadium sky, light enough to keep players readable.
if (want('sky')) {
	const sky = await gen({
		id: 'sky',
		prompt: 'soft daytime cartoon sky over a stadium, gentle blue gradient, a few small puffy clouds, sunny cheerful, flat vector game art, soft gradients, no text, no words',
		negative: 'ground, pitch, grass, players, ball, crowd faces, dark, night, busy, cluttered, text, watermark, saturated, neon',
		w: 1024,
		h: 512,
		steps: 6,
	});
	await sharp(sky).modulate({ saturation: 0.85, brightness: 1.05 }).jpeg({ quality: 84 }).toFile(resolve(OUT, 'sky.jpg'));
	console.log('✓ sky.jpg');
}

// 2) Pitch grass — mowed football turf with faint horizontal stripes (stretches across
//    the wide ground strip cleanly since the stripes run horizontally).
if (want('grass')) {
	const grass = await gen({
		id: 'grass',
		prompt: 'mowed football pitch grass, top-down, lush green turf with faint horizontal mowing stripes, even flat lighting, high detail',
		negative: 'lines, markings, ball, players, shadow, vignette, border, text, watermark, perspective, vertical stripes, blurry',
		w: 1024,
		h: 512,
		steps: 7,
	});
	await sharp(grass).modulate({ saturation: 0.95, brightness: 0.98 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'grass.jpg'));
	console.log('✓ grass.jpg');
}
console.log('done →', OUT);
