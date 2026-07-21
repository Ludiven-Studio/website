/*
 * Gem sprites for "La Mine aux Cocottes" — 6 sparkling cut gemstones generated
 * with the local ComfyUI (SDXL Turbo) via scripts/comfy-gen.mjs, then cut out to
 * transparent PNGs so they sit on the dark faceted board.
 *
 * Order matches GEM_COLORS in MineGame.tsx: 1 ruby, 2 emerald, 3 sapphire,
 * 4 amber, 5 amethyst, 6 diamond.
 *
 * Usage:
 *   node scripts/comfy-mine.mjs                 # preview PNGs → D:/tmp/comfy/mine
 *   node scripts/comfy-mine.mjs --write         # cut out → public/assets/mine/gem-<n>.png
 *   node scripts/comfy-mine.mjs 1,6 --write     # only ruby + diamond
 *
 * The game auto-detects the PNGs at runtime (falls back to the SVG gems if
 * absent), so you can drop in / regenerate images without any code change.
 */
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const STYLE =
	'ONE single cut gemstone, exactly one gem, brilliant faceted jewel, highly polished, glossy, sharp facets, sparkling glints and star highlights, vivid saturated color, video game item icon, dead center, floating, isolated on a perfectly flat uniform solid medium gray backdrop, even flat lighting, no shadow, no reflection, no floor, no ground, no text';
const NEG =
	'two gems, multiple gems, second gem, pair, group, reflection, mirror, shadow, cast shadow, floor, ground, table, gradient background, vignette, text, words, watermark, signature, hand, ring, setting, metal, cluttered, dark background, realistic photo, jpeg artifacts, noise, blurry';

// n → { name, prompt core }. n is the gem color index used by the game.
const GEMS = {
	1: { name: 'ruby', core: 'a deep red ruby gemstone, crimson and scarlet' },
	2: { name: 'emerald', core: 'a vivid green emerald gemstone, lush grass green' },
	3: { name: 'sapphire', core: 'a bright blue sapphire gemstone, royal azure' },
	4: { name: 'amber', core: 'a warm golden amber gemstone, honey yellow orange' },
	5: { name: 'amethyst', core: 'a purple amethyst gemstone, violet magenta' },
	6: { name: 'diamond', core: 'a clear white diamond gemstone, icy silver sparkle' },
};

const args = process.argv.slice(2);
const write = args.includes('--write');
const idsArg = args.find((a) => !a.startsWith('--'));
const ids = (idsArg ? idsArg.split(',').map(Number) : Object.keys(GEMS).map(Number)).filter((n) => GEMS[n]);

let sharp = null;
if (write) sharp = (await import('sharp')).default; // Astro dep; only needed to cut out

/** Best-effort cutout of the gem from its backdrop → transparent PNG.
 *  Flood-fills the border background, keeps only the largest blob (drops a stray
 *  second gem / specks), then trims + pads to a square so gems align. Works well
 *  when the model gives a flat, uniform background; for messy/reflective outputs,
 *  prefer already-transparent art (e.g. a rembg node in ComfyUI) — the game reads
 *  whatever PNGs are in public/assets/mine/ regardless of how they were made. */
async function cutout(pngBuf, outPath) {
	const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width: w, height: h, channels: ch } = info; // ch = 4
	const N = w * h;
	const bg = [data[0], data[1], data[2]]; // top-left corner = background sample
	const TOL = 55; // per-channel avg distance to count as background
	const near = (p) => { const i = p * ch; return (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])) / 3 < TOL; };
	const neighbours = (p) => { const x = p % w, y = (p - x) / w; const nb = []; if (x + 1 < w) nb.push(p + 1); if (x - 1 >= 0) nb.push(p - 1); if (y + 1 < h) nb.push(p + w); if (y - 1 >= 0) nb.push(p - w); return nb; };

	// 1) flood-fill background inward from the borders
	const isBg = new Uint8Array(N);
	const stack = [];
	for (let x = 0; x < w; x++) { stack.push(x, x + (h - 1) * w); }
	for (let y = 0; y < h; y++) { stack.push(y * w, w - 1 + y * w); }
	while (stack.length) {
		const p = stack.pop();
		if (p < 0 || p >= N || isBg[p] || !near(p)) continue;
		isBg[p] = 1;
		for (const n of neighbours(p)) stack.push(n);
	}
	// 2) keep only the largest connected non-background blob
	const label = new Int32Array(N).fill(-1);
	let best = -1, bestSize = 0;
	for (let s = 0; s < N; s++) {
		if (isBg[s] || label[s] !== -1) continue;
		const q = [s]; label[s] = s; let size = 0;
		while (q.length) { const p = q.pop(); size++; for (const n of neighbours(p)) if (!isBg[n] && label[n] === -1) { label[n] = s; q.push(n); } }
		if (size > bestSize) { bestSize = size; best = s; }
	}
	for (let p = 0; p < N; p++) data[p * ch + 3] = (!isBg[p] && label[p] === best) ? 255 : 0;

	await mkdir(resolve('public/assets/mine'), { recursive: true });
	await sharp(data, { raw: { width: w, height: h, channels: ch } })
		.png().trim({ threshold: 10 }).resize(464, 464, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.toFile(outPath);
}

console.log(`Mine gems: ${ids.length} gem(s), ${write ? 'WRITE → public/assets/mine' : 'preview → D:/tmp/comfy/mine'}`);
for (const n of ids) {
	const g = GEMS[n];
	const t0 = Date.now();
	const promptId = await submit({ id: g.name, prompt: `${g.core}, ${STYLE}`, negative: NEG, w: 512, h: 512, steps: 7 });
	const imgs = await waitForImages(promptId);
	if (write) {
		const tmp = resolve(`D:/tmp/comfy/mine/${g.name}.png`);
		await download(imgs[0], tmp);
		const { readFile } = await import('node:fs/promises');
		await cutout(await readFile(tmp), resolve(`public/assets/mine/gem-${n}.png`));
		console.log(`  ✓ ${n} ${g.name} → public/assets/mine/gem-${n}.png (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
	} else {
		await download(imgs[0], resolve(`D:/tmp/comfy/mine/gem-${n}-${g.name}.png`));
		console.log(`  ✓ ${n} ${g.name} → D:/tmp/comfy/mine/gem-${n}-${g.name}.png (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
	}
}
console.log('done.');
