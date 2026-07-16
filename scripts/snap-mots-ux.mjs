/* Throwaway: verify the 3 UX fixes — MM end overlay (time-shifted), MS row ✓ button, LC hint button. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4329;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 720 }, deviceScaleFactor: 2 });
const errors = [];

async function open(slug, sel) {
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`${slug}: ${m.text()}`); });
	page.on('pageerror', (e) => errors.push(`${slug}: ${e}`));
	await page.goto(`${base}/jeux/${slug}/`, { waitUntil: 'networkidle' });
	await page.waitForSelector(sel);
	await page.evaluate(() => document.querySelector('.tuto-overlay')?.remove());
	await sleep(500);
	return page;
}

// Méli-Mélo: start, then time-shift Date.now +91s → end overlay must appear
{
	const page = await open('meli-melo', '.mm-board');
	await page.click('.mm-startbtn');
	await sleep(400);
	await page.evaluate(() => { const orig = Date.now.bind(Date); Date.now = () => orig() + 91_000; });
	await sleep(600); // next 100ms tick fires endRun
	const overlay = await page.locator('.mm-overlay-card.end').count();
	await page.screenshot({ path: resolve('D:/tmp/mm-end.png') });
	console.log(`MM: end overlay visible = ${overlay === 1}`);
	await page.close();
}

// Mot Secret: type a full word → row ✓ button enabled, click it → row evaluated
{
	const page = await open('mot-secret', '.ms-kb');
	await page.keyboard.type('AAAAAAA'); // fills up to len (first letter fixed)
	await sleep(300);
	await page.screenshot({ path: resolve('D:/tmp/ms-rowok.png') });
	const enabled = await page.locator('.ms-rowok:not([disabled])').count();
	await page.click('.ms-rowok').catch(() => {});
	await sleep(400);
	console.log(`MS: row ✓ enabled = ${enabled === 1} (click submitted → shake/msg if invalid word)`);
	await page.close();
}

// Lettres Croisées: hint button visible with countdown, wait out cooldown, click → a word reveals
{
	const page = await open('lettres-croisees', '.lc-wheel');
	const label0 = await page.locator('.lc-hint').textContent();
	console.log(`LC: hint label at start = "${label0.trim()}"`);
	await page.waitForSelector('.lc-hint:not([disabled])', { timeout: 40000 });
	await page.click('.lc-hint');
	await sleep(700);
	const revealed = await page.locator('.lc-cell.on').count();
	await page.screenshot({ path: resolve('D:/tmp/lc-hint.png') });
	console.log(`LC: cells revealed after hint = ${revealed} (expect ≥3)`);
	await page.close();
}

console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors');
await browser.close();
server.kill();
process.exit(0);
