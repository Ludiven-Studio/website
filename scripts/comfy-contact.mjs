/* Build one labeled contact sheet from the preview PNGs in D:/tmp/comfy/cards. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const DIR = resolve('D:/tmp/comfy/cards');
const COLS = 5;
const TW = 300;
const TH = 188; // 16:10 thumb
const LABEL = 22;
const GAP = 8;
const CW = TW;
const CH = TH + LABEL;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.png')).sort();
const rows = Math.ceil(files.length / COLS);
const W = COLS * CW + (COLS + 1) * GAP;
const H = rows * CH + (rows + 1) * GAP;

const composites = [];
for (let i = 0; i < files.length; i++) {
	const id = files[i].replace(/\.png$/, '');
	const col = i % COLS;
	const row = Math.floor(i / COLS);
	const x = GAP + col * (CW + GAP);
	const y = GAP + row * (CH + GAP);
	const thumb = await sharp(await readFile(resolve(DIR, files[i]))).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
	composites.push({ input: thumb, left: x, top: y });
	const label = Buffer.from(
		`<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#1b1b28"/><text x="6" y="16" font-family="sans-serif" font-size="14" fill="#e7e7f0">${id}</text></svg>`,
	);
	composites.push({ input: label, left: x, top: y + TH });
}

const out = resolve('D:/tmp/comfy/cards-contact.png');
await sharp({ create: { width: W, height: H, channels: 3, background: '#0e0e16' } })
	.composite(composites)
	.jpeg({ quality: 86 })
	.toFile(out.replace('.png', '.jpg'));
console.log('→', out.replace('.png', '.jpg'), `(${files.length} tiles)`);
