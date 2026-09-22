/* Measurement: how much of the GROUND does the end-of-end card cover?

   `snap-petanque-phone.mjs` audits `.pe-endpanel`, the end-of-MATCH panel, because that is the one
   the complaint was about last time. It has never once seen `.pe-endcard`, the card shown after
   every end — `__petanqueOver` sets `over`, and the card's own condition is `card && !over`. So the
   piece of chrome a player meets a dozen times per match is the piece nothing measured.

   It is read the same way the end panel is: the share of the canvas it takes, how far across it
   reaches, and how many boules sit underneath it. The last number is the one that matters — the
   card carries the distance table, so it is shown exactly when you want to look at the head.

   Plays one real end against the AI. PET_W/PET_H move the viewport. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4372;
const OUT = 'D:/tmp/comfy';
const VW = Number(process.env.PET_W || 1000);
const VH = Number(process.env.PET_H || 760);
const SUF = `${VW}x${VH}`;
const server = await startServer(PORT);
const { base } = server;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`THROW ${e.message}`));

const state = () => page.evaluate(() => window.__petanque());

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
// The mode tabs are hidden by gf-full, so pick the mode before going fullscreen.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(800);
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1400);

const box = await page.locator('.pe-canvas').boundingBox();
const arm = await page.evaluate(() => window.__petanque().arm);
const cx = box.x + arm.cx, cy = box.y + arm.cy;
const seam = box.y + arm.top; // power is measured from the pad's top, never from the press

async function throwOne() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, seam - 130, { steps: 12 });
	await sleep(250);
	const armed = (await state()).power;
	await page.mouse.up();
	if (armed < 0.3) return false;
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(300);
	return true;
}

async function throwJack() {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(300);
}

// One whole end, then stop: the card is up the moment `status` turns to `end`.
for (let step = 0; step < 60; step++) {
	const s = await state();
	if (s.status === 'end' || s.status === 'over') break;
	if (s.status === 'rolling' || s.status === 'placing') { await sleep(250); continue; }
	if (s.match.turn !== 0) { await sleep(250); continue; }
	if (s.match.phase === 'throw-jack') { await throwJack(); continue; }
	// The walk-up runs on every turn and a drag cancels it, so wait it out before pressing.
	await page.waitForFunction(() => !window.__petanque().intro, null, { timeout: 9000 }).catch(() => {});
	if (!(await throwOne())) await sleep(300);
}

/* Dump the state the instant the end lands, BEFORE anything is concluded from the picture. The
   first run said "7 bodies, all projected off-frame", which no empty-looking pitch explains — so
   the ground, the camera and the view are read out rather than guessed at. */
const at = await state();
console.log(`  a la fin: status ${at.status} · phase ${at.match.phase} · vue ${at.view} · intro ${at.intro}`
	+ ` · ${at.bs.length} corps (${at.bs.filter((b) => b.live).length} vivants)`
	+ ` · cam yaw ${at.cam.yaw.toFixed(2)} pitch ${at.cam.pitch.toFixed(2)}`);
console.log(`  au sol: ${at.bs.map((b) => `s${b.side}@${b.x.toFixed(1)},${b.y.toFixed(1)}${b.live ? '' : ' (mort)'}`).join(' ')}`);
console.log(`  bouchon: ${at.jack ? `${at.jack.x.toFixed(1)},${at.jack.y.toFixed(1)}${at.jack.live ? '' : ' (mort)'}` : 'aucun'}`);

await sleep(500);
const m = await page.evaluate(() => {
	const el = document.querySelector('.pe-endcard');
	const cv = document.querySelector('.pe-canvas').getBoundingClientRect();
	if (!el) return { card: null, cv: { w: cv.width, h: cv.height } };
	const r = el.getBoundingClientRect();
	const seen = window.__petanque().seen;
	const under = seen.filter((b) => {
		const x = cv.left + b.px, y = cv.top + b.py;
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	});
	return {
		card: { x: r.x - cv.left, y: r.y - cv.top, w: r.width, h: r.height, right: r.right - cv.left },
		cv: { w: cv.width, h: cv.height },
		n: seen.length,
		under: under.length,
		// Where the head actually is on screen, which is what the card ought to be avoiding.
		head: seen.map((b) => `${b.side < 0 ? 'bouchon' : 's' + b.side}@${Math.round(b.px)},${Math.round(b.py)}`),
	};
});

if (!m.card) console.log(`${SUF}: no .pe-endcard on screen (status ${(await state()).status})`);
else {
	const share = (m.card.w * m.card.h) / (m.cv.w * m.cv.h);
	console.log(`${SUF} canvas ${Math.round(m.cv.w)}x${Math.round(m.cv.h)}`);
	console.log(`  carte ${Math.round(m.card.w)}x${Math.round(m.card.h)} @ ${Math.round(m.card.x)},${Math.round(m.card.y)}`
		+ ` · ${(share * 100).toFixed(0)} % du terrain · bord droit a ${((m.card.right / m.cv.w) * 100).toFixed(0)} %`
		+ ` · ${m.under}/${m.n} boules dessous`);
	console.log(`  boules ${m.head.join(' ')}`);
}
await page.screenshot({ path: resolve(`${OUT}/pet-endcard-${SUF}.png`) });
console.log(`-> pet-endcard-${SUF}.png`);

await browser.close();
server.stop();
process.exit(0);
