/*
 * L'Atelier des Souvenirs art via ComfyUI (SDXL Turbo) → public/assets/jeux/atelier/
 *   - <chain>-<level>.png, gen-<id>.png : board stickers, cut out, 160 px square
 *   - atelier.jpg : the workshop, painted clean and lit; the game dims and dusts it by CSS
 *   - <who>.jpg   : client portraits, square, shown in a round frame
 *   - photo.jpg   : the 1961 photo
 * The raw render is kept in D:/tmp/comfy/atelier/_<id>.png: ComfyUI serves nothing back for
 * a prompt it already ran, and re-tuning the cutout must not need the GPU. Delete it to redraw.
 *
 * Usage: node scripts/comfy-atelier.mjs [--preview] [id,id…]
 */
import { resolve } from 'node:path';
import { readFile, mkdir, access } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/atelier') : resolve('public/assets/jeux/atelier');
await mkdir(OUT, { recursive: true });
await mkdir(resolve('D:/tmp/comfy/atelier'), { recursive: true });
const only = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '').split(',').filter(Boolean);
const want = (id) => only.length === 0 || only.includes(id);

const ICON = 'cozy hand-painted cartoon game item icon, warm colors, bold dark outline, soft shading, single small object, centered, lots of empty white space around it, isolated on a plain pure white background';
const ICON_NEG = 'text, letters, watermark, several objects, duplicate, background scene, table, floor, shadow, hand, person, frame, border, photo, realistic, blurry, cropped';

const ITEMS = {
	'outil-1': ['a single small screwdriver with a red wooden handle', 11],
	'outil-2': ['a set of four screwdrivers of different sizes held together in a small brown leather holder', 12],
	'outil-3': ['one pair of long thin steel tweezers, V shape, pointed tips', 113],
	'outil-4': ['a brown canvas tool roll unrolled flat, small tools tucked in its pockets', 14],
	'outil-5': ['an open wooden watchmaker case lined with green velvet, tiny precision tools and a jeweler loupe inside', 15],
	'soin-1': ['one small crumpled yellow dust rag', 221],
	'soin-2': ['a small glass bottle of blue cleaning liquid with a cork and a paper label', 22],
	'soin-3': ['a small wicker basket holding a brush, a folded cloth and a blue bottle', 23],
	'soin-4': ['an open round metal tin of amber polishing wax', 24],
	'soin-5': ['an open wooden box with a wax tin, soft round brushes and a small varnish bottle', 25],
	'meca-1': ['a single small brass screw', 31],
	'meca-2': ['exactly five small brass screws lying in a little group', 132],
	'meca-3': ['one shiny steel helical compression spring standing upright, a metal coil like a mattress spring', 233],
	'meca-4': ['a single golden brass cog gear wheel', 34],
	'meca-5': ['a compact round brass clockwork mechanism, three interlocking gears on a small brass plate', 135],
	'meca-6': ['a round antique golden clock movement with a small pendulum hanging below, visible gears', 236],
	'gen-boite': ['an old red metal toolbox with its lid open, tool handles sticking out', 41],
	'gen-tiroir': ['a small wooden chest of three drawers, the top drawer open and full of brass parts', 42],
};

const PEOPLE = {
	morel: ['head and shoulders portrait of a kind elderly man around 75, grey moustache, flat tweed cap, beige cardigan, gentle sad smile, facing viewer', 51],
	garnier: ['head and shoulders portrait of a cheerful woman around 60, short curly grey hair, round glasses, floral blouse, warm smile, facing viewer', 52],
	lucas: ['head and shoulders portrait of a teenage boy around 15, messy brown hair, green hoodie, bike helmet on his head, grin, facing viewer', 53],
	chen: ['head and shoulders portrait of a young woman around 25, black hair in a bun, denim overall, pencil behind ear, curious smile, facing viewer', 54],
};
const PORTRAIT = 'cartoon game character portrait, hand-painted, warm colors, bold dark outline, soft shading, centered, isolated on a plain pure white background';
const PORTRAIT_NEG = 'text, watermark, several people, body below chest, hands, background scene, frame, border, photo, realistic, blurry, deformed face';

async function gen(id, job) {
	const tmp = resolve(`D:/tmp/comfy/atelier/_${id}.png`);
	try {
		await access(tmp);
	} catch {
		const pid = await submit(job);
		await download((await waitForImages(pid))[0], tmp);
		console.log('  rendered', id);
	}
	return readFile(tmp);
}

// Flood-fill the near-white backdrop from the borders: a white rag inside the outline stays
// opaque, which a plain luminance key would punch through. Then keep the largest blob, feather
// the edge by a pixel, trim and pad to a square.
async function cutout(img, file, size = 160) {
	const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width: w, height: h } = info;
	const N = w * h;
	const isBgPx = (p) => {
		const i = p * 4;
		const mn = Math.min(data[i], data[i + 1], data[i + 2]);
		const mx = Math.max(data[i], data[i + 1], data[i + 2]);
		return mn > 205 && mx - mn < 30;
	};
	const bg = new Uint8Array(N);
	const stack = [];
	for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
	for (let y = 0; y < h; y++) stack.push(y * w, w - 1 + y * w);
	while (stack.length) {
		const p = stack.pop();
		if (bg[p] || !isBgPx(p)) continue;
		bg[p] = 1;
		const x = p % w;
		if (x > 0) stack.push(p - 1);
		if (x < w - 1) stack.push(p + 1);
		if (p >= w) stack.push(p - w);
		if (p < N - w) stack.push(p + w);
	}
	// Largest foreground blob only: drops stray specks the model sprinkles around.
	const label = new Int32Array(N).fill(-1);
	let best = -1, bestSize = 0;
	for (let s = 0; s < N; s++) {
		if (bg[s] || label[s] !== -1) continue;
		const q = [s]; label[s] = s; let size = 0;
		while (q.length) {
			const p = q.pop(); size++;
			const x = p % w;
			for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
				if (n >= 0 && n < N && !bg[n] && label[n] === -1) { label[n] = s; q.push(n); }
			}
		}
		if (size > bestSize) { bestSize = size; best = s; }
	}
	// 3x3 box on the mask: a one-pixel feather, done by hand so no channel count can drift.
	const hard = new Uint8Array(N);
	for (let p = 0; p < N; p++) hard[p] = label[p] === best ? 255 : 0;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		let sum = 0, n = 0;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			const xx = x + dx, yy = y + dy;
			if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
			sum += hard[yy * w + xx]; n++;
		}
		data[(y * w + x) * 4 + 3] = Math.round(sum / n);
	}
	const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
		.then((b) => sharp(b).trim({ threshold: 1 }).toBuffer());
	const pad = Math.round(size * 0.04);
	await sharp(trimmed)
		.resize(size - 2 * pad, size - 2 * pad, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png({ palette: true, quality: 90 })
		.toFile(resolve(OUT, file));
	console.log('✓', file);
}

for (const [id, [what, seed]] of Object.entries(ITEMS)) {
	if (!want(id)) continue;
	const img = await gen(id, { prompt: `${what}, ${ICON}`, negative: ICON_NEG, w: 512, h: 512, steps: 6, seed });
	await cutout(img, `${id}.png`);
}

for (const [id, [what, seed]] of Object.entries(PEOPLE)) {
	if (!want(id)) continue;
	const img = await gen(id, { prompt: `${what}, ${PORTRAIT}`, negative: PORTRAIT_NEG, w: 512, h: 512, steps: 6, seed });
	// Shown in a round frame, so no cutout: a square crop of the head is all it needs.
	await sharp(img).extract({ left: 56, top: 16, width: 400, height: 400 }).resize(192).jpeg({ quality: 82, mozjpeg: true }).toFile(resolve(OUT, `${id}.jpg`));
	console.log('✓', `${id}.jpg`);
}

if (want('atelier')) {
	const img = await gen('atelier', {
		prompt: 'interior of a cozy old watchmaker and repair workshop, a long wooden workbench in the foreground, wall shelves with old clocks, jars and small boxes, a tall window with soft daylight, warm wood and brass, a closed dark wooden door at the back, hand-painted cartoon game background, warm colors, no people',
		negative: 'text, watermark, people, person, hands, blurry, photo, realistic, dark, messy lines',
		w: 768,
		h: 1024,
		steps: 7,
		seed: 60161,
	});
	await sharp(img).resize(720).jpeg({ quality: 82, mozjpeg: true }).toFile(resolve(OUT, 'atelier.jpg'));
	console.log('✓ atelier.jpg');
}

if (want('photo')) {
	const img = await gen('photo', {
		prompt: 'old sepia photograph from 1961, a young man and a young woman smiling side by side in front of a small watch repair shop window, vintage film grain, faded, black and white',
		negative: 'text, watermark, color, modern, frame, border, blurry faces, several people, crowd',
		w: 640,
		h: 512,
		steps: 7,
		seed: 1961,
	});
	await sharp(img).grayscale().tint({ r: 150, g: 115, b: 80 }).resize(480).jpeg({ quality: 80, mozjpeg: true }).toFile(resolve(OUT, 'photo.jpg'));
	console.log('✓ photo.jpg');
}
console.log('done →', OUT);
