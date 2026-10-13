/*
 * Card art for the optical-illusion pages: the illusion itself is the picture, so each
 * page's [data-art] element is captured instead of prompting a key-art scene.
 *
 *   npm run build && node scripts/illusion-art.mjs            # all illusion pages
 *   node scripts/illusion-art.mjs stereogrammes              # only these ids
 *   ART_BASE=http://localhost:4390 node scripts/illusion-art.mjs   # reuse a running server
 *
 * Writes public/assets/jeux/<id>.jpg (card 1200×750), tile/<id>.jpg, art/<id>.jpg
 * (blurred backdrop) and og/<id>.jpg (1200×630 share preview).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';
import { tile } from './game-tiles.mjs';

const OUT = resolve('public/assets/jeux');
const PORT = 4396;
const TITLES = {
	stereogrammes: 'Images 3D cachées',
	'image-remanente': 'Couleurs fantômes',
	'oeil-mesureur': "L'Œil mesureur",
	'mouvement-illusoire': 'Ça bouge !',
	'meme-couleur': 'Même couleur ?',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

/** Bottom plaque for the share preview: title + domain over a dark scrim. */
const plaque = (title, W, H) =>
	Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
	<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0.55" stop-color="#0a0810" stop-opacity="0"/><stop offset="1" stop-color="#0a0810" stop-opacity="0.9"/>
	</linearGradient></defs>
	<rect width="${W}" height="${H}" fill="url(#g)"/>
	<text x="56" y="${H - 92}" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="600" fill="#e9d8ff">👁 Illusion d'optique</text>
	<text x="56" y="${H - 40}" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#fff">${esc(title)}</text>
	<text x="${W - 56}" y="${H - 40}" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="600" fill="#ffffffcc">ludiven-studio.fr</text>
</svg>`);

async function main() {
	const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
	const targets = ids.length ? ids : Object.keys(TITLES);
	for (const d of ['tile', 'art', 'og']) await mkdir(resolve(OUT, d), { recursive: true });

	let server = null;
	let base = process.env.ART_BASE;
	if (!base) {
		server = await startServer(PORT);
		base = server.base;
	}
	const browser = await chromium.launch();
	try {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
		await ctx.addInitScript((list) => {
			localStorage.setItem('ludiven-tuto-seen', JSON.stringify(list));
			localStorage.setItem('theme', 'light');
		}, targets);
		const page = await ctx.newPage();
		for (const id of targets) {
			await page.goto(`${base}/jeux/${id}/`, { waitUntil: 'networkidle' });
			// Only present when ART_BASE is a dev server: its toolbar floats over the page.
			await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
			const el = page.locator('[data-art]').first();
			await el.waitFor();
			await el.scrollIntoViewIfNeeded();
			await page.waitForTimeout(1200); // canvases draw after layout settles
			const shot = await el.screenshot({ animations: 'disabled' });

			const card = resolve(OUT, `${id}.jpg`);
			await sharp(shot).resize(1200, 750, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toFile(card);
			await tile(card, resolve(OUT, 'tile', `${id}.jpg`));
			await sharp(card).resize(640).blur(5).jpeg({ quality: 58 }).toFile(resolve(OUT, 'art', `${id}.jpg`));
			await sharp(shot)
				.resize(1200, 630, { fit: 'cover' })
				.composite([{ input: plaque(TITLES[id] ?? id, 1200, 630), top: 0, left: 0 }])
				.jpeg({ quality: 86, mozjpeg: true })
				.toFile(resolve(OUT, 'og', `${id}.jpg`));
			console.log(`  ✓ ${id}`);
		}
	} finally {
		await browser.close();
		server?.stop();
	}
}

await main();
