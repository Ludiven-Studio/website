/* Throwaway: what the game actually looks like, and WHERE the UI overlaps itself.
   Defaults to a 390x844 phone — the exit button is fixed to one corner at the top of the z stack,
   the action row to the other, and the throwing strip owns the bottom band, so a narrow screen is
   where it breaks. PET_W/PET_H move the viewport: the HUD columns are keyed off the two side
   gauges, which are vertically centred, so landscape is a second shape and not a smaller one.
   Overlap is reported as a rectangle intersection: an eye misses a 4 px collision, and a screenshot
   of a translucent chip on a dark pitch hides it completely. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4500;
const OUT = 'D:/tmp/comfy';
// PET_DEV=1 serves from `astro dev` instead of `dist`: layout and CSS are identical there, and it is
// the only way to shoot the page when a build cannot run.
const server = await startServer(PORT, { mode: process.env.PET_DEV ? 'dev' : 'preview' });
const { base } = server;

const VW = Number(process.env.PET_W || 390);
const VH = Number(process.env.PET_H || 844);
const PHONE = VW < 900; // a desktop context with isMobile on gets the phone viewport meta, not the layout
const SUF = VW === 390 && VH === 844 ? '' : `-${VW}x${VH}`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({
	viewport: { width: VW, height: VH },
	deviceScaleFactor: 2, // a phone renders at 2x, and hairlines only show up there
	isMobile: PHONE,
	hasTouch: PHONE,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

/* Every piece of chrome that floats over the pitch. Anything that can cover anything else has to be
   in here, or the audit below is only as good as what I remembered to list. */
const PARTS = {
	quitter: '.gf-exit',
	board: '.pe-board',
	tabs: '.dt-toggle',
	stats: '.pe-stats',
	actions: '.pe-hud-actions',
	views: '.pe-views',
	hint: '.pe-hint',
	strip: '.pe-arm',
	legend: '.pe-board-marks',
	power: '.pe-power',
	tag: '.pe-tag',
	card: '.pe-card',
	lbc: '.lbc-pill', // shared chrome, pinned by LeaderboardCorner: it lands here without asking
};

const audit = async (tag) => {
	const { boxes, nested, strays, inked } = await page.evaluate((sel) => {
		const els = {}, boxes = {};
		for (const [k, s] of Object.entries(sel)) {
			const e = document.querySelector(s);
			if (!e) continue;
			const r = e.getBoundingClientRect();
			const cs = getComputedStyle(e);
			if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
			els[k] = e;
			boxes[k] = { x: r.x, y: r.y, w: r.width, h: r.height, hit: cs.pointerEvents !== 'none' };
		}
		// A child drawn inside its own parent is not a collision — asked of the DOM, not of the
		// rectangles, because a chip that merely sits inside another's box IS one.
		const nested = [];
		const ks = Object.keys(els);
		for (let i = 0; i < ks.length; i++)
			for (let j = i + 1; j < ks.length; j++)
				if (els[ks[i]].contains(els[ks[j]]) || els[ks[j]].contains(els[ks[i]])) nested.push(`${ks[i]}x${ks[j]}`);
		/* The named list above is only as good as what I remembered to put in it, and it already
		   missed a button. So the board is asked the only question that actually matters, and asked
		   of the browser rather than of rectangle maths: at each point of it, what would my thumb
		   land on? Anything but the canvas is a hole in the one surface the player throws from.
		   Skipped while the board is `off` — during jack placement it is not a throwing surface, so
		   the green "Lancer le bouchon" button standing on it is right where it belongs. */
		const strays = [];
		const armEl = document.querySelector('.pe-arm');
		const arm = armEl?.getBoundingClientRect();
		if (arm && !armEl.classList.contains('off')) {
			const seen = new Set();
			for (let gx = 0; gx <= 8; gx++) for (let gy = 0; gy <= 5; gy++) {
				const x = arm.left + (arm.width - 2) * (gx / 8) + 1;
				const y = arm.top + (arm.height - 2) * (gy / 5) + 1;
				const top = document.elementFromPoint(x, y);
				if (!top || top.classList.contains('pe-canvas')) continue;
				const id = typeof top.className === 'string' && top.className.trim()
					? `.${top.className.trim().split(/\s+/).join('.')}` : top.tagName;
				const key = id;
				if (seen.has(key)) continue;
				seen.add(key);
				strays.push(`${id} [${(top.getAttribute('aria-label') || top.textContent || '').trim().slice(0, 24)}] steals ${Math.round(x)},${Math.round(y)}`);
			}
		}
		/* The pairs above are about who steals a PRESS. Nothing there catches a label printed on top
		   of another label, which is what the bottom band actually looked like: four things stacked
		   in 80 px. Measured on the text's own range rect and not on the element box — a graduation
		   is full-width with a word in the middle, so its box collides with everything and its ink
		   with almost nothing. That distinction is the whole reason the rectangle pass cried wolf. */
		const INK = ['.pe-arm-label', '.pe-hint', '.pe-board-mark', '.pe-loft-label', '.pe-loft-hint',
			'.pe-tag', '.pe-stats', '.gf-exit', '.pe-act', '.lbc-pill', '.pe-view', '.pe-zoom-label',
			'.pe-power', '.pe-placeok'];
		const ink = [];
		for (const s of INK) for (const e of document.querySelectorAll(s)) {
			const cs = getComputedStyle(e);
			if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
			const txt = (e.textContent || '').trim();
			const rg = document.createRange();
			rg.selectNodeContents(e);
			const r = txt ? rg.getBoundingClientRect() : e.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) continue;
			ink.push({ k: txt ? `${s}[${txt.slice(0, 14)}]` : s, e, x: r.x, y: r.y, w: r.width, h: r.height });
		}
		const inked = [];
		for (let i = 0; i < ink.length; i++) for (let j = i + 1; j < ink.length; j++) {
			const a = ink[i], b = ink[j];
			if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
			const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
			const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
			if (ox > 2 && oy > 2) inked.push(`${a.k} over ${b.k} — ${Math.round(ox)}x${Math.round(oy)}px`);
		}
		return { boxes, nested, strays, inked };
	}, PARTS);
	const keys = Object.keys(boxes);
	const blocking = [], visual = [];
	for (let i = 0; i < keys.length; i++) {
		for (let j = i + 1; j < keys.length; j++) {
			const a = boxes[keys[i]], b = boxes[keys[j]];
			const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
			const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
			// A card is a modal: it is MEANT to cover the HUD, so it is not a collision either.
			if (!(ox > 1 && oy > 1) || keys[i] === 'card' || keys[j] === 'card'
				|| nested.includes(`${keys[i]}x${keys[j]}`)) continue;
			/* Only a pair where BOTH sides take pointer events can steal a press — and the bottom band
			   is full of pairs that cannot: the board, its graduations, the power bar and the hint are
			   all inert by design, drawn ON the band on purpose. Lumping them in gave 44 "overlaps to
			   fix" of which one was real, which is a report nobody can act on. */
			(a.hit && b.hit ? blocking : visual).push(`${keys[i]}x${keys[j]} ${Math.round(ox)}x${Math.round(oy)}px`);
		}
	}
	console.log(`${tag.padEnd(14)} ${keys.length} parts · ${blocking.length ? `BLOCKING ${blocking.join(', ')}` : 'no blocking overlap'}`
		+ (visual.length ? ` · drawn-over (by design): ${visual.join(', ')}` : ''));
	for (const k of keys) {
		const b = boxes[k];
		console.log(`    ${k.padEnd(9)} x ${Math.round(b.x)}..${Math.round(b.x + b.w)}  y ${Math.round(b.y)}..${Math.round(b.y + b.h)}`);
	}
	for (const s of strays) console.log(`    ON THE BOARD  ${s}`);
	for (const s of inked) console.log(`    INK ON INK    ${s}`);
	await page.screenshot({ path: resolve(`${OUT}/phone-${tag}${SUF}.png`) });
	/* The whole-page shot is 844 px tall and gets looked at as a thumbnail, which is where a 3 px
	   collision hides. The band is where the text piles up, so it also comes out at its own size. */
	const bandH = Math.min(250, VH);
	await page.screenshot({ path: resolve(`${OUT}/band-${tag}${SUF}.png`), clip: { x: 0, y: VH - bandH, width: VW, height: bandH } });
	return [
		...blocking.map((h) => `${tag}: ${h}`),
		...strays.map((s) => `${tag}: pressable on the board — ${s}`),
		...inked.map((s) => `${tag}: unreadable — ${s}`),
	];
};

const state = () => page.evaluate(() => window.__petanque());

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
await sleep(1500);

const all = [];
all.push(...await audit('1-niveaux')); // how the game actually opens: fullscreen, on the ladder

await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(1200);
all.push(...await audit('2-libre-jack')); // top view, the jack ring, the difficulty pills

await page.locator('.pe-act[aria-label="Choisir le terrain"]').click();
await sleep(500);
all.push(...await audit('3-terrain'));
await page.locator('.pe-card .pe-replay').click();
await sleep(900);

const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width / 2;
await page.mouse.click(cx, box.y + box.height * 0.42);
await sleep(400);
await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 8000 });
await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
await sleep(2000);
all.push(...await audit('4-eye')); // the throwing view: strip, legend, hint, everything at once

/* Held, mid-pull: the one moment the power bar, the lit legend mark and the arc are all on screen
   together — and the only state where the strip is not just a passive band at the bottom. */
const bot = box.y + box.height;
await page.mouse.move(cx, bot - 40);
await page.mouse.down();
await page.mouse.move(cx, bot - 40 - 130, { steps: 14 });
await sleep(700);
all.push(...await audit('5-armed-roulette'));
await page.mouse.move(cx, bot - 40, { steps: 4 }); // back to power 0: do not fire
await sleep(150);
await page.mouse.up();
await sleep(400);

// And the other end of the board: a full plomb, where the legend has to read "Plomb".
const stripTop = await page.evaluate(() => document.querySelector('.pe-arm').getBoundingClientRect().top);
await page.mouse.move(cx, stripTop + 14);
await page.mouse.down();
await page.mouse.move(cx, stripTop + 14 - 130, { steps: 14 });
await sleep(700);
all.push(...await audit('6-armed-plomb'));
console.log(`    loft ${(((await state()).loft) * 180 / Math.PI).toFixed(1)} deg`);
await page.mouse.up();
await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 }).catch(() => {});
await sleep(2500);

await page.keyboard.press('v'); // head view: the zoom slider joins the HUD
await sleep(1400);
all.push(...await audit('7-head'));

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
console.log(all.length ? `\n${all.length} blocking overlap(s) to fix:\n  ${all.join('\n  ')}` : '\nno blocking overlap in any state');
await browser.close();
server.stop();
process.exit(0);
