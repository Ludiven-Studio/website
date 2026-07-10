/* Throwaway: in-game screenshot of the Esquive (3D/WebGL) canvas. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4324;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
	try { if ((await fetch(base)).ok) break; } catch {}
	await sleep(300);
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 520, height: 620 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["esquive"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.text().includes('esquive')) console.log('PAGE:', m.text()); });
page.on('requestfailed', (r) => console.log('FAIL:', r.url(), r.failure()?.errorText));
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`${base}/jeux/esquive/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.es-canvas');
await sleep(1000); // textures/nebula load
// Start and fly a moment so asteroids appear.
await page.evaluate(() => document.querySelectorAll('.tuto, .tuto-overlay').forEach((o) => (o.style.display = 'none')));
await page.evaluate(() => {
	const b = Array.from(document.querySelectorAll('button')).find((x) => /jouer|commencer/i.test(x.textContent || ''));
	b?.click();
});
await sleep(6500); // let asteroids populate and approach
await page.evaluate(() => document.querySelectorAll('.tuto, .tuto-overlay, .es-overlay').forEach((o) => (o.style.display = 'none')));
await sleep(120);
await page.locator('.es-canvas').screenshot({ path: resolve('D:/tmp/comfy/esquive-ingame.png') });
console.log('→ D:/tmp/comfy/esquive-ingame.png');
await browser.close();
server.kill();
