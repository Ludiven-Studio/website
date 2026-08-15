/* Throwaway: verify the level/score HUD is ABOVE the table (out of the play zone) in REAL
   fullscreen (the .gf-full class the site toggles), portrait — not the faux-fs sim. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4343;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await sleep(1200);

// WINDOWED (not fullscreen) portrait — measure banner vs canvas.
{
	await page.screenshot({ path: resolve(`${OUT}/billard-hud-windowed.png`) });
	const info = await page.evaluate(() => {
		const tag = document.querySelector('.bi-daily-tag'); const cv = document.querySelector('.bi-canvas');
		return { tag: tag?.getBoundingClientRect(), cv: cv?.getBoundingClientRect() };
	});
	console.log('WINDOWED banner bottom:', info.tag?.bottom, ' canvas top:', info.cv?.top,
		info.tag && info.cv ? (info.tag.bottom <= info.cv.top + 1 ? 'OK: above canvas' : 'OVERLAPS canvas') : 'n/a');
}

// Enter REAL fullscreen the way the site does: toggle the gf-full class + notify the game.
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	requestAnimationFrame(() => document.dispatchEvent(new Event('fullscreenchange')));
});
await sleep(1200);
await page.screenshot({ path: resolve(`${OUT}/billard-hud-fs.png`) });
console.log('→', `${OUT}/billard-hud-fs.png`);

// Report where the level banner sits vs the canvas top.
const info = await page.evaluate(() => {
	const tag = document.querySelector('.bi-daily-tag');
	const cv = document.querySelector('.bi-canvas');
	return { tag: tag?.getBoundingClientRect(), cv: cv?.getBoundingClientRect() };
});
console.log('banner bottom:', info.tag?.bottom, ' canvas top:', info.cv?.top,
	info.tag && info.cv ? (info.tag.bottom <= info.cv.top + 1 ? 'OK: above canvas' : 'OVERLAPS canvas') : 'n/a');

await browser.close();
server.kill();
