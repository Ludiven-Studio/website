/*
 * Snake pilot assets via ComfyUI (SDXL Turbo):
 *   - background (opaque, square)  → public/assets/jeux/snake/bg.jpg
 *   - apple sprite (transparent)   → public/assets/jeux/snake/apple.png
 * The apple is generated on a chroma-key green background, then keyed to alpha
 * with sharp (no RMBG model needed).
 *
 * Usage: node scripts/comfy-snake.mjs [--preview]   (--preview → D:/tmp, no repo write)
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/snake') : resolve('public/assets/jeux/snake');
await mkdir(OUT, { recursive: true });
// Optional per-asset filter: `node comfy-snake.mjs apple` regenerates only the apple.
const ONLY = process.argv.filter((a) => ['bg', 'apple', 'rock'].includes(a));
const want = (name) => ONLY.length === 0 || ONLY.includes(name);
const STYLE = 'flat vector game art, bold clean shapes, vibrant playful colors, soft gradients, no text, no words';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/snake/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// 1) Background — flat, soft pastel lawn (the code draws the checker grid on top).
if (want('bg')) {
	const bgPng = await gen({
		id: 'bg',
		prompt: `top-down soft pastel green lawn, mostly smooth even color, a few small discreet sparse grass tufts scattered here and there, gentle subtle texture, minimal calm, ${STYLE}`,
		negative: 'dense grass, tall grass, grass blades everywhere, busy, cluttered, stripes, lines, bushes, shrubs, flowers, plants, trees, hedges, rocks, stones, path, road, characters, animals, text, watermark, vignette, dark corners, saturated, neon, vivid',
		w: 768,
		h: 768,
		steps: 6,
	});
	// Push toward pastel: lower saturation, lift brightness a touch.
	await sharp(bgPng).modulate({ saturation: 0.55, brightness: 1.06 }).jpeg({ quality: 84 }).toFile(resolve(OUT, 'bg.jpg'));
	console.log('✓ bg.jpg');
}

// 1b) Snake head sprite (opt-in via --head). NOTE: SDXL forces green snakes and a
//     green subject can't be keyed off a green screen — kept experimental, off by default.
if (process.argv.includes('--head')) {
const headPng = await gen({
	id: 'head',
	prompt: `a cute cartoon purple snake head facing right, big friendly round eyes, smooth rounded, on a solid pure chroma key green screen background, ${STYLE}, no shadow`,
	negative: 'green snake, body, coils, text, watermark, dark background, gradient background',
	w: 512,
	h: 512,
	steps: 7,
});
{
	const { data, info } = await sharp(headPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (g > 90 && g > r * 1.35 && g > b * 1.35) data[i + 3] = 0;
	}
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().blur(0.4).png().toFile(resolve(OUT, 'head.png'));
	console.log('✓ head.png');
}
}

// Chroma-key helper: drop pixels where green dominates, trim + soften, save PNG.
async function keyGreen(png, outName) {
	const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (g > 80 && g > r * 1.25 && g > b * 1.25) {
			data[i + 3] = 0; // green screen → transparent
		} else if (g > (r + b) / 2 + 12) {
			data[i + 1] = Math.round((r + b) / 2); // despill: kill the green fringe on kept pixels
		}
	}
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().blur(0.4).png().toFile(resolve(OUT, outName));
	console.log('✓', outName);
}

// 2) Apple sprite — flat cartoon, thick outline, on chroma-key green.
if (want('apple')) await keyGreen(
	await gen({
		id: 'apple',
		prompt: `one single plain red apple, no leaf, isolated centered object, flat matte colors, thick dark outline, simple bold cartoon icon, full frame bright green background, pure #00ff00 green screen filling the whole background, ${STYLE}, no shadow, no gloss, no face`,
		negative: 'white background, leaves, leaf wreath, multiple leaves, foliage, branch, autumn, decoration, frame, border, face, eyes, smile, mouth, kawaii, green apple, multiple apples, realistic, glossy, photo, text, watermark, dark background, gradient background',
		w: 512,
		h: 512,
		steps: 7,
	}),
	'apple.png',
);

// 3) Rock sprite — cartoon grey boulder, thick outline, on chroma-key green.
if (want('rock')) await keyGreen(
	await gen({
		id: 'rock',
		prompt: `a single cute cartoon grey boulder rock, smooth rounded, flat matte shading, thick dark outline, bold cartoon style, centered, on a solid pure chroma key green screen background, ${STYLE}, no shadow`,
		negative: 'green rock, moss, grass, multiple rocks, realistic, photo, text, watermark, dark background, gradient background',
		w: 512,
		h: 512,
		steps: 7,
	}),
	'rock.png',
);
console.log('done →', OUT);
