/* Chapter 12 spyglass puzzle, played through: a cove tapped too early (hint), the scope turned past the village to
   the port, a wrong cove (hint), the right one, then the scene goes on. Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-longuevue.mjs [out dir]   (default D:/tmp/atelier-longuevue) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-longuevue');
await mkdir(OUT, { recursive: true });
const PORT = 4389;
const ISLE = { x: 130, y: 128 };
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
		for (const p of data.PROJECTS) { if (p.id === 'mouette') { st.progress[p.id] = 2; break; } st.progress[p.id] = p.steps; }
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = ['etabli', 'lampe', 'photo', 'etageres', 'menuiserie', 'couture', 'bureau', 'souvenirs', 'hangar'];
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		st.board[0] = 'marin:4'; st.board[1] = 'tissu:3';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	if (!(await page.locator('.at-orders').count())) await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await page.locator('.at-order.story .at-give').click();
	await page.waitForSelector('.atl-board', { timeout: 5000 }).catch(() => { throw new Error('no spyglass puzzle after delivering La Mouette step 3'); });
	await sleep(400);
	await page.screenshot({ path: `${OUT}/1-start.png` });

	const at = (deg, r) => page.evaluate(({ deg, r, I }) => {
		const a = (deg * Math.PI) / 180;
		const q = new DOMPoint(I.x + r * Math.cos(a), I.y + r * Math.sin(a)).matrixTransform(document.querySelector('.atl-board').getScreenCTM());
		return { x: q.x, y: q.y };
	}, { deg, r, I: ISLE });
	const tapCove = async (deg) => { const p = await at(deg, 46); await page.mouse.click(p.x, p.y); await sleep(300); };
	const turnTo = async (from, to) => {
		const a = await at(from, 100);
		await page.mouse.move(a.x, a.y); await page.mouse.down();
		const step = to > from ? 10 : -10;
		for (let d = from; step > 0 ? d <= to : d >= to; d += step) { const p = await at(d, 100); await page.mouse.move(p.x, p.y, { steps: 2 }); }
		await page.mouse.up();
		await sleep(300);
	};
	await tapCove(200);
	if (!(await page.locator('.atg .at-small', { hasText: 'D’abord' }).count())) fails.push('no hint for a cove tapped before finding the port');
	await turnTo(320, 470); // through east to the village at 110
	if (!(await page.locator('.atl-lens-wrap', { hasText: 'village' }).count())) fails.push('lens does not show the village at 110');
	await page.screenshot({ path: `${OUT}/2-village.png` });
	await turnTo(110, 200);
	if (!(await page.locator('.atl-lens-wrap', { hasText: 'port' }).count())) fails.push('lens does not show the port at 200');
	await page.screenshot({ path: `${OUT}/3-port.png` });
	await tapCove(20);
	if (!(await page.locator('.atg .at-small', { hasText: 'large' }).count())) fails.push('no hint for the cove opposite the port');
	await tapCove(200);
	if (!(await page.locator('.atg .at-small', { hasText: 'Lucas entoure' }).count())) fails.push('right cove not accepted');
	await sleep(400);
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
