/*
 * Game card thumbnails: themed key art (local SDXL via ComfyUI), the Ludiven
 * cocotte on the left, and the real gameplay capture on a screen on the right.
 *
 *   npm run build && npm run og      # refresh the raw captures first
 *   node scripts/comfy-thumbs.mjs [id ...] [--no-gen]
 *
 * Writes public/assets/jeux/<id>.jpg (card, 16:10) and og/<id>.jpg (1200x630).
 * The capture is kept at public/assets/jeux/raw/<id>.jpg (gitignored) so a rerun
 * can recompose without a new capture — always run `npm run og` first if it is
 * missing, otherwise the backup would keep an already-composed thumbnail.
 */
import sharp from 'sharp';
import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { run } from './comfy-gen.mjs';
import { THEMES } from './thumb-themes.mjs';

const OUT = resolve('public/assets/jeux');
const RAW = resolve(OUT, 'raw');
const ART = resolve('D:/tmp/thumb-art');

const CARD_W = 1200, CARD_H = 750; // 16:10, the .game-card-media box
const OG_W = 1200, OG_H = 630;

// The Ludiven mascot, described so SDXL lands close to the in-app SVG hen.
// SDXL only paints the empty stage: the mascot and the screen are drawn on top,
// because the model cannot put either at a position we can composite against.
const STYLE =
	'flat vector game key art, bold clean shapes, vibrant playful colours, soft gradients, ' +
	'subtle depth, modern casual mobile game illustration, no text, no words, no letters';
const COMPOSITION =
	'wide establishing shot, empty stage, no characters, clear ground plane at the bottom, ' +
	'uncluttered middle of the frame';
const NEG =
	'chicken, hen, bird, animal, character, mascot, person, people, hands, close-up, ' +
	'text, words, letters, watermark, signature, ui, hud, screen, monitor, television, phone, ' +
	'blurry, ugly, deformed, photo, noisy, jpeg artifacts';

const promptFor = (id) => `${THEMES[id]}, ${COMPOSITION}, ${STYLE}`;

const exists = async (p) => access(p).then(() => true, () => false);

/** Rounded-corner mask for the screen. */
const roundMask = (w, h, r) =>
	Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);

/** The screen furniture drawn UNDER the capture: glow, bezel, stand. */
const screenBack = (W, H, x, y, w, h, bz) =>
	Buffer.from(`<svg width="${W}" height="${H}">
		<defs>
			<radialGradient id="glow"><stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
				<stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
			<linearGradient id="bez" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#3a3350"/><stop offset="100%" stop-color="#16121f"/></linearGradient>
			<filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
				<feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.5"/></filter>
		</defs>
		<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * 0.95}" ry="${h * 0.95}" fill="url(#glow)"/>
		<path d="M ${x + w / 2 - w * 0.13} ${y + h + bz} h ${w * 0.26} l ${w * 0.055} ${bz * 2.1}
			h ${-w * 0.37} Z" fill="#241e33"/>
		<rect x="${x + w / 2 - w * 0.22}" y="${y + h + bz * 3}" width="${w * 0.44}" height="${bz * 0.75}"
			rx="${bz * 0.37}" fill="#1b1626"/>
		<rect x="${x - bz}" y="${y - bz}" width="${w + bz * 2}" height="${h + bz * 2}"
			rx="${bz * 1.4}" fill="url(#bez)" filter="url(#drop)"/>
	</svg>`);

/** Glass sheen drawn OVER the capture, so the screen reads as a screen. */
const screenFront = (W, H, x, y, w, h, r) =>
	Buffer.from(`<svg width="${W}" height="${H}">
		<defs><linearGradient id="sheen" x1="0" y1="0" x2="0.7" y2="1">
			<stop offset="0%" stop-color="#fff" stop-opacity="0.22"/>
			<stop offset="45%" stop-color="#fff" stop-opacity="0.04"/>
			<stop offset="46%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
		<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#sheen)"/>
		<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r}"
			fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>
	</svg>`);

/** The Ludiven cocotte, same shapes as the in-app SVG (src/components/Celebration.tsx). */
const mascot = (w, h) =>
	Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 110 116">
		<defs><filter id="ms" x="-30%" y="-30%" width="160%" height="160%">
			<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/></filter></defs>
		<ellipse cx="50" cy="104" rx="34" ry="7" fill="#000" opacity="0.22"/>
		<g filter="url(#ms)">
			<g fill="#e0413a">
				<circle cx="42" cy="21" r="7"/><circle cx="52" cy="15" r="8.5"/><circle cx="62" cy="21" r="7"/>
			</g>
			<ellipse cx="18" cy="64" rx="11" ry="19" fill="#eef0ea"/>
			<path d="M 70 60 Q 84 60 89 47" stroke="#eef0ea" stroke-width="12" stroke-linecap="round" fill="none"/>
			<ellipse cx="50" cy="62" rx="35" ry="33" fill="#fdfdfb" stroke="#e6e6df" stroke-width="1.5"/>
			<g fill="#fdfdfb" stroke="#e6e6df" stroke-width="1.4">
				<rect x="80" y="32" width="20" height="15" rx="6.5"/>
				<rect x="80" y="18" width="9.5" height="17" rx="4.75"/>
			</g>
			<circle cx="39" cy="51" r="5" fill="#2a2a2a"/><circle cx="61" cy="51" r="5" fill="#2a2a2a"/>
			<circle cx="40.6" cy="49.2" r="1.6" fill="#fff"/><circle cx="62.6" cy="49.2" r="1.6" fill="#fff"/>
			<polygon points="50,56 43,63 57,63" fill="#f5a623"/>
			<circle cx="46" cy="68" r="3.6" fill="#e0413a"/><circle cx="54" cy="68" r="3.6" fill="#e0413a"/>
			<g stroke="#f5a623" stroke-width="3.4" stroke-linecap="round">
				<line x1="42" y1="93" x2="42" y2="100"/><line x1="58" y1="93" x2="58" y2="100"/>
			</g>
		</g>
	</svg>`);

/** Bottom scrim: keeps the screen readable whatever the art does down there. */
const scrim = (W, H) =>
	Buffer.from(`<svg width="${W}" height="${H}">
		<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
			<stop offset="55%" stop-color="#000" stop-opacity="0"/>
			<stop offset="100%" stop-color="#000" stop-opacity="0.35"/>
		</linearGradient></defs>
		<rect width="${W}" height="${H}" fill="url(#g)"/>
	</svg>`);

/*
 * Per-game touch-up drawn on the capture, in its 1200x630 coordinates.
 * Mot Secret is captured on a fresh word, so its grid would read as an empty box.
 */
export const OVERLAYS = {
	'mot-secret': () => {
		const cell = 41, x0 = 497, y0 = 155;
		const marks = [];
		for (let r = 0; r < 6; r++) {
			for (let c = r === 0 ? 1 : 0; c < 6; c++) {
				if (r > 0) {
					marks.push(`<rect x="${x0 + c * cell - 20}" y="${y0 + r * cell - 20}" width="40" height="40"
						rx="8" fill="#f0eafb"/>`);
				}
				marks.push(`<text x="${x0 + c * cell}" y="${y0 + r * cell + 10}" text-anchor="middle"
					font-family="Verdana,sans-serif" font-size="26" font-weight="700"
					fill="${r === 0 ? '#4b2e83' : '#9c85c4'}">?</text>`);
			}
		}
		return `<svg width="1200" height="630">${marks.join('')}</svg>`;
	},
};

// Hand-picked crop, when the detection below has nothing solid to latch onto.
export const CROPS = {
	'mot-secret': { left: 394, top: 133, width: 412, height: 257 }, // faint grid, dense keyboard
	'lettres-croisees': { left: 271, top: 134, width: 658, height: 411 }, // the wheel outshines the grid
	flappy: { left: 391, top: 190, width: 418, height: 261 }, // square board: keep the hen and the gap
};

/**
 * Bounding box of the playfield in a capture, in 16:10. The page background is a
 * smooth diagonal gradient, so it is modelled by interpolating each row between its
 * left and right gutter: whatever differs from it is the board. Full-bleed games
 * have no gutter, the model then matches nothing and the whole frame is kept.
 */
export async function contentBox(shotPath, W, H) {
	const SW = 300;
	const { data, info } = await sharp(shotPath).removeAlpha().resize(SW).raw().toBuffer({ resolveWithObject: true });
	const { width: w, height: h, channels: ch } = info;
	const px = (x, y) => {
		const i = (y * w + x) * ch;
		return [data[i], data[i + 1], data[i + 2]];
	};
	const edge = (y, side) => {
		const acc = [0, 0, 0];
		for (let k = 0; k < 3; k++) {
			const c = px(side === 0 ? k : w - 1 - k, y);
			acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
		}
		return acc.map((v) => v / 3);
	};

	const y0 = Math.round(h * 0.1); // below the mode tabs
	const y1 = Math.round(h * 0.97);
	const mask = new Uint8Array(w * h);
	const rowHits = new Int32Array(h);
	for (let y = y0; y < y1; y++) {
		const l = edge(y, 0), r = edge(y, 1);
		for (let x = 0; x < w; x++) {
			const t = x / (w - 1);
			const [pr, pg, pb] = px(x, y);
			const d =
				Math.abs(pr - (l[0] + (r[0] - l[0]) * t)) +
				Math.abs(pg - (l[1] + (r[1] - l[1]) * t)) +
				Math.abs(pb - (l[2] + (r[2] - l[2]) * t));
			if (d > 20) {
				mask[y * w + x] = 1;
				rowHits[y]++;
			}
		}
	}

	/**
	 * Longest unbroken run of detailed lines, tolerating the gaps inside a board.
	 * A run crossing the middle of the capture wins over a longer one off to the
	 * side: that is the playfield, not the keyboard or the score panel.
	 */
	const runOf = (hits, from, to, min, gap) => {
		const runs = [];
		let a = -1, miss = 0;
		for (let i = from; i < to; i++) {
			if (hits[i] >= min) {
				if (a < 0) a = i;
				miss = 0;
			} else if (a >= 0 && ++miss > gap) {
				runs.push([a, i - miss]);
				a = -1;
			}
		}
		if (a >= 0) runs.push([a, to - 1]);
		if (!runs.length) return [0, -1];
		const mid = (from + to) / 2;
		const hit = runs.filter(([s, e]) => s <= mid && e >= mid);
		return (hit.length ? hit : runs).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
	};

	const [ry0, ry1] = runOf(rowHits, y0, y1, w * 0.12, Math.round(h * 0.03));
	const colHits = new Int32Array(w);
	for (let y = ry0; y <= ry1; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) colHits[x]++;
	const [rx0, rx1] = runOf(colHits, 0, w, (ry1 - ry0) * 0.12, Math.round(w * 0.03));
	if (ry1 <= ry0 || rx1 <= rx0) return { left: 0, top: 0, width: W, height: H };

	const s = W / w; // back to full-resolution coordinates
	const pad = W * 0.02;
	let bx = rx0 * s - pad, by = ry0 * s - pad;
	let bw = (rx1 - rx0 + 1) * s + pad * 2, bh = (ry1 - ry0 + 1) * s + pad * 2;

	// Grow to 16:10 around the centre, then slide back inside the capture.
	if (bw / bh < 1.6) { const t = bh * 1.6; bx -= (t - bw) / 2; bw = t; }
	else { const t = bw / 1.6; by -= (t - bh) / 2; bh = t; }
	if (bw > W) { bh *= W / bw; bw = W; }
	if (bh > H) { bw *= H / bh; bh = H; }
	bx = Math.min(Math.max(0, bx), W - bw);
	by = Math.min(Math.max(0, by), H - bh);

	const left = Math.round(bx), top = Math.round(by);
	return {
		left,
		top,
		width: Math.min(Math.round(bw), W - left),
		height: Math.min(Math.round(bh), H - top),
	};
}

/** Compose one canvas: themed art + the capture shown on a screen standing in the scene. */
async function compose(id, artPath, shotPath, W, H, outPath) {
	const sw = Math.round(W * 0.44);
	const sh = Math.round((sw * 10) / 16);
	const bz = Math.round(W * 0.013);
	const r = 6;
	const x = W - sw - bz - Math.round(W * 0.05);
	// Bottom-anchored so the stand rests near the ground line of the illustration.
	const y = Math.round(H - H * 0.07 - bz * 3.8 - sh);

	// Zoom on the playfield: on a card the screen is only ~160px wide, so the mode
	// tabs and the page margins have to go or nothing is readable.
	const meta = await sharp(shotPath).metadata();
	const draw = OVERLAYS[id];
	const shot = draw
		? await sharp(shotPath).composite([{ input: Buffer.from(draw()), top: 0, left: 0 }]).png().toBuffer()
		: shotPath;
	const box = CROPS[id] ?? (await contentBox(shot, meta.width, meta.height));
	if (process.env.DEBUG_BOX) console.log(id, box);
	const screen = await sharp(shot)
		.extract(box)
		.resize(sw, sh, { fit: 'cover' })
		.composite([{ input: roundMask(sw, sh, r), blend: 'dest-in' }])
		.png()
		.toBuffer();

	// Mascot: feet on the same ground line as the screen stand, clear of the bezel.
	const mh = Math.round(H * 0.6);
	const mw = Math.round((mh * 110) / 116);
	const my = Math.round(H - H * 0.045 - mh);
	const mx = Math.round(W * 0.06);
	const hen = await sharp(mascot(mw, mh)).png().toBuffer();

	await sharp(artPath)
		.resize(W, H, { fit: 'cover' })
		.composite([
			{ input: scrim(W, H), top: 0, left: 0 },
			{ input: screenBack(W, H, x, y, sw, sh, bz), top: 0, left: 0 },
			{ input: screen, top: y, left: x },
			{ input: screenFront(W, H, x, y, sw, sh, r), top: 0, left: 0 },
			{ input: hen, top: my, left: mx },
		])
		.jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
		.toFile(outPath);
}

async function main() {
	const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
	const targets = ids.length ? ids : Object.keys(THEMES);
	const skipGen = process.argv.includes('--no-gen');

	await mkdir(RAW, { recursive: true });
	await mkdir(ART, { recursive: true });

	// Keep the pristine screenshot: after the first run, <id>.jpg is a composite.
	for (const id of targets) {
		const raw = resolve(RAW, `${id}.jpg`);
		if (!(await exists(raw))) await copyFile(resolve(OUT, `${id}.jpg`), raw);
	}

	if (!skipGen) {
		const jobs = targets.map((id) => ({
			id,
			prompt: promptFor(id),
			negative: NEG,
			w: 1024,
			h: 640,
			steps: 8,
			out: resolve(ART, `${id}.png`),
		}));
		await run(jobs);
	}

	for (const id of targets) {
		const art = resolve(ART, `${id}.png`);
		const raw = resolve(RAW, `${id}.jpg`);
		await compose(id, art, raw, CARD_W, CARD_H, resolve(OUT, `${id}.jpg`));
		await compose(id, art, raw, OG_W, OG_H, resolve(OUT, 'og', `${id}.jpg`));
		console.log(`  ✓ ${id}`);
	}
}

// The helpers above stay importable; the pipeline only runs when called directly.
if (process.argv[1].endsWith('comfy-thumbs.mjs')) await main();
