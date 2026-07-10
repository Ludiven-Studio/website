/*
 * Esquive (3D) assets via ComfyUI (SDXL Turbo):
 *   - space nebula background → public/assets/jeux/esquive/nebula.jpg
 *   - tileable rock texture   → public/assets/jeux/esquive/rock.jpg
 *   - rock normal map (Sobel-derived, no extra model) → .../rock_normal.jpg
 *
 * Usage: node scripts/comfy-esquive.mjs [--preview] [nebula|rock]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/esquive') : resolve('public/assets/jeux/esquive');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['nebula', 'rock'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/esquive/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}

// Derive a tangent-space normal map from a diffuse/height image (Sobel gradients).
async function toNormal(png, outName, strength = 2.2) {
	const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
	const { width: W, height: H } = info;
	const at = (x, y) => data[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))] / 255;
	const out = Buffer.alloc(W * H * 3);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
			const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
			const len = Math.hypot(dx, dy, 1);
			const o = (y * W + x) * 3;
			out[o] = ((dx / len) * 0.5 + 0.5) * 255;
			out[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
			out[o + 2] = (1 / len) * 0.5 * 255 + 0.5 * 255;
		}
	}
	await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88 }).toFile(resolve(OUT, outName));
	console.log('✓', outName);
}

// 1) Space nebula background (dark enough to keep gameplay readable).
if (want('nebula')) {
	const neb = await gen({
		id: 'nebula',
		prompt: 'deep space nebula, distant stars, soft cosmic gas clouds, dark background, purple blue and magenta tones, vast cosmic scene, no planets, no text',
		negative: 'planet, sun, bright, white background, text, watermark, spaceship, ground, horizon',
		w: 1024,
		h: 1024,
		steps: 6,
	});
	await sharp(neb).modulate({ brightness: 1.12, saturation: 1.18 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'nebula.jpg'));
	console.log('✓ nebula.jpg');
}

// 2) Tileable rock texture + derived normal map.
if (want('rock')) {
	const rock = await gen({
		id: 'rock',
		prompt: 'seamless tileable rock asteroid surface texture, grey weathered stone, small craters and cracks, even flat top-down lighting, high detail, no seams',
		negative: 'seams, border, frame, vignette, strong shadows, lighting gradient, colorful, text, watermark, object, planet',
		w: 512,
		h: 512,
		steps: 7,
	});
	const rockBuf = await sharp(rock).jpeg({ quality: 86 }).toBuffer();
	await sharp(rockBuf).toFile(resolve(OUT, 'rock.jpg'));
	console.log('✓ rock.jpg');
	await toNormal(rockBuf, 'rock_normal.jpg');
}
console.log('done →', OUT);
