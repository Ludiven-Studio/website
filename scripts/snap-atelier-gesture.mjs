/* Atelier gestures, played through for one or more story orders: a save set just before the order (its pieces on
   the bench), the delivery, the gesture done the way a finger would, then the scene goes on. Shots before, midway,
   after. Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-gesture.mjs <order id>... [--out dir]   (default D:/tmp/atelier-gesture)
   e.g.   node scripts/snap-atelier-gesture.mjs voilier-1 cloche-1 cadre-1 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './preview-server.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = resolve(outAt >= 0 ? args[outAt + 1] : 'D:/tmp/atelier-gesture');
const IDS = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
if (!IDS.length) { console.error('usage: node scripts/snap-atelier-gesture.mjs <order id>...'); process.exit(2); }
await mkdir(OUT, { recursive: true });
const PORT = 4392;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A point given in the gesture svg's own units, in page pixels. */
const svgPt = (page, x, y) => page.evaluate(([x, y]) => {
	const svg = document.querySelector('.atg svg.atg-board');
	const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
	return { x: p.x, y: p.y };
}, [x, y]);
const dragSvg = async (page, from, to, steps = 12) => {
	const a = await svgPt(page, ...from), b = await svgPt(page, ...to);
	await page.mouse.move(a.x, a.y); await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up();
	await sleep(250);
};
// Slide targets (0-1 along the track), crank hubs, place mapping item → slot index.
const SLIDE_AT = { radio: 0.68, nettete: 0.66, notice: 1, rabat: 1, etal: 1 };
const HUB = { musique: [170, 90], boussole: [130, 85] };
const PLACE_TO = {
	valise: { linge: 0, boite: 2, ouvrage: 1, trousse: 3 },
	presentoir: { d: 1, g: 0 },
	casier: { toupie: 0, cote: 2, bourg: 0, ici: 1 },
};

/** How a finger does each gesture. */
const PLAY = {
	async slide(page, id) {
		const t = await page.locator('.atx-track').evaluate((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k))));
		const h = await page.locator('.atx-handle').evaluate((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
		const v = SLIDE_AT[id];
		await dragSvg(page, h, [t[0] + (t[2] - t[0]) * v, t[1] + (t[3] - t[1]) * v], 16);
	},
	async crank(page, id) {
		const [cx, cy] = HUB[id];
		const p0 = await svgPt(page, cx + 40, cy);
		await page.mouse.move(p0.x, p0.y); await page.mouse.down();
		for (let d = 0; d <= 900; d += 20) {
			const p = await svgPt(page, cx + 40 * Math.cos((d * Math.PI) / 180), cy + 40 * Math.sin((d * Math.PI) / 180));
			await page.mouse.move(p.x, p.y);
			if (d === 300) await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		}
		await page.mouse.up();
	},
	async hold(page) {
		const p = await svgPt(page, 130, 90);
		await page.mouse.move(p.x, p.y); await page.mouse.down();
		await sleep(800);
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		await sleep(1400);
		await page.mouse.up();
	},
	async choose(page) {
		await page.locator('.atx-choice').nth(0).click();
		await sleep(450);
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		await page.locator('.atx-choice').nth(1).click();
	},
	async coins(page) {
		for (const k of [0, 1, 4]) await page.locator('.atx-coin').nth(k).click();
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		await page.locator('.atx-coin').nth(4).click(); // 3 F 20 + 20 c too low: take it back
		await page.locator('.atx-coin').nth(3).click(); // 2 F + 1 F + 50 c
	},
	async place(page, id) {
		const slots = await page.locator('.atx-slot').evaluateAll((rs) => rs.map((r) => ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)))));
		for (const [item, s] of Object.entries(PLACE_TO[id])) {
			const g = page.locator(`[data-item="${item}"]`);
			const [tx, ty, w, h] = await g.evaluate((el) => {
				const m = el.transform.baseVal.consolidate().matrix, r = el.querySelector('rect');
				return [m.e, m.f, Number(r.getAttribute('width')), Number(r.getAttribute('height'))];
			});
			const [sx, sy, sw, sh] = slots[s];
			await dragSvg(page, [tx + w / 2, ty + h / 2], [sx + sw / 2, sy + sh / 2]);
		}
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
	},
	async pins(page) {
		for (const [x, y] of [[80, 104], [130, 96], [180, 110]]) await dragSvg(page, [x, y + 6], [x, 70 + 6], 10);
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
	},
	async fling(page) {
		await dragSvg(page, [60, 100], [70, 100], 2); // too slow: wobble
		await sleep(300);
		await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		await sleep(700);
		const a = await svgPt(page, 40, 100), b = await svgPt(page, 230, 100);
		await page.mouse.move(a.x, a.y); await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
	},
	async rub(page) {
		const b = await page.locator('.atr').boundingBox();
		await page.mouse.move(b.x + 6, b.y + 6);
		await page.mouse.down();
		for (let row = 0; row < 7; row++) {
			const y = b.y + 6 + (row * (b.height - 12)) / 6;
			await page.mouse.move(b.x + (row % 2 ? 6 : b.width - 6), y, { steps: 14 });
			if (row === 2) await page.screenshot({ path: `${page.shotBase}-2-mid.png` });
		}
		await page.mouse.up();
	},
};
const KIND = {
	frottage: 'rub', vertdegris: 'rub', dosducadre: 'rub',
	radio: 'slide', nettete: 'slide', notice: 'slide', rabat: 'slide', etal: 'slide',
	musique: 'crank', boussole: 'crank', fanal: 'hold',
	loquet: 'choose', marque: 'choose', cale: 'choose', caissette: 'coins',
	valise: 'place', presentoir: 'place', casier: 'place', coffre: 'pins', toupie: 'fling',
};

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
	for (const id of IDS) {
		const puzzle = await page.evaluate(async (id) => {
			const engine = await import('/src/games/atelier/engine.ts');
			const data = await import('/src/games/atelier/data.ts');
			const o = data.ORDERS.find((x) => x.id === id);
			const st = engine.newGame(Date.now(), 7);
			for (const p of data.PROJECTS) { if (p.id === o.project) { st.progress[p.id] = o.step - 1; break; } st.progress[p.id] = p.steps; }
			st.done = data.ORDERS.filter((x) => x.project && st.progress[x.project] >= x.step).map((x) => x.id);
			st.upgrades = data.UPGRADES.map((u) => u.id);
			st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
			st.tut = 4;
			st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
			o.needs.forEach((p, k) => { st.board[k] = p; });
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
			return o.scene?.puzzle ?? null;
		}, id);
		if (!puzzle || !KIND[puzzle]) { fails.push(`${id}: no known gesture (${puzzle})`); continue; }
		page.shotBase = join(OUT, id);
		await page.reload({ waitUntil: 'networkidle' });
		while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
		if (!(await page.locator('.at-orders').count())) await page.locator('.at-tab', { hasText: 'Établi' }).click();
		await page.locator('.at-order.story .at-give').click();
		const ok = await page.waitForSelector('.atg', { timeout: 5000 }).catch(() => null);
		if (!ok) { fails.push(`${id}: no gesture after delivery`); continue; }
		await sleep(400);
		await page.screenshot({ path: `${page.shotBase}-1-start.png` });
		await PLAY[KIND[puzzle]](page, puzzle);
		await sleep(900);
		await page.screenshot({ path: `${page.shotBase}-3-done.png` });
		const next = await page.waitForSelector('.at-talk .at-line', { timeout: 5000 }).catch(() => null);
		if (!next) fails.push(`${id}: scene did not go on after the gesture`);
		else console.log(`${id}: ${puzzle} ok`);
	}
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
