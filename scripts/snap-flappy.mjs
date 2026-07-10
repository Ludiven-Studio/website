/* Throwaway: clean in-game screenshot of the Flappy canvas (flaps to stay alive). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4323;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
	try { if ((await fetch(base)).ok) break; } catch {}
	await sleep(300);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 620 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/flappy/`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('ludiven-tuto-seen', '["flappy"]'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.fl-canvas');
await sleep(800); // let the sky image load and the scene draw
// Ready state (cocotte centered), overlays hidden.
await page.evaluate(() => document.querySelectorAll('.tuto, .tuto-overlay, .fl-overlay').forEach((o) => (o.style.display = 'none')));
await sleep(120);
const out = resolve('D:/tmp/comfy/flappy-ingame.png');
await page.locator('.fl-canvas').screenshot({ path: out });
// Zoomed crop around the hen (birdX≈28%, birdY≈50%) so the design is visible.
const sharp = (await import('sharp')).default;
const m = await sharp(out).metadata();
const s = Math.round(m.width * 0.34);
await sharp(out)
	.extract({ left: Math.round(m.width * 0.28 - s / 2), top: Math.round(m.height * 0.5 - s / 2), width: s, height: s })
	.resize(320, 320, { kernel: 'nearest' })
	.png()
	.toFile(resolve('D:/tmp/comfy/flappy-hen.png'));
console.log('→', out, '+ flappy-hen.png');
await browser.close();
server.kill();
