/* Chapter replay from the workshop's "Carnet des chapitres": chapter 1 played through (the gears puzzle shows), then
   chapter 2 left early with "Quitter". The save must come out unchanged. Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-replay.mjs [out dir]   (default D:/tmp/atelier-replay) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-replay');
await mkdir(OUT, { recursive: true });
const PORT = 4393;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
const fails = [];
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true });
	await page.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.evaluate(async () => {
		const engine = await import('/src/games/atelier/engine.ts');
		const data = await import('/src/games/atelier/data.ts');
		const st = engine.newGame(Date.now(), 7);
		for (const p of data.PROJECTS) { if (p.id === 'boussole') break; st.progress[p.id] = p.steps; }
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = ['etabli', 'lampe', 'photo', 'etageres', 'menuiserie', 'couture', 'bureau', 'souvenirs'];
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	const saveOf = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ludiven-atelier')); return JSON.stringify([s.progress, s.done, s.seen, s.coins, s.rep, s.upgrades]); });
	const before = await saveOf();
	if (!(await page.locator('.at-shop').count())) await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-chapters summary').click();
	await sleep(300);
	await page.locator('.at-chapters').scrollIntoViewIfNeeded();
	await page.locator('.at-chapters').screenshot({ path: `${OUT}/1-carnet.png` });
	const rows = await page.locator('.at-chapters-row').count();
	if (rows !== 7) fails.push(`carnet lists ${rows} chapters, expected 7 (season 1)`);

	// Chapter 1 through: dialogues with "Suite", the gears puzzle skipped, to the end.
	await page.locator('.at-chapters-row', { hasText: 'montre' }).locator('.at-btn', { hasText: 'Rejouer' }).click();
	let sawGears = false, steps = 0;
	while (steps++ < 40) {
		await sleep(250);
		if (await page.locator('.atg-board').count()) {
			sawGears = true;
			await page.screenshot({ path: `${OUT}/2-gears.png` });
			await page.locator('.at-talk .at-link', { hasText: 'Passer' }).click();
			continue;
		}
		const next = page.locator('.at-talk-nav .at-btn:not(.ghost)');
		if (!(await next.count())) break;
		await sleep(700); // restoration reveal: the button waits for the object to turn
		await next.click();
	}
	if (!sawGears) fails.push('chapter 1 replay never showed the gears puzzle');
	if (await page.locator('.at-talk').count()) fails.push('chapter 1 replay did not end');

	// Chapter 2, left at once: every replay scene goes.
	await page.locator('.at-chapters-row', { hasText: 'radio' }).locator('.at-btn', { hasText: 'Rejouer' }).click();
	await page.waitForSelector('.at-talk');
	await page.screenshot({ path: `${OUT}/3-radio-arrival.png` });
	if (!(await page.locator('.at-talk', { hasText: 'Précédemment' }).count())) fails.push('chapter 2 replay has no recap line');
	await page.locator('.at-talk-nav .at-btn.ghost', { hasText: 'Quitter' }).click();
	await sleep(300);
	if (await page.locator('.at-talk').count()) fails.push('"Quitter" left replay scenes behind');
	if ((await saveOf()) !== before) fails.push('the save changed during a replay');
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
