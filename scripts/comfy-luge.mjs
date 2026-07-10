/*
 * Luge assets via ComfyUI (SDXL Turbo):
 *   - tileable snow texture for the piste/berms/terrain → public/assets/jeux/luge/snow.jpg
 *   - tileable blue glacier ice for tunnels/fork walls  → public/assets/jeux/luge/ice.jpg
 *   - tileable granite rock for boulders/separators     → public/assets/jeux/luge/rock.jpg
 * The game keeps procedural canvas fallbacks if these 404.
 *
 * Usage: node scripts/comfy-luge.mjs [--preview] [snow|ice|rock]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/luge') : resolve('public/assets/jeux/luge');
await mkdir(OUT, { recursive: true });
await mkdir(resolve('D:/tmp/comfy/luge'), { recursive: true });
const ONLY = process.argv.filter((a) => ['snow', 'ice', 'rock'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const TILE_NEG = 'seams, border, frame, vignette, strong shadows, lighting gradient, object, footprints, people, trees, text, watermark, perspective, blurry';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/luge/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

if (want('snow')) {
	const snow = await gen({
		id: 'snow',
		prompt: 'seamless tileable fresh alpine snow texture, top-down view, fine sparkling powder snow surface with subtle sled grooves, soft even daylight, white with faint blue shadows, high detail',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(snow).modulate({ saturation: 0.9, brightness: 1.06 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'snow.jpg'));
	console.log('✓ snow.jpg');
}

if (want('ice')) {
	const ice = await gen({
		id: 'ice',
		prompt: 'seamless tileable blue glacier ice texture, translucent frozen wall with white cracks and air bubbles, cold blue tones, even light, high detail',
		negative: TILE_NEG,
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(ice).modulate({ saturation: 1.05 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'ice.jpg'));
	console.log('✓ ice.jpg');
}

if (want('rock')) {
	const rock = await gen({
		id: 'rock',
		prompt: 'seamless tileable weathered basalt cliff rock texture, macro photograph of one continuous rough dark grey stone surface, natural erosion ridges, matte, flat even light',
		negative: TILE_NEG + ', bricks, cobblestone, stone wall, pavement, tiles, mosaic, pebbles, individual stones, terrazzo, colorful',
		w: 512,
		h: 512,
		steps: 7,
	});
	await sharp(rock).jpeg({ quality: 86 }).toFile(resolve(OUT, 'rock.jpg'));
	console.log('✓ rock.jpg');
}
console.log('done →', OUT);
