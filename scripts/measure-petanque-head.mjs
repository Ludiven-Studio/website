/* Measurement: is the head readable? The complaint was "on ne voit pas les boules d'assez près pour
   évaluer la situation", and the cause was the look target — the camera stared at the ground 2.2 m
   in front of the circle while the boules sat 6 to 10 m out, so they lived a few pixels tall at the
   very top of the frame. Two numbers decide it, both read from the live camera:
     - `body`, the boule's on-screen diameter in CSS px;
     - `py`, how far down the frame it sits — a boule at py < 15 % of the height is at the horizon.
   Plays a few boules, then reads both at the circle, walked up, and in first person. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4370;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`THROW ${e.message}`));

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

const state = () => page.evaluate(() => window.__petanque());
const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.8;
const H = box.height;

async function throwOne() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, cy - 132, { steps: 12 });
	await sleep(250);
	await page.mouse.up();
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(400);
}

// Jack, then boules until both sides have something down.
for (let i = 0; i < 12; i++) {
	const s = await state();
	if (s.status !== 'aim' || s.match.turn !== 0) { await sleep(300); continue; }
	if (s.bs.filter((b) => b.side >= 0).length >= 3) break;
	await throwOne();
}

const report = async (tag) => {
	await sleep(1100); // the look target and the walk are both eased
	const s = await state();
	const ba = s.seen.filter((x) => x.side >= 0);
	if (!ba.length) { console.log(`${tag.padEnd(16)} nothing down`); return; }
	const body = Math.min(...ba.map((x) => x.body));
	const lowest = Math.min(...ba.map((x) => x.py));
	console.log(`${tag.padEnd(16)} boules=${ba.length} smallest=${body}px topmost=${Math.round((lowest / H) * 100)}% of frame `
		+ ba.map((x) => `[s${x.side} ${x.m}m ${x.body}px y${Math.round((x.py / H) * 100)}%]`).join(' '));
};

await report('at the circle');
for (let i = 0; i < 4; i++) { await page.keyboard.press('w'); await sleep(120); }
await report('walked +6 m');
await page.keyboard.press('v');
await report('first person');

await browser.close();
server.kill();
process.exit(0);
