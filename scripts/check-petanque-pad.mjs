/* Guard: the launch pad slides along the bottom edge.
     - portrait opens with the pad on the RIGHT, the eye's shoulder mirrored (-1);
     - the grip drags it, snaps to left / centre / right, and the spot survives a reload;
     - its travel stops at the side gauges when they reach down into its band (short landscape);
     - the point of it all: with the pad on the right, the pulling hand covers less of the arc and
       none of the jack than with the old centred pad. Centre is the control, measured in the same
       run on the same deal, because two runs draw two different deals.
   The hand is modelled as a column from the fingertip down to the bottom edge, HAND px wide: a thumb
   pulling up comes from below, so everything under the tip and near it is covered.

     node scripts/check-petanque-pad.mjs */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4376;
const HAND = 90; // px, a thumb and the hand behind it
const PULL = 230; // px above the seam: full power (190) plus the overshoot a real thumb makes

const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });

const fail = [];
const errs = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

async function open(viewport) {
	const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));
	await page.goto(`${server.base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	await page.getByRole('tab', { name: /Libre/ }).click();
	await sleep(700);
	// Fullscreen: in `astro preview` the canvas otherwise runs past the fold.
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1400);
	return { ctx, page };
}

const state = (page) => page.evaluate(() => window.__petanque());
const rect = (page, sel) => page.evaluate((s) => {
	const e = document.querySelector(s);
	if (!e) return null;
	const r = e.getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, sel);

/** Drag the grip so the pad's centre lands on client x `to`, and let go. */
async function slide(page, to) {
	const g = await rect(page, '.pe-arm-grip');
	const a = await rect(page, '.pe-arm');
	const gx = g.x + g.w / 2, gy = g.y + g.h / 2;
	await page.mouse.move(gx, gy);
	await page.mouse.down();
	await page.mouse.move(gx + (to - (a.x + a.w / 2)), gy, { steps: 12 });
	await page.mouse.up();
	await sleep(400);
}

async function throwJack(page) {
	await page.waitForFunction(() => window.__petanque().view === 'dessus', null, { timeout: 8000 }).catch(() => {});
	const box = await page.locator('.pe-canvas').boundingBox();
	await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.42);
	await sleep(400);
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 8000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await page.waitForFunction(() => !window.__petanque().intro, null, { timeout: 9000 }).catch(() => {});
	await sleep(1200);
}

/** Hold a mid-power pull from the pad, read what the hand covers, slide back and let go unthrown. */
async function handCover(page) {
	const box = await page.locator('.pe-canvas').boundingBox();
	const arm = (await state(page)).arm;
	const px = box.x + arm.cx, top = box.y + arm.top;
	await page.mouse.move(px, box.y + arm.cy);
	await page.mouse.down();
	await page.mouse.move(px, top - PULL, { steps: 14 });
	await sleep(700);
	const s = await state(page);
	await page.mouse.move(px, box.y + arm.cy, { steps: 4 });
	await sleep(150);
	await page.mouse.up();
	await sleep(300);
	const tipX = arm.cx, tipY = arm.top - PULL;
	const under = ([x, y]) => Math.abs(x - tipX) <= HAND / 2 && y >= tipY - 10;
	const jack = s.seen.find((b) => b.side === -1);
	const pts = [...s.arcPx, ...s.lanePx];
	return {
		power: s.power,
		arc: pts.length,
		covered: pts.filter(under).length,
		jack: jack ? under([jack.px, jack.py]) : null,
		shoulder: s.arm.shoulder,
		fired: (await state(page)).status === 'rolling',
	};
}

/* ---------- portrait: default, slide, snap, persist, and the hand ---------- */
{
	const { ctx, page } = await open({ width: 390, height: 844 });
	const box = await page.locator('.pe-canvas').boundingBox();
	let s = await state(page);
	console.log(`portrait canvas ${Math.round(box.width)}x${Math.round(box.height)} · pad ${s.arm.width} wide at ${s.arm.left} · x ${s.arm.x}`);
	check(s.arm.x === 1, `portrait opens with the pad on the right (x ${s.arm.x})`);
	check(Math.abs(s.arm.left + s.arm.width - (box.width - 12)) <= 1, `and it sits against the right edge (${s.arm.left + s.arm.width} of ${Math.round(box.width)})`);
	check(s.arm.shoulder === -1, `the eye steps to the other shoulder (${s.arm.shoulder})`);
	check(!(await rect(page, '.pe-arm-grip')), 'no grip while the jack is aimed (its button owns that spot)');

	await throwJack(page);
	const g = await rect(page, '.pe-arm-grip');
	check(!!g && g.right <= box.x + s.arm.left, 'the grip stands on the pitch side of the pad');
	const right = await handCover(page);

	await slide(page, box.x + 0);
	s = await state(page);
	check(s.arm.x === 0 && Math.abs(s.arm.left - 12) <= 1, `dragged to the far left it snaps to 0 (x ${s.arm.x}, left ${s.arm.left})`);
	check(s.arm.shoulder === 1, `and the shoulder comes back (${s.arm.shoulder})`);
	const g2 = await rect(page, '.pe-arm-grip');
	check(!!g2 && g2.x >= box.x + s.arm.left + s.arm.width, 'the grip moved to the pad\'s right side');
	check(s.status === 'aim' && s.power === 0, `sliding the pad throws nothing (status ${s.status})`);

	const span = s.arm.range.hi - s.arm.range.lo;
	await slide(page, box.x + s.arm.range.lo + span * 0.54 + s.arm.width / 2);
	s = await state(page);
	check(s.arm.x === 0.5, `released near the middle it snaps to the centre (x ${s.arm.x})`);
	const centre = await handCover(page);

	await slide(page, box.x + s.arm.range.lo + span * 0.3 + s.arm.width / 2);
	s = await state(page);
	check(Math.abs(s.arm.x - 0.3) < 0.03, `away from the snaps it stays where it is left (x ${s.arm.x.toFixed(2)})`);

	console.log(`     right : ${right.covered}/${right.arc} arc + lane points under the hand · jack ${right.jack ? 'covered' : 'clear'} · power ${right.power.toFixed(2)}`);
	console.log(`     centre: ${centre.covered}/${centre.arc} arc + lane points under the hand · jack ${centre.jack ? 'covered' : 'clear'} · power ${centre.power.toFixed(2)}`);
	check(right.power > 0.2 && centre.power > 0.2, 'both pulls really charged');
	check(!right.fired && !centre.fired, 'and neither measure threw a boule');
	check(right.arc > 5 && centre.arc > 5, 'the arc is on screen in both');
	// The control must show the complaint, or this block measures nothing.
	check(centre.covered > 0, `control: the centred pad's hand does cover the play (${centre.covered} points)`);
	check(right.jack === false, 'pad on the right: the hand leaves the jack clear');
	check(right.covered < centre.covered, `pad on the right: the hand covers less of the arc than the centred pad (${right.covered} < ${centre.covered})`);

	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	await sleep(600);
	s = await state(page);
	check(Math.abs(s.arm.x - 0.3) < 0.03, `the spot survives a reload (x ${s.arm.x.toFixed(2)})`);
	await ctx.close();
}

/* ---------- short landscape: the travel stops at the side gauges ---------- */
{
	const { ctx, page } = await open({ width: 844, height: 390 });
	const box = await page.locator('.pe-canvas').boundingBox();
	let s = await state(page);
	check(s.arm.x === 0.5, `landscape opens centred (x ${s.arm.x})`);
	await throwJack(page); // the grip only shows while the pad can throw
	const overlap = (a, o) => Math.min(a.right, o.right) - Math.max(a.x, o.x) > 0 && Math.min(a.bottom, o.bottom) - Math.max(a.y, o.y) > 0;
	for (const [to, name] of [[box.x + box.width, 'right'], [box.x, 'left']]) {
		await slide(page, to);
		s = await state(page);
		const a = await rect(page, '.pe-arm');
		const gr = await rect(page, '.pe-arm-grip');
		// The pad's band includes the power bar and state line above it.
		const band = { ...a, y: a.y - 40 };
		const hits = [];
		for (const sel of ['.pe-loft', '.pe-zoom', '.lbc-pill']) {
			const o = await rect(page, sel);
			if (o && overlap(band, o)) hits.push(`pad over ${sel}`);
			if (o && gr && overlap(gr, o)) hits.push(`grip over ${sel}`);
		}
		console.log(`     ${name}: pad ${Math.round(a.x - box.x)}..${Math.round(a.right - box.x)} of ${Math.round(box.width)} · range ${Math.round(s.arm.range.lo)}..${Math.round(s.arm.range.hi)}`);
		check(hits.length === 0, `slid to the ${name}, the pad and its grip clear the side gauges (${hits.join(', ') || 'none'})`);
	}
	await ctx.close();
}

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
if (errs.length) fail.push('page errors');
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall pad checks passed');
await browser.close();
server.stop();
process.exit(fail.length ? 1 : 0);
