// Bakes the 1200×630 Open Graph previews for the /work/ portfolio pages.
//
//   npm run og:work
//
// Reads the `img:` of every src/content/work/*.md and writes
// public/assets/work/og/<slug>.jpg. BaseLayout picks these up on its own, and a
// page with no generated file just keeps the studio-logo fallback.
//
// JPEG is not a style choice: Reddit, Facebook and LinkedIn don't decode AVIF,
// and two of our heroes are .avif — sharing them raw yields an empty preview.

import sharp from 'sharp';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'content', 'work');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(PUB, 'assets', 'work', 'og');

const W = 1200;
const H = 630;
const BG = '#090b11'; // --gray-999, dark theme background

// Nobody displays the 1.91:1 we hand them: Reddit re-crops the card to ~1.75:1
// (eats 4% of the width per side), Twitter to 2:1 (eats the height). Our heroes
// carry their title flush left, so a full-bleed image loses the first letter of
// every line. Inset the hero inside a safe box and let the crops eat the margin.
const SAFE_W = Math.round(W * 0.88);
const SAFE_H = Math.round(H * 0.92);

await mkdir(OUT, { recursive: true });

const files = (await readdir(SRC)).filter((f) => f.endsWith('.md'));
let done = 0;
let skipped = 0;

for (const file of files) {
	const slug = file.replace(/\.md$/, '');
	const raw = await readFile(path.join(SRC, file), 'utf8');
	const match = raw.match(/^img:\s*(.+)$/m);
	if (!match) {
		console.log(`- ${slug}: no img: field, skipped`);
		skipped++;
		continue;
	}
	const rel = match[1].trim().replace(/^['"]|['"]$/g, '');
	const src = path.join(PUB, rel.replace(/^\//, ''));
	if (!existsSync(src)) {
		console.log(`- ${slug}: ${rel} not found, skipped`);
		skipped++;
		continue;
	}

	const meta = await sharp(src).metadata();

	// The margin is a blurred, darkened zoom of the hero itself, so the inset
	// reads as depth of field rather than as letterboxing.
	const backdrop = await sharp(src)
		.resize(W, H, { fit: 'cover' })
		.blur(28)
		.modulate({ brightness: 0.5 })
		.flatten({ background: BG })
		.toBuffer();

	let fg = sharp(src).resize(SAFE_W, SAFE_H, { fit: 'inside' });
	// Logos ship with alpha — sit them on a clean panel instead of the blur.
	if (meta.hasAlpha) fg = fg.flatten({ background: BG });

	await sharp(backdrop)
		.composite([{ input: await fg.toBuffer(), gravity: 'center' }])
		.jpeg({ quality: 82, mozjpeg: true })
		.toFile(path.join(OUT, `${slug}.jpg`));

	console.log(`OK ${slug.padEnd(20)} ${meta.width}x${meta.height} ${meta.format}`);
	done++;
}

console.log(`\n${done} generated, ${skipped} skipped -> public/assets/work/og/`);
