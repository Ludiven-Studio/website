/* Guard + snaps: whose turn it is reads on the launch pad. During the gesture the label says the
   opponent is throwing and the graduation under its finger is lit. On the player's turn the pad is gold
   (`.pe-arm.mine`); on the AI's it turns to the opponent's colour (`.pe-arm.foe`) and a finger acts
   out the AI's boule on it — press at the loft, pull past the seam, slide to the aim — before the
   boule leaves, with its flight drawn as an arc and the spot it pressed marked on the pad. Also snaps
   the dashed 6 m / 10 m window with its legend. PAGE picks the page (the Copa Coruñesa page runs the
   same game): PAGE=/jeux/petanque/coruna/ node scripts/snap-petanque-foe.mjs
   Frames go to shots/petanque-foe-<page>-*.png. Libre mode, one end. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4371;
const base = `http://localhost:${PORT}`;
const OUT = 'shots';
const PAGE = process.env.PAGE || '/jeux/petanque/';
const TAG = PAGE.includes('coruna') ? 'coruna' : 'main';
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

try {
	await page.goto(`${base}${PAGE}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	// The main page opens on its levels; the Copa page has free play only, and opens on it.
	try { await page.getByRole('tab', { name: /Libre/ }).click({ timeout: 2500 }); } catch {}
	await sleep(700);
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1200);

	const state = () => page.evaluate(() => window.__petanque());
	const box = await page.locator('.pe-canvas').boundingBox();
	const cx = box.x + box.width * 0.5;
	const arm = await page.evaluate(() => window.__petanque().arm);
	const cy = box.y + arm.cy, seam = box.y + arm.top;
	const padClass = () => page.evaluate(() => document.querySelector('.pe-arm')?.className ?? '');
	const handOpacity = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.pe-foe-hand')).opacity));

	let mineSeen = false, foeSeen = false, handSeen = false, handBeforeRoll = false, snaps = 0;
	let saysThrowing = false, bandLit = false, arcShown = false, startShown = false, windowShot = false;
	const hud = () => page.evaluate(() => ({
		label: document.querySelector('.pe-arm-label')?.textContent ?? '',
		band: document.querySelector('.pe-arm.foe .pe-board-mark.on')?.textContent ?? null,
	}));
	for (let step = 0; step < 80 && !(foeSeen && handBeforeRoll && mineSeen); step++) {
		const s = await state();
		if (s.match.endNo !== 1 || s.status === 'end' || s.status === 'over') break;
		if (s.status === 'rolling') { await sleep(200); continue; }
		if (s.status === 'placing') {
			if (s.match.turn === 0) {
				await page.mouse.click(cx, box.y + box.height * 0.42);
				await sleep(250);
				await page.getByRole('button', { name: /Poser ici|Colocar aquí/ }).click({ timeout: 4000 });
			}
			await sleep(400);
			continue;
		}
		if (s.status === 'aim' && s.match.phase === 'throw-jack') {
			if (s.match.turn === 0 && !windowShot) {
				// The jack view from above: the dashed window and its "6 m" / "10 m".
				await sleep(900);
				await page.screenshot({ path: `${OUT}/petanque-foe-${TAG}-window.png` });
				windowShot = true;
			}
			if (s.match.turn === 0) {
				await page.getByRole('button', { name: /Lancer le bouchon|Lanzar el boliche/ }).click({ timeout: 6000 });
				await page.waitForFunction(() => window.__petanque().status !== 'aim', null, { timeout: 4000 });
			} else await sleep(300);
			continue;
		}
		if (s.match.phase !== 'play') { await sleep(300); continue; }

		if (s.match.turn === 0) {
			if (!mineSeen) {
				mineSeen = (await padClass()).includes('mine');
				await page.screenshot({ path: `${OUT}/petanque-foe-${TAG}-0-mine.png` });
			}
			await page.mouse.move(cx, cy);
			await page.mouse.down();
			await page.mouse.move(cx, seam - 120, { steps: 10 });
			await sleep(200);
			await page.mouse.up();
			await page.waitForFunction(() => window.__petanque().status !== 'aim', null, { timeout: 4000 }).catch(() => {});
			continue;
		}

		// The AI's turn: watch the pad until its boule leaves.
		foeSeen = foeSeen || (await padClass()).includes('foe');
		const t0 = Date.now();
		while (Date.now() - t0 < 5000) {
			const st = (await state()).status;
			if (st === 'rolling') break;
			const op = await handOpacity();
			if (op > 0.5) {
				handSeen = true;
				handBeforeRoll = true;
				const h = await hud();
				saysThrowing = saysThrowing || h.label.length > 0;
				arcShown = arcShown || (await page.evaluate(() => window.__petanque().rayVisible));
				startShown = startShown || (await page.evaluate(() => Number(getComputedStyle(document.querySelector('.pe-foe-start')).opacity) > 0.5));
				bandLit = bandLit || h.band !== null;
				if (snaps < 3) {
					await page.screenshot({ path: `${OUT}/petanque-foe-${TAG}-${snaps + 1}.png` });
					snaps++;
					await sleep(260);
					continue;
				}
			}
			await sleep(60);
		}
		await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 }).catch(() => {});
	}

	check(mineSeen, 'the pad is gold (mine) on the player\'s turn');
	check(foeSeen, 'the pad turns to the opponent\'s colour (foe) on the AI\'s turn');
	check(handSeen && handBeforeRoll, 'the AI\'s finger shows on the pad before its boule leaves');
	check(saysThrowing, 'the label speaks for the opponent while its hand is on the pad');
	check(arcShown, 'the opponent\'s flight is drawn while its hand is on the pad');
	check(startShown, 'the spot the opponent pressed is marked on the pad');
	check(windowShot, 'the jack window was snapped');
	check(bandLit, 'the AI\'s graduation is lit on the pad during its gesture');
	console.log(`     ${snaps} frame(s) of the AI gesture in ${OUT}/`);
} finally {
	console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
	await browser.close();
	server.stop();
}
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
