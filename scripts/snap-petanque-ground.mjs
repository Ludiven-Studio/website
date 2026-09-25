/* Throwaway: the three things of this round that only a picture can answer — the decor around the
   pitch (the "décor un peu vide" complaint), the 🏟 ground picker card, and the fullscreen HUD now
   that the page opens straight into fullscreen. Run at desktop AND phone size: the Quitter button
   only collides with the score board on a narrow screen. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4373;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];

const run = async (tag, viewport) => {
	const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`THROW ${tag} ${e.message}`));
	await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	await sleep(1200);

	// Ask 6, as a fact and not a screenshot: the page put itself in fullscreen with no gesture.
	const full = await page.evaluate(() => document.querySelector('.game-page')?.classList.contains('gf-full'));
	/* Ask 7's control, and not a cosmetic one: the game opens on the levels ladder, so if the tabs
	   are unreachable from fullscreen then free play — and with it the ground picker — is too. */
	const tabs = await page.getByRole('tab', { name: /Libre/ }).isVisible();
	await page.getByRole('tab', { name: /Libre/ }).click();
	await sleep(900);
	// The reservation the Quitter button asks the score board for, measured on the page itself.
	const geo = await page.evaluate(() => {
		const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null; };
		return { exit: r('.gf-exit'), board: r('.pe-board'), tabs: r('.dt-toggle'), w: innerWidth };
	});
	const hit = geo.exit && geo.board && geo.board.right > geo.exit.left && geo.board.top < geo.exit.bottom;
	const tabsHit = geo.exit && geo.tabs && geo.tabs.right > geo.exit.left && geo.tabs.top < geo.exit.bottom;
	console.log(`${tag.padEnd(8)} fullscreen=${full} modeTabs=${tabs} boardOverlapsQuitter=${hit} tabsOverlapQuitter=${tabsHit}`);
	console.log(`         exit=${geo.exit && Math.round(geo.exit.left)}..${geo.exit && Math.round(geo.exit.right)} board=${geo.board && Math.round(geo.board.left)}..${Math.round(geo.board.right)} tabs h=${geo.tabs && Math.round(geo.tabs.height)}`);
	await page.screenshot({ path: resolve(`${OUT}/pet-ground-${tag}-1-hud.png`) });

	await page.locator('.pe-act[aria-label="Choisir le terrain"]').click();
	await sleep(400);
	await page.screenshot({ path: resolve(`${OUT}/pet-ground-${tag}-2-picker.png`) });

	// A relief with real slope: the decor and the ground both have to read on a sloping pitch.
	await page.getByRole('button', { name: 'Accidenté' }).click();
	await sleep(1400);
	await page.locator('.pe-card .pe-replay').click();
	await sleep(900);
	await page.screenshot({ path: resolve(`${OUT}/pet-ground-${tag}-3-accidente.png`) });

	/* The eye view is the one the complaint was about, and the game opens on the TOP view to aim the
	   jack — so the jack has to actually be thrown before the decor can be judged where it counts. */
	const box = await page.locator('.pe-canvas').boundingBox();
	const cx = box.x + box.width / 2;
	await page.mouse.click(cx, box.y + box.height * 0.42); // the ring
	await sleep(400);
	// The jack is aimed with a ring and thrown with a BUTTON — the strip is inert in this phase, and
	// a drag would sit there while `status !== 'rolling'` passed on the first poll.
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 8000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(1800);
	console.log(`         after the jack: view=${(await page.evaluate(() => window.__petanque())).view}`);
	await page.screenshot({ path: resolve(`${OUT}/pet-ground-${tag}-4-decor.png`) });
	await ctx.close();
};

await run('desk', { width: 1000, height: 760 });
await run('phone', { width: 390, height: 844 });

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.stop();
process.exit(0);
