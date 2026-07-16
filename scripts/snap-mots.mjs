/* Throwaway: smoke-test the 3 new word games (mobile viewport) — console errors + screenshots. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4329;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const vp = { width: 375, height: 720 }; // iPhone SE-ish

async function shot(slug, sel, out, actions) {
	const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	const errors = [];
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(`${base}/jeux/${slug}/`, { waitUntil: 'networkidle' });
	await page.waitForSelector(sel, { timeout: 10000 });
	await page.evaluate(() => document.querySelector('.gt-overlay, [class*=tuto]')?.remove());
	await sleep(600);
	if (actions) await actions(page);
	await page.screenshot({ path: out, fullPage: false });
	console.log(`→ ${slug}: ${errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors'} — ${out}`);
	await ctx.close();
}

await shot('lettres-croisees', '.lc-wheel', resolve('D:/tmp/lc-mobile.png'));
await shot('mot-secret', '.ms-kb', resolve('D:/tmp/ms-mobile.png'), async (page) => {
	// type a guess with the on-screen keyboard state via physical keys
	await page.keyboard.type('ORDINATEUR'.slice(0, 9)); // over-length ignored beyond len
	await sleep(300);
});
await shot('meli-melo', '.mm-board', resolve('D:/tmp/mm-mobile.png'), async (page) => {
	await page.click('.mm-startbtn').catch(() => {});
	await sleep(500);
});
await browser.close();
server.kill();
process.exit(0);
