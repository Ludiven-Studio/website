/* Throwaway: look at the Circuit bulbs — unlit vs lit, and how they read on a 9x9. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4341;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["circuit"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const shot = (name) => page.locator('.cir-boardwrap').screenshot({ path: resolve(`D:/tmp/circuit-${name}.png`) });
const gauge = () => page.locator('.cir-gauge').textContent();

async function fresh(label) {
	await page.goto(`${base}/jeux/circuit/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.dt-seg');
	// The game opens on Niveaux; free play is where the pills and the ungated hint live.
	await page.locator('.dt-seg', { hasText: 'Libre' }).click();
	await page.waitForSelector('.cir-board');
	if (label) {
		await page.locator('.cir-pill', { hasText: label }).click();
		await page.waitForSelector('.cir-board');
	}
	await sleep(400);
}

/* ---- 1. A fresh 5x5: bulbs should be dark glass, the lit ones filled. ---- */
await fresh();
console.log('--- facile, fresh ---', await gauge());
console.log('bulbs on the board:', await page.locator('.cir-glass').count(), '· sockets:', await page.locator('.cir-socket').count());
await shot('1-facile-fresh');

console.log('buttons:', await page.evaluate(() =>
	[...document.querySelectorAll('.cir-root button')].map((b) => `${b.className}|${b.textContent.trim().slice(0, 24)}|off=${b.disabled}`)));

/* ---- 2. Solve it with hints: every bulb must end up lit. ---- */
const hintBtn = page.locator('.cir-act').first();
for (let i = 0; i < 60 && !(await page.locator('.cir-win').count()); i++) {
	if (!(await hintBtn.count()) || await hintBtn.isDisabled()) break;
	await hintBtn.click();
	await sleep(120);
	if (i === 6) await shot('2-facile-half');
}
console.log('--- after hints ---', await gauge().catch(() => '(won)'));
await sleep(400);
await shot('3-facile-solved');

/* ---- 3. A 9x9: the bulb has to survive a small cell. ---- */
await fresh('Difficile');
console.log('--- difficile, fresh ---', await gauge());
await shot('4-difficile-fresh');

console.log('→ D:/tmp/circuit-*.png');
await browser.close();
server.kill();
process.exit(0);
