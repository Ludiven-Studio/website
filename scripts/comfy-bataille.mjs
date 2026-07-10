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
const ONLY = process.argv.filter((a) => ['water', 'ship'].includes(a));
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

// Warship sprite — top-down, keyed off green. Saved horizontal (ship.png) + rotated 90°
// (ship_v.png) so the board can slice it across a ship's cells without CSS rotation.
if (want('ship')) {
	const png = await gen({
		id: 'ship',
		prompt: 'top-down aerial view of a cartoon naval warship, grey steel battleship hull seen from directly above, pointed bow at the right, flat deck with small turrets and a bridge, long and narrow, centered horizontally, full frame solid pure #00ff00 green screen background, flat vector game art, bold clean shapes, no shadow',
		negative: 'side view, perspective, water, sea, waves, wake, ocean, multiple ships, text, watermark, realistic, photo, white background, dark background, gradient background',
		w: 1024,
		h: 512,
		steps: 7,
	});
	// Chroma-key the green screen to alpha, despill, trim to the hull.
	const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i], g = data[i + 1], b = data[i + 2];
		if (g > 80 && g > r * 1.25 && g > b * 1.25) data[i + 3] = 0;
		else if (g > (r + b) / 2 + 12) data[i + 1] = Math.round((r + b) / 2); // despill
	}
	const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
	await sharp(keyed).toFile(resolve(OUT, 'ship.png'));
	await sharp(keyed).rotate(90).png().toFile(resolve(OUT, 'ship_v.png'));
	console.log('✓ ship.png + ship_v.png');
}
console.log('done →', OUT);
