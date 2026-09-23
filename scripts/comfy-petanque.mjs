/*
 * Pétanque ground textures — ComfyUI (SDXL-Turbo) for the grain, this script for everything else.
 *
 * Four stages, each answering one of the plan's physical rules:
 *
 *  1. wrap-blend  → TILEABLE. Vanilla ComfyUI has no seamless/circular-padding node (checked — 791
 *     nodes, none), and the pitch repeats the texture ~15 times down its length, so a seam reads as
 *     a grid. We generate at SIDE+BAND and cross-fade the overlap back onto itself, so the output's
 *     left edge is built from the source columns that already continue past its right edge.
 *  2. high-pass   → NO PAINTED LIGHT. three.js lights the ground; a painted gradient doubles up.
 *     Subtracting a wide blur removes every slope the generator drew and keeps the grain.
 *  3. tint        → DISTINGUISHABLE. The palette is imposed, not prompted: measured at cfg 1.0 the
 *     negative prompt is INERT, and the positive alone kept returning olive for "dark slate grey".
 *
 * Stage 2 blurs, which on an already-seamless tile would reintroduce a seam because sharp clamps at
 * the border. It therefore goes through `wrapPad` first.
 *
 * A fourth stage was written, measured and REMOVED: squeezing the grain N times into one metre, on
 * the theory that SDXL draws fist-sized stones. Two builds at N=2 and N=1 (with sol-gravier-gros,
 * already at 1, as the null control) showed N=2 halved the `grain` score without improving mid-scale
 * — it only made the tiles look like paper.
 *
 * Usage: node scripts/comfy-petanque.mjs [--side 1024] [--steps 8] [--seed 1770]
 *                                        [--punch 1] [--contrast 1] [--out public|tmp]
 * Then:  node scripts/measure-petanque-tex.mjs   ← never ship one of these unmeasured
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SIDE = Number(arg('side', 1024));
const BAND = Math.round(SIDE / 8); // cross-fade width; the only blurred part of the result
const STEPS = Number(arg('steps', 8));
const SEED = Number(arg('seed', 1770));
const CONTRAST = Number(arg('contrast', 1));
const PUNCH = Number(arg('punch', 1)); // global multiplier on the per-ground punch, for A/B runs
const ONLY = arg('only', ''); // regenerate one ground, e.g. --only sol-terre-battue
const TMP = arg('tmp', 'D:/tmp/comfy/petanque');
const DEST = arg('out', 'public') === 'public' ? resolve('public/assets/jeux/petanque') : TMP;

// Only the grain is asked for. Colour is NOT prompted — see the header, stage 4.
const STYLE = 'top-down orthographic view of the ground, flat even daylight, uniform grain across the whole frame, stylized but believable, subtle painterly texture';
// Kept for the day someone raises cfg above 1.0. At cfg 1.0 it is provably inert: same positive,
// same seed, empty vs heavy negative gives byte-identical PIXELS. (File bytes always differ —
// ComfyUI writes the prompt into PNG metadata, which is how this nearly went unnoticed.)
const NEG = 'shadow, vignette, uneven lighting, large rocks, boulder, object, plant, grass, moss, footprint, horizon, perspective, depth of field, blur, text, watermark, person';

// tint = [light, dark], mirroring SURFACE_TINT in src/games/petanque/render3d.ts.
// punch = how hard the grain is written into that tint. It is the visual half of the same message
// the friction constants carry: terre battue is smooth and reads smooth, gros gravier is dispersive
// and reads busy. Measured, not eyeballed — see the `grain` column of measure-petanque-tex.mjs.
//
// cut = the largest structure the tile is allowed to keep, in cm. Taken from `pebbleR` in
// terrain.ts (biggest real stone × 2), not chosen: it is the frontier between "grain", which the
// texture may draw, and "stone", which is geometry and must not be painted. One shared value does
// not exist — at 6.4 cm the gravel finally read as gravel while the clay turned into embossed
// wallpaper, and that is not a compromise to split, it is two different surfaces.
const GROUNDS = [
	// seed 2001: the only one of 2001-2008 under the painted-light bar before the band fix (2.52;
	// the others 3.0-4.2). Since the drift removal in grainToTint it reads 1.43.
	{ id: 'sol-terre-battue', prompt: 'packed ocre clay court ground, very fine dry dust, smooth and predictable', tint: [0xb5763f, 0x8a5426], punch: 1.0, cut: 1.4, seed: 2001 },
	{ id: 'sol-gravier-fin', prompt: 'fine gravel grit, small even granules, stone dust', tint: [0x9a988f, 0x77746c], punch: 1.5, cut: 2.8 },
	{ id: 'sol-gravier-gros', prompt: 'coarse gravel chippings, high contrast granules, broken stone', tint: [0x6f6a61, 0x4a463f], punch: 2.2, cut: 4.8 },
	{ id: 'sol-sable', prompt: 'soft sand, fine even sand grain', tint: [0xe0c489, 0xc4a468], punch: 0.8, cut: 1.8 },
];

/**
 * Make one tile seamless. Source is (SIDE+BAND)² ; the output is SIDE². Each output pixel inside the
 * band is a bilinear cross-fade between its own sample and the sample one tile further on, which is
 * continuous with the opposite edge — so the tile meets itself exactly.
 */
function wrapBlend(data, ws, ch, side, band) {
	const out = Buffer.alloc(side * side * ch);
	const at = (x, y, c) => data[(y * ws + x) * ch + c];
	const mean = new Float64Array(ch);
	for (let i = 0; i < data.length; i++) mean[i % ch] += data[i];
	for (let c = 0; c < ch; c++) mean[c] /= data.length / ch;
	for (let y = 0; y < side; y++) {
		const wy = y < band ? y / band : 1;
		for (let x = 0; x < side; x++) {
			const wx = x < band ? x / band : 1;
			/* Two unrelated grains averaged 50/50 keep only 1/√2 of their contrast. That weaker band
			   then clipped less in grainToTint, and its mean drifted: a 12 cm stripe every metre,
			   4.5 levels dark on terre-battue, invisible at full size and plain once mipmapped.
			   Dividing the deviation by the weights' L2 norm keeps the contrast constant. */
			const w = [wx * wy, (1 - wx) * wy, wx * (1 - wy), (1 - wx) * (1 - wy)];
			const norm = Math.sqrt(w[0] ** 2 + w[1] ** 2 + w[2] ** 2 + w[3] ** 2);
			for (let c = 0; c < ch; c++) {
				// Only sample the far copy where it carries weight. The source is side+band wide, so
				// at(x + side) is out of bounds for x >= band; multiplying that undefined by a zero
				// weight yields NaN, and Math.round(NaN) stored into a Buffer becomes 0 — which
				// silently blacked out everything outside the band.
				let v = w[0] * at(x, y, c);
				if (wx < 1) v += w[1] * at(x + side, y, c);
				if (wy < 1) v += w[2] * at(x, y + side, c);
				if (wx < 1 && wy < 1) v += w[3] * at(x + side, y + side, c);
				v = mean[c] + (v - mean[c]) / norm;
				out[(y * side + x) * ch + c] = Math.max(0, Math.min(255, Math.round(v)));
			}
		}
	}
	return out;
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Toroidal padding. Every later blur/resize runs on this, so the border never sees a clamped edge. */
function wrapPad(data, side, ch, pad) {
	const n = side + 2 * pad;
	const out = Buffer.alloc(n * n * ch);
	for (let y = 0; y < n; y++) {
		const sy = (((y - pad) % side) + side) % side;
		for (let x = 0; x < n; x++) {
			const sx = (((x - pad) % side) + side) % side;
			const s = (sy * side + sx) * ch;
			data.copy(out, (y * n + x) * ch, s, s + ch);
		}
	}
	return out;
}

/**
 * Stages 3+4: keep the generator's grain, throw away its lighting and its colour.
 *
 * The detail field is normalised by a robust scale (median |detail|) rather than a max, because one
 * bright speck would otherwise flatten the whole tile. Highlights go to white and shadows to the
 * surface's dark tint, with the same asymmetry the procedural grain uses in render3d.ts.
 *
 * The blur width is the surface's own `cut` (see GROUNDS), because it is the one frontier that
 * matters: below it the tile may draw grain, above it the generator is painting either lighting or
 * a stone, and both are lies. A single global width was tried and is not possible — see GROUNDS.
 */
async function grainToTint(data, side, ch, { tint, punch, cut }, contrast) {
	const l = Buffer.alloc(side * side);
	for (let i = 0; i < side * side; i++) l[i] = Math.round(0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2]);

	const sigma = (side * cut) / 100; // one tile is one metre, so cut in cm maps straight to pixels
	const pad = side >> 2; // >= 5 sigma at the widest cut, so the blur never reaches past the wrap
	const n = side + 2 * pad;
	const low = await sharp(wrapPad(l, side, 1, pad), { raw: { width: n, height: n, channels: 1 } })
		.blur(sigma)
		.extract({ left: pad, top: pad, width: side, height: side })
		.raw().toBuffer();

	const detail = new Float32Array(side * side);
	for (let i = 0; i < detail.length; i++) detail[i] = l[i] - low[i];

	const sample = [];
	for (let i = 0; i < detail.length; i += 7) sample.push(Math.abs(detail[i]));
	sample.sort((a, b) => a - b);
	const scale = Math.max(sample[sample.length >> 1] * 1.4826, 1);

	/* Two endpoints placed so the grain swings the SAME number of luminance levels either way. Mixing
	   naively towards white and towards the dark tint does not: white is ~128 levels above the base
	   and the dark tint only ~35 below it, so grain brightened far more than it darkened, and any
	   patch with stronger grain averaged brighter. That re-created the painted lighting the high-pass
	   had just removed — measured 0.59 after the high-pass, 4.47 after this map. Symmetric endpoints
	   make the map linear in `a`, so a zero-mean detail field cannot move the local mean at all. */
	const base = rgb(tint[0]), dark = rgb(tint[1]);
	const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	const swing = punch * 22; // peak excursion in luminance levels
	const toward = (t, f) => base.map((b, c) => b + (t[c] - b) * f);
	const hi = toward([255, 255, 255], swing / Math.max(255 - lumOf(base), 1));
	const lo = toward(dark, swing / Math.max(lumOf(base) - lumOf(dark), 1));

	const out = Buffer.alloc(side * side * 3);
	for (let i = 0; i < detail.length; i++) {
		const a = Math.max(-1, Math.min(1, (detail[i] / scale) * contrast));
		const t = a >= 0 ? hi : lo;
		const k = Math.abs(a);
		for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(base[c] + (t[c] - base[c]) * k)));
	}

	/* Even contrast-preserved, the cross-faded band clips differently from the rest (a sum of two
	   skewed grains is less skewed), so its mean still drifts: 1.82σ on terre-battue after the fix
	   in wrapBlend. Remove the slow drift of the column and row means directly. The profile is
	   smoothed over a wrapped window, so the tile stays seamless and single-pixel grain is untouched. */
	const L = (i) => 0.2126 * out[i * 3] + 0.7152 * out[i * 3 + 1] + 0.0722 * out[i * 3 + 2];
	const colM = new Float64Array(side), rowM = new Float64Array(side);
	let all = 0;
	for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const l = L(y * side + x); colM[x] += l / side; rowM[y] += l / side; all += l; }
	all /= side * side;
	const smooth = (a, win) => a.map((_, k) => {
		let t = 0;
		for (let j = -win; j <= win; j++) t += a[(k + j + side) % side];
		return t / (2 * win + 1) - all;
	});
	const win = Math.round(side / 64);
	const dc = smooth(colM, win), dr = smooth(rowM, win);
	const baseLum = lumOf(base);
	for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
		const off = dc[x] + dr[y];
		const i = (y * side + x) * 3;
		for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round(out[i + c] - off * (base[c] / baseLum))));
	}

	/* A residue of painted light survives on terre-battue: the clamp at |a| = 1 is still a
	   nonlinearity and clips a skewed grain — bright dust specks on dark clay — unevenly. Two
	   treatments were written, measured and REMOVED: flattening the grain envelope before the map
	   (no effect at all, 4.38 -> 4.47) and flattening the output luminance after it (worse, and it
	   pushed every seam score up by ~1 sigma). Both blurred at 12.8 cm while `blotch` reads 6.4 cm
	   blocks, so neither ever touched the band being measured. The residue varies by seed; pick
	   the seed (see GROUNDS), never loosen the bar. */
	return out;
}

await mkdir(TMP, { recursive: true });
await mkdir(DEST, { recursive: true });

const gen = SIDE + BAND;
console.log(`SDXL-Turbo ${gen}² → wrap-blend (band ${BAND}) → passe-haut + teinte → ${SIDE}² webp → ${DEST}`);

for (const g of GROUNDS) {
	if (ONLY && g.id !== ONLY) continue;
	const t0 = Date.now();
	const id = await submit({
		id: g.id,
		prompt: `${g.prompt}, ${STYLE}`,
		negative: NEG,
		w: gen, h: gen, steps: STEPS,
		// --seed shifts the whole set. Needed as well as wanted: an identical prompt makes ComfyUI
		// replay a cached execution that carries no image, so a re-run at the same seed yields
		// nothing. Fixed by default, so a given seed always rebuilds the same four grounds.
		// A ground may pin its own seed: the one that passed measure-petanque-tex.mjs.
		seed: arg('seed', null) != null ? SEED + GROUNDS.indexOf(g) * 97 : (g.seed ?? SEED + GROUNDS.indexOf(g) * 97),
	});
	const imgs = await waitForImages(id, 300000);
	const rawPng = `${TMP}/${g.id}-raw.png`;
	await download(imgs[0], resolve(rawPng));

	const { data, info } = await sharp(rawPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const tiled = wrapBlend(data, info.width, ch, SIDE, BAND);
	const final = await grainToTint(tiled, SIDE, ch, { ...g, punch: g.punch * PUNCH }, CONTRAST);
	const img = sharp(final, { raw: { width: SIDE, height: SIDE, channels: 3 } });
	await img.clone().webp({ quality: 88 }).toFile(resolve(`${DEST}/${g.id}.webp`));
	await img.clone().png().toFile(resolve(`${TMP}/${g.id}.png`));

	// A 2x2 contact sheet: the only honest way to LOOK at a seam is to lay the tile next to itself.
	const t = await img.clone().png().toBuffer();
	// Two passes on purpose: sharp resizes BEFORE it composites, so shrinking in the same pipeline
	// would scale the canvas down first and then refuse the full-size tiles.
	const sheet = await sharp({ create: { width: SIDE * 2, height: SIDE * 2, channels: 3, background: '#000' } })
		.composite([{ input: t, left: 0, top: 0 }, { input: t, left: SIDE, top: 0 }, { input: t, left: 0, top: SIDE }, { input: t, left: SIDE, top: SIDE }])
		.png().toBuffer();
	await sharp(sheet).resize(768, 768).png().toFile(resolve(`${TMP}/${g.id}-2x2.png`));

	console.log(`  ok ${g.id.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

await writeFile(resolve(`${TMP}/README.txt`), 'Generated by scripts/comfy-petanque.mjs. *-2x2.png show the tile beside itself — that is where a seam shows.\n');
console.log('done.');
