/* Throwaway: look at the belt crossing under the hen. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4338;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tectonique"]'));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${base}/jeux/tectonique/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tk-board');
const start = page.locator('.tk-start');
if (await start.count()) { try { await start.first().click(); } catch {} }
await sleep(400);

await page.locator('.tk-boardwrap').screenshot({ path: resolve('D:/tmp/tecto-cross-board.png') });

// Zoom on the hen and the four cells around her.
const hen = await page.locator('.tk-slab.hero').boundingBox();
await page.screenshot({
	path: resolve('D:/tmp/tecto-cross-zoom.png'),
	clip: { x: hen.x - hen.width * 0.6, y: hen.y - hen.height * 0.6, width: hen.width * 2.2, height: hen.height * 2.2 },
});
const dirs = () => page.evaluate(() => ({
	free: ['up', 'down', 'left', 'right'].filter((d) => !document.querySelector(`.tk-dbtn.${d}`).disabled),
	dim: ['up', 'down', 'left', 'right'].filter((d) => document.querySelector(`.tk-arw.${d}`).classList.contains('off')),
}));
console.log('fresh:', JSON.stringify(await dirs()));

/* The turntable has to travel with the hen, not stay on the cell she left. */
await page.keyboard.press('ArrowRight');
await sleep(120);
console.log('mid-slide gap (px):', await page.evaluate(() => {
	const h = document.querySelector('.tk-slab.hero').getBoundingClientRect();
	const c = document.querySelector('.tk-cross').getBoundingClientRect();
	return Math.round(Math.abs(h.x - c.x) + Math.abs(h.y - c.y));
}));
await page.locator('.tk-boardwrap').screenshot({ path: resolve('D:/tmp/tecto-cross-slide.png') });
await sleep(1800);

/* Push until a direction dies, and check its chevron went dim. */
for (let i = 0; i < 12; i++) {
	const d = await dirs();
	if (d.free.length < 4) break;
	await page.keyboard.press(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'][i % 4]);
	await sleep(1400);
}
console.log('after pushing:', JSON.stringify(await dirs()));
await page.locator('.tk-boardwrap').screenshot({ path: resolve('D:/tmp/tecto-cross-blocked.png') });

console.log('→ D:/tmp/tecto-cross-*.png');
await browser.close();
server.kill();
process.exit(0);
