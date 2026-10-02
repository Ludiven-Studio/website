/* Chapter 6 map puzzle, played through: pieces scattered and turned, one dropped in the wrong way (hint),
   all turned and dragged home, then the riddle (flip, tap the bench). Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-map.mjs [out dir]   (default D:/tmp/atelier-map) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-map');
await mkdir(OUT, { recursive: true });
const PORT = 4387;
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
		for (const p of data.PROJECTS) { st.progress[p.id] = p.steps; if (p.id === 'fauteuil') break; }
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = ['etabli', 'lampe', 'photo', 'etageres', 'menuiserie', 'couture', 'bureau'];
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	if (!(await page.locator('.at-shop').count())) await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-office .at-btn', { hasText: 'Assembler la carte' }).click();
	await page.waitForSelector('.at-assemble');
	await sleep(400);
	await page.screenshot({ path: `${OUT}/1-scattered.png` });

	// The piece's own centre (home centre + its translate), not its bounding box: that one spans the unclipped map.
	const center = (k) => page.locator(`[data-bit="${k}"]`).evaluate((g, k) => {
		const c = [[62, 55], [145, 56], [74, 106], [156, 118]][k];
		// The browser may shorten translate(0px, 0px) to translate(0px).
		const m = g.style.transform.match(/translate\(([^,)]+)(?:,\s*([^)]+))?\)/);
		const p = new DOMPoint(c[0] + parseFloat(m[1]), c[1] + parseFloat(m[2] ?? '0')).matrixTransform(g.ownerSVGElement.getScreenCTM());
		return { x: p.x, y: p.y };
	}, k);
	const home = (k) => page.evaluate((k) => {
		const c = [[62, 55], [145, 56], [74, 106], [156, 118]][k];
		const svg = document.querySelector('.at-assemble');
		const p = new DOMPoint(c[0], c[1]).matrixTransform(svg.getScreenCTM());
		return { x: p.x, y: p.y };
	}, k);
	const turnsOf = (k) => page.locator(`[data-bit="${k}"]`).evaluate((g) => { const m = g.style.transform.match(/rotate\((-?\d+)deg\)/); return Math.round(Number(m[1]) / 90); });
	const tap = async (k) => { const c = await center(k); await page.mouse.click(c.x, c.y); await sleep(320); };
	const dragHome = async (k) => {
		const a = await center(k), b = await home(k);
		await page.mouse.move(a.x, a.y); await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
		await sleep(350);
	};

	// Piece 0 dropped home the wrong way round: no snap, a hint; one tap at a time until it fits.
	await dragHome(0);
	if (await page.locator('[data-bit="0"].placed').count()) fails.push('piece 0 snapped while turned');
	if (!(await page.locator('.at-puzzle .at-small', { hasText: 'pas le bon sens' }).count())) fails.push('no hint for a turned piece at home');
	await page.screenshot({ path: `${OUT}/2-wrong-way.png` });
	for (let i = 0; i < 4 && !(await page.locator('[data-bit="0"].placed').count()); i++) await tap(0);
	if (!(await page.locator('[data-bit="0"].placed').count())) fails.push('piece 0 never snapped by turning it in place');
	for (const k of [1, 2, 3]) {
		const t = ((4 - (await turnsOf(k)) % 4) % 4);
		for (let i = 0; i < t; i++) await tap(k);
		await dragHome(k);
		if (!(await page.locator(`[data-bit="${k}"].placed`).count())) fails.push(`piece ${k} did not snap`);
		if (k === 2) await page.screenshot({ path: `${OUT}/3-three-placed.png` });
	}
	await page.screenshot({ path: `${OUT}/4-whole.png` });
	const riddle = await page.waitForSelector('.at-puzzle .at-btn:has-text("Retourner la carte")', { timeout: 4000 }).catch(() => null);
	if (!riddle) throw new Error(`riddle step not reached; ${fails.join('; ')}`);
	await riddle.click();
	await sleep(1800);
	await page.screenshot({ path: `${OUT}/5-flipped.png` });
	await page.locator('.at-zone', { hasText: 'Établi' }).click();
	await sleep(500);
	if (await page.locator('.at-puzzle').count()) fails.push('puzzle still open after the right zone');
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
