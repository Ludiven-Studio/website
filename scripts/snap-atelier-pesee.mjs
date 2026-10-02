/* Chapter 22 weighing puzzle, played through: a guess with no weighing (caught out), unequal pans (refused), then
   2 v 2 and 1 v 1, the heavy weight named, the scene goes on. Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-pesee.mjs [out dir]   (default D:/tmp/atelier-pesee) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-pesee');
await mkdir(OUT, { recursive: true });
const PORT = 4391;
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
		for (const p of data.PROJECTS) { if (p.id === 'balance') { st.progress[p.id] = 2; break; } st.progress[p.id] = p.steps; }
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = data.UPGRADES.map((u) => u.id);
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		st.board[0] = 'soin:4'; st.board[1] = 'elec:2';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	if (!(await page.locator('.at-orders').count())) await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await page.locator('.at-order.story .at-give').click();
	await page.waitForSelector('.atp-board', { timeout: 5000 }).catch(() => { throw new Error('no weighing puzzle after delivering the scale step 3'); });
	await sleep(400);
	await page.screenshot({ path: `${OUT}/1-start.png` });

	const say = (t) => page.locator('.atg .at-small', { hasText: t }).count();
	const tap = async (k, times = 1) => {
		for (let i = 0; i < times; i++) {
			const b = await page.locator(`[data-weight="${k}"] path`).boundingBox();
			await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
			await sleep(560);
		}
	};
	const weigh = () => page.locator('.atg .at-btn', { hasText: 'Peser' }).click().then(() => sleep(700));
	const name = async (k) => { await page.locator('.atg .at-btn', { hasText: 'Désigner' }).click(); await tap(k); };

	await name(2);
	if (!(await say('Pas sûr'))) fails.push('a guess with no weighing was accepted');
	await tap(0); await tap(1); await tap(2, 2); await weigh();
	if (!(await say('même nombre'))) fails.push('unequal pans were weighed');
	await tap(3, 2); await weigh(); // 0,1 left v 2,3 right
	if (!(await say('équilibre'))) fails.push('first weighing did not balance (adversary should keep 4,5)');
	await page.screenshot({ path: `${OUT}/2-two-v-two.png` });
	for (const k of [1, 2, 3]) await tap(k, k === 1 ? 2 : k === 2 ? 1 : 1); // 1 → tray, 2 → tray, 3 → tray
	await tap(0, 2); // 0 (known good) → tray
	await tap(4); await tap(0); await tap(0); // 4 left, 0 right
	await weigh();
	await page.screenshot({ path: `${OUT}/3-one-v-one.png` });
	const heavy = (await say('gauche')) ? 4 : 5;
	await name(heavy);
	if (!(await say('Une balance juste'))) fails.push(`heavy weight n° ${heavy + 1} not accepted`);
	await sleep(500);
	await page.screenshot({ path: `${OUT}/4-solved.png` });
	await page.waitForSelector('.at-talk .at-line', { timeout: 4000 }).catch(() => fails.push('scene did not go on after the puzzle'));
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
