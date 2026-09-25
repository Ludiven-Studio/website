/* Throwaway: preview the new /work/petanque-scanner/ page, desktop + mobile. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4351;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch();

for (const [name, width] of [['desktop', 1280], ['mobile', 420]]) {
	const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	await page.goto(`${base}/work/petanque-scanner/`, { waitUntil: 'networkidle' });
	// Gallery images are lazy — scroll them into view or the full-page shot is blank.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await sleep(1200);
	await page.evaluate(() => window.scrollTo(0, 0));
	await sleep(400);
	await page.screenshot({ path: resolve(`D:/tmp/petanque-${name}.png`), fullPage: true });
	await ctx.close();
}

await browser.close();
server.stop();
process.exit(0);
