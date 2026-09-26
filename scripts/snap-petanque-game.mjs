/* Snapshot /jeux/petanque: each ground with its ComfyUI tile, against the procedural control, then a
   played end (jack + one boule) with the boule contrast and halo probes.

   The control is the SAME deal with the tiles blocked (route abort), so the procedural grain stays.
   The pixel diff between the two is the proof the tile is on the ground at all: a screenshot of a
   pitch "looks textured" either way, the diff does not lie.

   Throwing follows the maintained guards: the jack goes by the "Lancer le bouchon" button (the pad
   is inert in that phase), a boule is pulled from the pad's TOP seam (power is measured from there).
   Needs `npm run build` first. Output: D:/tmp/comfy/pet-*.png */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4362;
const OUT = 'D:/tmp/comfy';
const SURFACES = [['terre-battue', /Terre/], ['gravier-fin', /fin/i], ['gravier-gros', /gros/i], ['sable', /Sable/]];

const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];

/* Every tile request is HELD until the script opens its gate, so each deal is photographed twice:
   with the procedural grain (the control), then after the tile lands. Same deal, same sun, same
   camera. Two contexts were tried first and drew different deals, so their diff measured the decor;
   a fixed delay was tried next and missed that the landing deals already load two tiles. */
const gates = new Map();
const gate = (id) => {
	if (!gates.has(id)) { let open; const p = new Promise((r) => { open = r; }); gates.set(id, { p, open }); }
	return gates.get(id);
};

async function open() {
	const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
	let tileHits = 0;
	await ctx.route('**/assets/jeux/petanque/sol-*.webp', async (r) => {
		tileHits++;
		await gate(r.request().url().match(/sol-([a-z-]+)\.webp/)[1]).p;
		await r.continue();
	});
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));
	// Not load/networkidle: the held tiles are images, and both would wait on them for ever.
	await page.goto(`${server.base}/jeux/petanque/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status !== undefined, null, { timeout: 15000 });
	// The ground picker lives in Libre. Click the tab BEFORE going fullscreen: gf-full hides it.
	await page.getByRole('tab', { name: /Libre/ }).click();
	await sleep(700);
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(900);
	return { ctx, page, tileHits: () => tileHits };
}

const state = (page) => page.evaluate(() => window.__petanque());

async function pickSurface(page, label) {
	await page.getByRole('tab', { name: /libre/i }).click(); // opens the free-play card
	await page.locator('.pe-ground .pe-pill').filter({ hasText: label }).first().click();
	await sleep(300);
	await page.locator('.pe-ground .pe-replay').click(); // "Jouer" closes the card
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 15000 });
}

const canvasPng = (page) => page.locator('.pe-canvas').screenshot();

/** Mean absolute luminance difference, in levels. Same deal, same camera: only the ground differs. */
async function diff(a, b) {
	const [A, B] = await Promise.all([a, b].map((p) => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
	let s = 0;
	const n = A.info.width * A.info.height;
	for (let i = 0; i < n; i++) {
		const la = 0.2126 * A.data[i * 3] + 0.7152 * A.data[i * 3 + 1] + 0.0722 * A.data[i * 3 + 2];
		const lb = 0.2126 * B.data[i * 3] + 0.7152 * B.data[i * 3 + 1] + 0.0722 * B.data[i * 3 + 2];
		s += Math.abs(la - lb);
	}
	return s / n;
}

// ---- 1. Grounds: tile vs procedural control, on the same deal ----
const tiled = await open();
const measured = [];
for (const [id, label] of SURFACES) {
	await pickSurface(tiled.page, label);
	await sleep(3000);
	const before = await canvasPng(tiled.page);
	gate(id).open();
	await sleep(3000);
	const after = await canvasPng(tiled.page);
	measured.push([id, await diff(after, before)]);
	await sharp(after).toFile(resolve(`${OUT}/pet-ground-${id}.png`));
	await sharp(before).toFile(resolve(`${OUT}/pet-ground-${id}-control.png`));
}
// The null control: the same deal photographed twice with NOTHING changed between them (idle
// animation, camera settle). Taken last, because a tile once loaded stays pooled for the session.
const idleA = await canvasPng(tiled.page);
await sleep(3000);
const floor = await diff(idleA, await canvasPng(tiled.page));
console.log(`null control (same deal, nothing changed): ${floor.toFixed(2)} levels`);
for (const [id, d] of measured)
	console.log(`${d > Math.max(floor * 3, 0.05) ? 'ok  ' : 'FLAT'}  ${id.padEnd(13)} tile vs procedural: ${d.toFixed(2)} levels  → pet-ground-${id}.png`);
console.log(`tile requests: ${tiled.tileHits()}`);

// ---- 2. A played end on the last ground: jack, one boule, contrast and halos ----
const page = tiled.page;
const box = await page.locator('.pe-canvas').boundingBox();
const arm = (await state(page)).arm;
const cx = box.x + arm.cx, cy = box.y + arm.cy, seam = box.y + arm.top;

for (let step = 0; step < 40; step++) {
	const s = await state(page);
	if (s.status === 'aim' && s.match.phase === 'play' && s.match.turn === 0) break;
	if (s.status === 'placing' && s.match.turn === 0) {
		await page.mouse.click(cx, box.y + box.height * 0.42);
		await sleep(250);
		await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 4000 });
	} else if (s.status === 'aim' && s.match.phase === 'throw-jack' && s.match.turn === 0) {
		await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	}
	await sleep(400);
}
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 10, seam - 132, { steps: 12 });
await sleep(400);
await sharp(await canvasPng(page)).toFile(resolve(`${OUT}/pet-aim-arc.png`));
await page.mouse.up();
await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
await sleep(2500); // the look-at lerps for seconds after a throw

/* Boule contrast: at 5 px across a boule is invisible in a screenshot, so read the pixels — the
   centre (pure boule) against clean ground 12 px out, inside the halo's hole. */
const seen = (await state(page)).seen;
const png = await canvasPng(page);
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const lumaAt = (x, y) => {
	if (x < 0 || y < 0 || x >= info.width || y >= info.height) return NaN;
	const i = (y * info.width + x) * info.channels;
	return Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
};
for (const b of seen) {
	if (b.side < 0) continue;
	const bg = Math.round([[12, 0], [-12, 0], [0, -12]].map(([dx, dy]) => lumaAt(b.px + dx, b.py + dy)).reduce((a, c) => a + c, 0) / 3);
	console.log(`luma side${b.side}@${b.m}m boule=${lumaAt(b.px, b.py)} sol=${bg}`);
}
const near = (r, g, b, [tr, tg, tb]) => Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb) < 90;
const TARGETS = { 'jack halo': [255, 193, 7], 'you halo': [48, 209, 88], 'foe halo': [255, 95, 86] };
const hits = Object.fromEntries(Object.keys(TARGETS).map((k) => [k, 0]));
for (let i = 0; i < data.length; i += info.channels)
	for (const [k, t] of Object.entries(TARGETS)) if (near(data[i], data[i + 1], data[i + 2], t)) hits[k]++;
console.log(`halo pixels on ${info.width}x${info.height}:`, JSON.stringify(hits));
await sharp(png).toFile(resolve(`${OUT}/pet-after-boule.png`));

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.stop();
