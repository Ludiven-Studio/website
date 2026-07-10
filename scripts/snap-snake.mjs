/* Throwaway: clean mid-game screenshot of the Snake canvas (steers it to stay alive). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4322;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
	try {
		if ((await fetch(base)).ok) break;
	} catch {}
	await sleep(300);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 620 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["snake"]'));
const page = await ctx.newPage();
await page.goto(`${base}/jeux/snake/`, { waitUntil: 'networkidle' });
// Mark the tutorial seen, then reload so it never auto-opens.
await page.evaluate(() => localStorage.setItem('ludiven-tuto-seen', '["snake"]'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sn-canvas');
await sleep(900); // let the bg + apple sprite load and the board draw
// Hide every overlay (tutorial + start/gameover) so only the board shows.
await page.evaluate(() => document.querySelectorAll('.tuto-overlay, .tuto, .sn-overlay').forEach((o) => (o.style.display = 'none')));
await sleep(150);
await page.$eval('.sn-canvas', (el) => el.scrollIntoView());
await page.locator('.sn-canvas').screenshot({ path: resolve('D:/tmp/comfy/snake-ingame.png') });
console.log('→ D:/tmp/comfy/snake-ingame.png');
await browser.close();
server.kill();
