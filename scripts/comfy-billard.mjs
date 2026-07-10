/*
 * Billard assets via ComfyUI (SDXL Turbo):
 *   - tileable green pool-table felt texture → public/assets/jeux/billard/felt.jpg
 * Applied to the table surface (wrap-repeated); cushions, pockets and balls stay
 * procedural on top.
 *
 * Usage: node scripts/comfy-billard.mjs [--preview] [felt]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/billard') : resolve('public/assets/jeux/billard');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['felt'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, ball, hole, pocket, cue, wood, chalk, lines, text, watermark, perspective, blurry';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/billard/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Green felt — fine woven cloth, top-down, even light so it tiles cleanly.
if (want('felt')) {
	const felt = await gen({
		id: 'felt',
		prompt: 'seamless tileable billiard pool table felt cloth texture, rich green woven fabric, fine even nap, flat top-down lighting, subtle fibers, high detail, no seams',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	// Nudge toward the game's felt green (#0f7a52), keep it calm.
	await sharp(felt).modulate({ saturation: 0.92, brightness: 0.96, hue: -6 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'felt.jpg'));
	console.log('✓ felt.jpg');
}
console.log('done →', OUT);
