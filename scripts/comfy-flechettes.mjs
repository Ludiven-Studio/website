/*
 * Fléchettes assets via ComfyUI (SDXL Turbo):
 *   - warm wood pub wall behind the board → public/assets/jeux/flechettes/wall.jpg
 * Set as the .da-playwrap background so the circular board reads as "hung on a wall".
 * The board itself stays procedural (scoring geometry).
 *
 * Usage: node scripts/comfy-flechettes.mjs [--preview] [wall]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/flechettes') : resolve('public/assets/jeux/flechettes');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['wall'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/flechettes/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Wood wall — warm pub timber, dark enough that the bright board pops in front.
if (want('wall')) {
	const wall = await gen({
		id: 'wall',
		prompt: 'warm dark wooden plank wall, vertical timber boards, cozy pub interior wall, rich brown wood grain, even soft lighting, high detail',
		negative: 'dartboard, board, circle, target, object, poster, window, door, text, watermark, bright, white, perspective, blurry',
		w: 1024,
		h: 768,
		steps: 7,
	});
	// Deepen so the board reads clearly in front.
	await sharp(wall).modulate({ saturation: 1.0, brightness: 0.82 }).jpeg({ quality: 84 }).toFile(resolve(OUT, 'wall.jpg'));
	console.log('✓ wall.jpg');
}
console.log('done →', OUT);
