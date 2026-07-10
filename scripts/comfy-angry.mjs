/*
 * Angry Cocotte assets via ComfyUI (SDXL Turbo):
 *   - daytime cartoon sky background (opaque, wide) → public/assets/jeux/angry/sky.jpg
 *   - tileable wooden plank crate texture          → public/assets/jeux/angry/wood.jpg
 *   - tileable brick wall crate texture            → public/assets/jeux/angry/brick.jpg
 * Crates are axis-aligned (no rotation) so a tiled texture maps cleanly. Cardboard/TNT
 * stay procedural (TNT keeps its label); foxes stay procedural (colour encodes HP).
 *
 * Usage: node scripts/comfy-angry.mjs [--preview] [sky|wood|brick]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/angry') : resolve('public/assets/jeux/angry');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['sky', 'wood', 'brick'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, text, watermark, perspective, blurry';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/angry/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// 1) Sky — soft daytime cartoon sky with a few puffy clouds, light enough to keep the
//    dark bodies readable (the game draws structures + foxes on top).
if (want('sky')) {
	const sky = await gen({
		id: 'sky',
		prompt: 'soft daytime cartoon sky, gentle blue gradient, a few small puffy white clouds high up, calm cheerful, flat vector game art, soft gradients, no text, no words',
		negative: 'ground, hills, horizon line, trees, buildings, characters, birds, sun, dark, night, busy, cluttered, text, watermark, saturated, neon',
		w: 1024,
		h: 512,
		steps: 6,
	});
	await sharp(sky).modulate({ saturation: 0.85, brightness: 1.05 }).jpeg({ quality: 84 }).toFile(resolve(OUT, 'sky.jpg'));
	console.log('✓ sky.jpg');
}

// 2) Wood — seamless plank texture for wooden crates.
if (want('wood')) {
	const wood = await gen({
		id: 'wood',
		prompt: 'seamless tileable wooden planks texture, warm light brown timber, subtle wood grain, horizontal boards, even flat top-down lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(wood).jpeg({ quality: 86 }).toFile(resolve(OUT, 'wood.jpg'));
	console.log('✓ wood.jpg');
}

// 3) Brick — seamless brick wall texture for brick crates.
if (want('brick')) {
	const brick = await gen({
		id: 'brick',
		prompt: 'seamless tileable brick wall texture, warm terracotta red bricks, light grey mortar, regular running bond, even flat lighting, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(brick).jpeg({ quality: 86 }).toFile(resolve(OUT, 'brick.jpg'));
	console.log('✓ brick.jpg');
}
console.log('done →', OUT);
