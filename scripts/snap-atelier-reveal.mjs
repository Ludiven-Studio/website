/* Upgrade reveal capture: buys "Dégager l'établi" then "Rallumer la lampe", shoots the scene over time and checks
   the next client waits for the reveal to end. Fails on console errors.
   Usage: node scripts/snap-atelier-reveal.mjs [out dir]   (default D:/tmp/atelier-reveal) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-reveal');
await mkdir(OUT, { recursive: true });
const PORT = 4372;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
const fails = [];
try {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
	await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
	const closeTalks = async () => {
		while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(150); }
	};
	const buy = async (name, tag) => {
		await page.locator('.at-tab', { hasText: 'Atelier' }).click();
		await page.locator('.at-up', { hasText: name }).locator('button').click();
		const t0 = Date.now();
		// Screenshots are slow: freeze the CSS animations and seek them, so each frame is at its stated time.
		for (const t of [200, 800, 1400, 2400]) {
			await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), t);
			await page.locator('.at-scene').screenshot({ path: `${OUT}/${tag}-${t}.png` });
		}
		if (await page.locator('.at-talk').count()) fails.push(`${tag}: a scene opened during the reveal`);
		await sleep(Math.max(0, 5000 - (Date.now() - t0)));
		if (await page.locator('.at-reveal').count()) fails.push(`${tag}: reveal still up after 5 s`);
	};

	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	await closeTalks();
	await page.evaluate(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.coins = 60;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	await closeTalks();
	await buy('Dégager l’établi', 'etabli');
	if (!(await page.locator('.at-talk').count())) fails.push('etabli: no client arrival after the reveal');
	await page.screenshot({ path: `${OUT}/etabli-after.png` });
	await closeTalks();

	await page.evaluate(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.progress.montre = 1; st.coins = 60;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	await closeTalks();
	await buy('Rallumer la lampe', 'lampe');
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
