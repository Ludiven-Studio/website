/* Chapter 1 gears puzzle, played through: deliver the watch's step 2, jam a wheel (hint), place the chain, the hand
   turns, then the scene goes on. Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-gears.mjs [out dir]   (default D:/tmp/atelier-gears) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-gears');
await mkdir(OUT, { recursive: true });
const PORT = 4388;
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
		st.progress.montre = 1;
		st.done = ['garnier-1', 'lucas-1', 'morel-1', 'garnier-2'];
		st.upgrades = ['etabli'];
		st.seen = ['intro', 'arrival:montre', 'rep-5'];
		st.tut = 4;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		st.board[0] = 'outil:4'; st.board[1] = 'meca:5';
		void data;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	await page.locator('.at-order.story .at-give').click();
	await page.waitForSelector('.atg-board', { timeout: 5000 }).catch(() => { throw new Error('no gears puzzle after delivering step 2'); });
	await sleep(400);
	await page.screenshot({ path: `${OUT}/1-start.png` });

	const pegXY = (k) => page.evaluate((k) => {
		const CHAIN = [{ r: 30, a: 0 }, { r: 22, a: -40 }, { r: 16, a: 35 }, { r: 28, a: -20 }, { r: 12, a: 30 }];
		const pegs = [{ x: 50, y: 112 }];
		for (let i = 1; i < CHAIN.length; i++) {
			const p = pegs[i - 1], d = CHAIN[i - 1].r + CHAIN[i].r, a = (CHAIN[i].a * Math.PI) / 180;
			pegs.push({ x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) });
		}
		const q = new DOMPoint(pegs[k].x, pegs[k].y).matrixTransform(document.querySelector('.atg-board').getScreenCTM());
		return { x: q.x, y: q.y };
	}, k);
	const wheelXY = (w) => page.locator(`[data-wheel="${w}"]`).evaluate((g) => {
		const m = g.transform.baseVal.consolidate().matrix;
		const q = new DOMPoint(m.e, m.f).matrixTransform(g.ownerSVGElement.getScreenCTM());
		return { x: q.x, y: q.y };
	});
	const put = async (w, peg) => {
		const a = await wheelXY(w), b = await pegXY(peg);
		await page.mouse.move(a.x, a.y); await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
		await sleep(350);
	};
	// Wheels in the tray: 0 = r28, 1 = r22, 2 = r16. The big one on peg 1 jams against the barrel.
	await put(0, 1);
	if (!(await page.locator('.atg .at-small', { hasText: 'se coince' }).count())) fails.push('no jam hint for the big wheel on peg 1');
	await page.screenshot({ path: `${OUT}/2-jam.png` });
	await put(1, 1); // swaps: the big one goes back to the tray
	await put(2, 2);
	await page.screenshot({ path: `${OUT}/3-two.png` });
	await put(0, 3);
	if (!(await page.locator('.atg .at-small', { hasText: 'Tic, tac' }).count())) fails.push('chain placed but the hand does not turn');
	await sleep(500);
	await page.screenshot({ path: `${OUT}/4-solved.png` });
	await page.waitForSelector('.at-talk .at-line', { timeout: 4000 }).catch(() => fails.push('scene did not go on after the puzzle'));
	await sleep(300);
	await page.screenshot({ path: `${OUT}/5-scene.png` });
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
