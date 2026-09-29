/* Play the Atelier des Souvenirs opening on a phone viewport and screenshot every beat:
   intro, first tap, first merge, first delivery, the bench upgrade, the watch's arrival.
   Also fails loudly on any console error.

   Usage: node scripts/snap-atelier.mjs [out dir]   (default D:/tmp/atelier) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier');
await mkdir(OUT, { recursive: true });
const PORT = 4361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
try {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
	await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	const page = await ctx.newPage();
	// The dev server has no sw.js: its registration 404 is not the game's.
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
	const shot = async (name) => { await sleep(450); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	await page.locator('.at-root').scrollIntoViewIfNeeded();
	await shot('01-intro');
	// Read through the intro.
	while (await page.locator('.at-talk').count()) {
		await page.locator('.at-talk-nav .at-btn:not(.ghost)').click();
		await sleep(150);
	}
	await page.locator('.at-hud').scrollIntoViewIfNeeded();
	await shot('02-board');

	const cellBox = async (i) => page.locator('.at-cell').nth(i).boundingBox();
	const tap = async (i) => { const b = await cellBox(i); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(250); };
	const dragCells = async (a, b) => {
		const A = await cellBox(a), B = await cellBox(b);
		await page.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
		await page.mouse.down();
		for (let k = 1; k <= 10; k++) {
			await page.mouse.move(A.x + A.width / 2 + ((B.x - A.x) * k) / 10, A.y + A.height / 2 + ((B.y - A.y) * k) / 10);
			await sleep(16);
		}
		await page.mouse.up();
		await sleep(300);
	};
	const board = async () => page.evaluate(() => JSON.parse(localStorage.getItem('ludiven-atelier')).board);

	const boite = (await board()).indexOf('g:boite');
	await tap(boite);
	await shot('03-first-tap');
	let b = await board();
	const outils = b.map((p, i) => (p === 'outil:1' ? i : -1)).filter((i) => i >= 0);
	console.log('outil:1 cells', outils);
	await dragCells(outils[0], outils[1]);
	await shot('04-merged');
	await page.locator('.at-give:not([disabled])').first().click();
	await shot('05-delivered');
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await shot('06-atelier-dusty');
	await page.locator('.at-up .at-btn').first().click();
	await shot('07-arrival');
	while (await page.locator('.at-talk').count()) {
		await page.locator('.at-talk-nav .at-btn:not(.ghost)').click();
		await sleep(150);
	}
	await shot('08-orders');
	// Tap an item to show the info panel.
	b = await board();
	const any = b.findIndex((p) => p && !p.startsWith('g:'));
	if (any >= 0) { await tap(any); await shot('09-info'); }
	// Drag the tray toward the generator to see a drag in flight.
	const tiroir = b.indexOf('g:tiroir');
	await tap(tiroir);
	await tap(tiroir);
	await shot('10-tiroir');
	await page.locator('.at-energy').click();
	await shot('11-energy');
	await page.locator('.at-card .at-btn.ghost').click();

	// Jump the story forward by editing the save, then look at the workshop at each stage.
	const patch = async (fn, arg) => {
		await page.evaluate(fn, arg);
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForSelector('.at-root');
		await page.locator('.at-hud').scrollIntoViewIfNeeded();
	};
	await patch(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.board[0] = 'soin:3';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.locator('.at-order.story .at-give').click();
	await sleep(1400);
	await shot('12-restore-1');
	for (let k = 0; k < 2; k++) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(300); }
	await shot('12b-rep-tier');
	await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(500);
	await shot('12c-postcard');
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(150); }
	await patch(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.coins = 200; st.board[0] = 'outil:4'; st.board[1] = 'meca:5';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-up', { hasText: 'lampe' }).locator('.at-btn').click();
	await shot('13-atelier-lamp');
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await page.locator('.at-order.story .at-give').click();
	await sleep(1400);
	await shot('14-restore-2');
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(150); }
	await patch(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.board[0] = 'soin:4'; st.board[1] = 'meca:3';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.locator('.at-order.story .at-give').click();
	await sleep(1400);
	await shot('15-restore-3');
	await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(500);
	await shot('16-restore-3-reveal');
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(150); }
	await shot('17-atelier-done');
	await page.locator('.at-up', { hasText: 'photo' }).locator('.at-btn').click();
	await shot('18-epilogue');
	// The epilogue hands over to chapter 2: Mme Garnier walks in with her radio.
	const next = () => page.locator('.at-talk-nav .at-btn:not(.ghost)').click();
	for (let k = 0; k < 3; k++) { await next(); await sleep(250); }
	await shot('19-radio-arrival');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await shot('20-radio-orders');
	const deliverStory = async (pieces, name) => {
		await patch((ps) => {
			const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
			ps.forEach((p, k) => { st.board[k] = p; });
			st.coins = Math.max(st.coins, 200);
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
		}, pieces);
		await page.locator('.at-order.story .at-give').click();
		await sleep(1400);
		await shot(name);
	};
	await deliverStory(['soin:3', 'outil:2'], '21-radio-1');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-up', { hasText: 'étagères' }).locator('.at-btn').click();
	await page.locator('.at-scene').scrollIntoViewIfNeeded();
	await shot('22-etageres');
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('23-caisse-on-board');
	await deliverStory(['elec:4', 'outil:3'], '24-radio-2');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['elec:5', 'meca:4'], '25-radio-3');
	await next(); await sleep(500);
	await shot('26-broadcast');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-scene').scrollIntoViewIfNeeded();
	await shot('27-atelier-ch2-done');
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('28-voilier-orders');
	// Chapter 3: Lucas's sailboat, then Lucile's box comes in.
	await deliverStory(['soin:3', 'outil:3'], '29-voilier-1');
	await next(); await sleep(400);
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-up', { hasText: 'menuiserie' }).locator('.at-btn').click();
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('30-coffre-on-board');
	await deliverStory(['bois:4', 'meca:3'], '31-voilier-2');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['bois:4', 'soin:4'], '32-voilier-3');
	for (let k = 0; k < 2; k++) { await next(); await sleep(400); }
	await shot('33-lucile-box');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-scene').scrollIntoViewIfNeeded();
	await shot('34-atelier-ch3-done');
	// Chapter 4: Lucile's box, the key, the office.
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['soin:4', 'outil:3'], '35-boite-1');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['bois:3', 'meca:4'], '36-boite-2-key');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-up', { hasText: 'bureau' }).locator('.at-btn').click();
	await sleep(600);
	await shot('37-office-reveal');
	await next(); await sleep(500);
	await shot('38-office-map');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-office').scrollIntoViewIfNeeded();
	await shot('39-office-panel');
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await deliverStory(['bois:4', 'soin:3'], '40-boite-3');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	// Chapter 5: the baker's armchair, the 4th piece, Lucile's letter.
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['soin:4', 'outil:3'], '41-fauteuil-1');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-up', { hasText: 'couture' }).locator('.at-btn').click();
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('42-malle-on-board');
	await deliverStory(['tissu:3', 'bois:3'], '43-piece4');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await deliverStory(['tissu:4', 'soin:3'], '44-fauteuil-3');
	await next(); await sleep(500);
	await shot('45-lucile-letter');
	while (await page.locator('.at-talk').count()) { await next(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-office').scrollIntoViewIfNeeded();
	await shot('46-office-4-pieces');
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
