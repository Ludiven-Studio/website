/* Guard: the turn rule, played for real in the browser.
   Two bugs shipped that no unit test could have seen, because rules13 was never wrong — the React
   frame was. `tick` read the match BEFORE stepping the physics, so a handover produced inside
   onSettled in that same frame was invisible: the AI got armed on the player's turn, replayed while
   it held the point, and threw a fourth boule (billed to the player, so `left` still looked sane).
   Hence the two assertions below read the GROUND (`bs`), never `left`:
     1. no side ever has more than BOULES_PER_SIDE boules down in an end;
     2. whoever is to play does NOT hold the point, which is the whole official rule.
   Plays one complete end in Libre mode against the AI. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4368;
const PER_SIDE = 3;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });

// ModeToggle segments declare role="tab", so they are not buttons to the a11y tree.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(700);

// Fullscreen the pitch: in `astro preview` the canvas runs past the fold, and a drag aimed at its
// lower half then lands on nothing.
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1200);

const state = () => page.evaluate(() => window.__petanque());
const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5;
/* Middle of the throwing strip, read off the game. The strip is clamped in px (90-170), so a fixed
   fraction of the canvas height drifts out of it on a tall canvas and the drag lands on nothing. */
const arm = await page.evaluate(() => window.__petanque().arm);
const cy = box.y + (arm.top + arm.height) / 2;

const near = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
/** The side holding the point, from the ground alone — null when nothing is down yet. */
const holderOf = (s) => {
	if (!s.jack || !s.jack.live) return null;
	let best = null;
	for (const b of s.bs) {
		if (!b.live || b.side < 0) continue;
		const d = near(b, s.jack);
		if (!best || d < best.d - 1e-9) best = { d, side: b.side };
	}
	return best ? best.side : null;
};
const down = (s, side) => s.bs.filter((b) => b.side === side).length;

/* One throw by the player. The power gauge is asserted BEFORE the release: a negated wait on
   `status !== 'rolling'` passes instantly on exactly the failure it should catch. */
async function humanThrow() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, cy - 132, { steps: 12 });
	await sleep(250);
	const armed = (await state()).power;
	await page.mouse.up();
	// A dead drag here is not an instrument fault: aiming is gated on the turn, so power 0 on the
	// player's turn means the game handed the turn to the AI behind the player's back.
	if (armed < 0.3) { stolen = `the player could not aim on their own turn (power ${armed})`; return false; }
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(350);
	return true;
}

async function placeJack() {
	await page.mouse.click(cx, box.y + box.height * 0.42);
	await sleep(250);
	await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 4000 });
	await sleep(400);
}

/* The jack is aimed with a ring from the top view and thrown with a button — the strip is inert in
   that phase, so a drag here would sit there for ever and the end would never start. */
async function throwJack() {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(350);
}

let overflow = null; // first side seen with too many boules down
let replayed = null; // first time the side to play already held the point
let stolen = null; // the player was locked out of their own turn
let boules = 0;

for (let step = 0; step < 60; step++) {
	const s = await state();
	if (s.match.endNo !== 1 || s.status === 'end' || s.status === 'over') break;

	if (s.status === 'rolling') { await sleep(250); continue; }
	if (s.status === 'placing') {
		if (s.match.turn === 0) await placeJack(); else await sleep(300);
		continue;
	}
	if (s.status === 'aim' && s.match.phase === 'throw-jack') {
		if (s.match.turn === 0) await throwJack(); else await sleep(300);
		continue;
	}
	// Once the player is locked out, stop throwing but keep watching: the end still has to finish
	// for the boule count to mean anything.
	if (s.match.turn !== 0 || stolen) { await sleep(300); continue; }

	if (!(await humanThrow())) continue;

	const a = await state();
	boules = a.bs.filter((b) => b.side >= 0).length;
	for (const side of [0, 1]) if (down(a, side) > PER_SIDE && overflow === null) overflow = `side ${side} has ${down(a, side)} boules down`;

	// The official rule, checked only when it can apply: mid-end, both sides still holding boules.
	const h = holderOf(a);
	if (replayed === null && a.status === 'aim' && a.match.phase === 'play'
		&& h !== null && a.match.left[0] > 0 && a.match.left[1] > 0 && a.match.turn === h) {
		replayed = `side ${h} holds the point and is asked to play again (boules down ${down(a, 0)}/${down(a, 1)})`;
	}
	console.log(`     boule ${boules}: down ${down(a, 0)}/${down(a, 1)} · point to ${h ?? '-'} · next ${a.match.turn} · left ${a.match.left.join('/')}`);
}

const fin = await state();
check(stolen === null, stolen ?? 'the player keeps their own turn');
check(boules >= 4, `the end actually got played (${boules} boules down)`);
check(overflow === null, overflow ?? `neither side exceeds ${PER_SIDE} boules`);
check(replayed === null, replayed ?? 'the side holding the point never replays');
check(down(fin, 0) <= PER_SIDE && down(fin, 1) <= PER_SIDE, `final count is legal (${down(fin, 0)}/${down(fin, 1)})`);

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
