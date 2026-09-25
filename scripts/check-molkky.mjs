/* Guard + snaps for the Mölkky prototype, in a real browser on the built site:
   1. the engine loads from /vendor and the twelve pins stand;
   2. a real press-and-pull on the pad throws the stick;
   3. a throw at the pack is scored (rules applied, fallen pins lit), then the pins stand again;
   4. the computer plays its own turn.
   Frames go to shots/molkky-*.png. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4372;
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`CONSOLE ${m.text()}`); });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };
const state = () => page.evaluate(() => { const s = window.__molkky(); return { status: s.status, match: s.match, pins: s.pins }; });
const waitStatus = (st, ms = 20000) => page.waitForFunction((x) => window.__molkky?.().status === x, st, { timeout: ms });

try {
	await page.goto(`http://localhost:${PORT}/jeux/molkky/`, { waitUntil: 'networkidle' });
	try { await page.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
	await page.waitForFunction(() => window.__molkky?.().status === 'aim', null, { timeout: 30000 });
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1200);
	let s = await state();
	check(s.pins.length === 12 && s.pins.every((p) => !p.down), 'the engine loads and the twelve pins stand');
	await page.screenshot({ path: `${OUT}/molkky-1-start.png` });

	// A real gesture: press mid-pad, pull well above it.
	const pad = await page.locator('.mk-pad').boundingBox();
	const px = pad.x + pad.width / 2, py = pad.y + pad.height * 0.45;
	await page.mouse.move(px, py);
	await page.mouse.down();
	await page.mouse.move(px, pad.y - 90, { steps: 10 });
	await sleep(250);
	await page.screenshot({ path: `${OUT}/molkky-2-aim.png` });
	await page.mouse.up();
	await page.waitForFunction(() => window.__molkky().status !== 'aim', null, { timeout: 3000 }).catch(() => {});
	s = await state();
	check(s.status === 'flying' || s.status === 'result', `a press and pull on the pad throws (status ${s.status})`);
	await waitStatus('result');
	await page.screenshot({ path: `${OUT}/molkky-3-result.png` });
	s = await state();
	check(s.match.last?.player === 0, 'the throw is scored for the player');
	console.log(`     player's pad throw: fallen ${JSON.stringify(s.match.last?.fallen)} → ${s.match.last?.points} pt`);

	// The computer's turn follows, on its own.
	await page.waitForFunction(() => window.__molkky().match.last?.player === 1, null, { timeout: 30000 }).catch(() => {});
	s = await state();
	check(s.match.last?.player === 1, 'the computer plays its own turn');
	console.log(`     computer: fallen ${JSON.stringify(s.match.last?.fallen)} → ${s.match.last?.points} pt · score ${s.match.players.map((p) => p.score).join('-')}`);
	await page.screenshot({ path: `${OUT}/molkky-4-ai.png` });

	// Back to us, pins standing again.
	await page.waitForFunction(() => window.__molkky().status === 'aim' && window.__molkky().match.turn === 0, null, { timeout: 20000 }).catch(() => {});
	s = await state();
	check(s.pins.every((p) => !p.down), 'the fallen pins stand up again for the next throw');
	await page.evaluate(() => { document.querySelectorAll('.mk-views button')[2]?.click(); });
	await sleep(1400);
	await page.screenshot({ path: `${OUT}/molkky-5-top.png` });
} finally {
	console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
	await browser.close();
	server.stop();
}
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
