/* Throwaway: preview the new /work/petanque-scanner/ page, desktop + mobile. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4351;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();

for (const [name, width] of [['desktop', 1280], ['mobile', 420]]) {
	const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
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
server.kill();
process.exit(0);
