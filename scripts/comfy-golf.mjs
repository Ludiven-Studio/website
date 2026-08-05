/*
 * Mini-golf assets via ComfyUI (SDXL Turbo) → public/assets/jeux/golf/
 *   - grass.jpg  rough ground around the course
 *   - turf.jpg   fairway and green
 *   - stone.jpg  kerbs, bridge, obstacle socles
 *   - paving.jpg the paved band around the lane
 * The three course textures multiply a coloured material, so they are flattened toward
 * white: they add grain, the material keeps the palette. A saturated tile would fight it.
 *
 * Usage: node scripts/comfy-golf.mjs [--preview] [--regen] [grass|turf|stone|paving ...]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/golf') : resolve('public/assets/jeux/golf');
await mkdir(OUT, { recursive: true });
const NAMES = ['grass', 'turf', 'stone', 'paving'];
const ONLY = process.argv.filter((a) => NAMES.includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, text, watermark, perspective, blurry, path, dirt patch, flowers, ball, hole';

// Keep the raw render: ComfyUI serves nothing back for a prompt it has already run, so a
// second pass on the same prompt would come back empty. `--regen` forces a new one.
async function gen(job) {
	const tmp = resolve(`D:/tmp/comfy/golf/_${job.id}.png`);
	if (!process.argv.includes('--regen')) {
		const cached = await readFile(tmp).catch(() => null);
		if (cached) return cached;
	}
	const id = await submit(job);
	const imgs = await waitForImages(id);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

/** Flatten a tile into a light grain map: `lo` is how dark its darkest pixel may get. */
const flatten = (buf, lo, sat) => sharp(buf)
	.modulate({ saturation: sat })
	.linear((255 - lo) / 255, lo)
	.jpeg({ quality: 88 });

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
	await sharp(grass).modulate({ saturation: 0.9, brightness: 0.92 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'grass.jpg'));
	console.log('✓ grass.jpg');
}

// Fairway and green — finer than the rough, and almost colourless so the altitude tint shows.
if (want('turf')) {
	const turf = await gen({
		id: 'turf',
		prompt: 'seamless tileable golf green turf texture, top-down orthographic, very short mowed grass, fine even blades, uniform flat lighting, subtle detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 8,
	});
	await flatten(turf, 196, 0.3).toFile(resolve(OUT, 'turf.jpg'));
	console.log('✓ turf.jpg');
}

// Kerbs and socles — smooth cast stone, only pores and grain.
if (want('stone')) {
	const stone = await gen({
		id: 'stone',
		prompt: 'seamless tileable smooth cast concrete texture, top-down orthographic, fine sand aggregate, tiny pores, uniform flat lighting, no cracks, no seams',
		negative: `${TILE_NEG}, moss, rust, paint, tiles, bricks`,
		w: 512,
		h: 512,
		steps: 8,
	});
	await flatten(stone, 196, 0.25).toFile(resolve(OUT, 'stone.jpg'));
	console.log('✓ stone.jpg');
}

// The paved band — flagstones, so the joints have to survive the flattening.
if (want('paving')) {
	const paving = await gen({
		id: 'paving',
		prompt: 'seamless tileable stone paving texture, top-down orthographic, small irregular flagstones, tight mortar joints, uniform flat lighting, no seams',
		negative: `${TILE_NEG}, moss, grass, weeds`,
		w: 512,
		h: 512,
		steps: 8,
	});
	await flatten(paving, 170, 0.3).toFile(resolve(OUT, 'paving.jpg'));
	console.log('✓ paving.jpg');
}
console.log('done →', OUT);
