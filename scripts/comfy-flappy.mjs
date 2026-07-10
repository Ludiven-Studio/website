/*
 * Flappy pilot assets via ComfyUI (SDXL Turbo):
 *   - sky background (opaque, square) → public/assets/jeux/flappy/sky.jpg
 *   - hen "cocotte" sprite (transparent, facing right) → public/assets/jeux/flappy/hen.png
 * The hen (white/red/orange) keys cleanly off a green screen.
 *
 * Usage: node scripts/comfy-flappy.mjs [--preview] [sky|hen]
 */
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/flappy') : resolve('public/assets/jeux/flappy');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['sky', 'hen'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const STYLE = 'flat cartoon game art, bold clean shapes, soft gradients, no text, no words';

async function gen(job) {
	const id = await submit(job);
	const imgs = await waitForImages(id);
	const tmp = resolve(`D:/tmp/comfy/flappy/_${job.id}.png`);
	await download(imgs[0], tmp);
	return readFile(tmp);
}
async function keyGreen(png, outName, { cropBottom = 0 } = {}) {
	const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (g > 80 && g > r * 1.25 && g > b * 1.25) data[i + 3] = 0;
		else if (g > (r + b) / 2 + 12) data[i + 1] = Math.round((r + b) / 2); // despill
	}
	let buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().blur(0.4).png().toBuffer();
	if (cropBottom > 0) {
		const m = await sharp(buf).metadata();
		const h = Math.round(m.height * (1 - cropBottom));
		buf = await sharp(buf).extract({ left: 0, top: 0, width: m.width, height: h }).trim().png().toBuffer();
	}
	await sharp(buf).toFile(resolve(OUT, outName));
	console.log('✓', outName);
}

// 1) Pastel sky — soft gradient + gentle distant hills, no clouds (the game adds
//    scrolling parallax clouds on top).
if (want('sky')) {
	const sky = await gen({
		id: 'sky',
		prompt: `soft pastel sky filling most of the image, wide open sky, only a thin low strip of gentle green hills along the very bottom edge, calm minimal, ${STYLE}`,
		negative: 'big hills, tall hills, mountains, many hills, clouds, many clouds, sun, birds, characters, buildings, forest, busy, dark, night, text, watermark, saturated, neon, vivid',
		w: 768,
		h: 768,
		steps: 6,
	});
	await sharp(sky).modulate({ saturation: 0.72, brightness: 1.04 }).jpeg({ quality: 84 }).toFile(resolve(OUT, 'sky.jpg'));
	console.log('✓ sky.jpg');
}

// 2) Cocotte (hen) sprite — a plump cartoon hen on a clean green screen. Turbo is
//    unreliable here (white bg / multiple hens / foreground grass), so try several
//    seeds and keep the one with a clean green screen and a single centered subject.
if (want('hen')) {
	const HEN_PROMPT = `one cute cartoon white hen chicken, plump round body, red comb and wattle, orange beak, small wing, side view, isolated single sprite, flat matte colors, thick dark outline, simple bold cartoon mascot, centered floating, full frame bright pure #00ff00 green screen filling the entire background, ${STYLE}, no shadow, no ground`;
	const HEN_NEG = 'grass, straw, hay, ground, floor, plants, foreground, scenery, environment, shadow, pattern, tiled, many hens, green hen, green feathers, multiple chickens, rooster tail, realistic, photo, text, watermark, white background, dark background, gradient background';
	const isGreen = (r, g, b) => g > 80 && g > r * 1.25 && g > b * 1.25;
	const score = async (png) => {
		const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
		const { width: W, height: H, channels: ch } = info;
		const px = (x, y) => { const i = (y * W + x) * ch; return isGreen(data[i], data[i + 1], data[i + 2]); };
		const corners = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]].every(([x, y]) => px(x, y));
		// Margins (left/right 8%) should be mostly green → subject is single and centered.
		let mg = 0, mtot = 0, mw = Math.floor(W * 0.08);
		for (let y = 0; y < H; y += 3) for (const x of [...Array(mw).keys(), ...Array(mw).keys().map((k) => W - 1 - k)]) { mtot++; if (px(x, y)) mg++; }
		const marginGreen = mg / mtot;
		// Subject fraction (non-green).
		let non = 0, tot = 0;
		for (let i = 0; i < data.length; i += ch) { tot++; if (!isGreen(data[i], data[i + 1], data[i + 2])) non++; }
		const frac = non / tot;
		const ok = corners && marginGreen > 0.9 && frac > 0.1 && frac < 0.4;
		return { ok, marginGreen, frac };
	};
	let chosen = null;
	for (let s = 1; s <= 6 && !chosen; s++) {
		const png = await gen({ id: `hen${s}`, seed: s * 1013 + 7, prompt: HEN_PROMPT, negative: HEN_NEG, w: 512, h: 512, steps: 7 });
		const sc = await score(png);
		console.log(`  hen try ${s}: margin ${(sc.marginGreen * 100).toFixed(0)}% frac ${sc.frac.toFixed(2)} ${sc.ok ? '→ OK' : ''}`);
		if (sc.ok) chosen = png;
	}
	if (chosen) await keyGreen(chosen, 'hen.png', { cropBottom: 0.06 });
	else console.log('  ⚠ no clean hen found — keep the procedural cocotte (skip hen.png)');
}
console.log('done →', OUT);
