/* Throwaway: does the throwing circle actually draw, and do the new views read?
   The circle was invisible because a FLAT ring sinks under a terrain with centimetre relief, so the
   only honest test is a picture from a camera that is not directly above it. Also steps up the lane
   and into first person, which is what makes the head readable. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4369;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(700);
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1500);

const shot = async (tag) => {
	const s = await page.evaluate(() => window.__petanque());
	console.log(`${tag.padEnd(14)} view=${s.view} walk=${s.walk.toFixed(1)}m bodies=${s.bodies}`);
	await page.screenshot({ path: resolve(`${OUT}/pet-view-${tag}.png`) });
};

await shot('1-shoulder');
for (let i = 0; i < 4; i++) { await page.keyboard.press('w'); await sleep(120); }
await sleep(900);
await shot('2-walked');
await page.keyboard.press('v');
await sleep(900);
await shot('3-first');
await page.keyboard.press('v');
await sleep(900);
await shot('4-over');

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.kill();
process.exit(0);
