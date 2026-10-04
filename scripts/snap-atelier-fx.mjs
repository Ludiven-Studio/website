/* Reward effects: a first-time merge (sparks + "Nouveau !"), a short order (coins fly to the counter, it bumps), a
   story step (confetti, then the restoration scene once the party is over). Frames frozen at stated times.
   Fails on console errors or a step not reached. Usage: node scripts/snap-atelier-fx.mjs [out dir] */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-fx');
await mkdir(OUT, { recursive: true });
const PORT = 4395;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
const fails = [];
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true });
	await page.addInitScript(() => { localStorage.setItem('ludiven-tuto-seen', '["atelier"]'); localStorage.removeItem('ludiven-atelier-found'); });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.evaluate(async () => {
		const engine = await import('/src/games/atelier/engine.ts');
		const st = engine.newGame(Date.now(), 7);
		st.progress.montre = 1;
		st.done = ['garnier-1', 'lucas-1', 'morel-1'];
		st.upgrades = ['etabli'];
		st.seen = ['intro', 'arrival:montre', 'rep-5'];
		st.tut = 4; st.coins = 100;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		st.board[0] = 'outil:4'; st.board[1] = 'meca:5'; st.board[14] = 'soin:1'; st.board[15] = 'soin:1';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	await page.evaluate(() => scrollTo(0, document.querySelector('.at-root').getBoundingClientRect().top + scrollY - 8));
	const freezeAt = (ms) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), ms);
	const play = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

	// 1. Merge two cloths: soin:2 has never been made, so "Nouveau !".
	const c = async (k) => { const b = await page.locator('.at-cell').nth(k).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
	const a = await c(14), b = await c(15);
	await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
	await sleep(60);
	if (!(await page.locator('.at-newtag').count())) fails.push('no "Nouveau !" on a first-time merge');
	await freezeAt(250); await page.screenshot({ path: `${OUT}/1-merge.png` }); await play();
	await sleep(1600);

	// 2. The short order for that soin:2 (Mme Garnier): coins fly to the counter.
	const short = page.locator('.at-order:not(.story) .at-give:not([disabled])').first();
	if (!(await short.count())) fails.push('no short order ready to deliver');
	else {
		await short.click();
		await sleep(40);
		if (!(await page.locator('.at-fly.coin').count())) fails.push('no coins flying after a delivery');
		await freezeAt(450); await page.screenshot({ path: `${OUT}/2-coins.png` }); await play();
		await sleep(1400);
	}

	// 3. The story step: confetti, and the restoration scene only after the party.
	await page.locator('.at-order.story .at-give').click();
	await sleep(40);
	if (!(await page.locator('.at-fly.confetti').count())) fails.push('no confetti on a story step');
	if (await page.locator('.at-talk').count()) fails.push('restoration scene opened during the party');
	await freezeAt(500); await page.screenshot({ path: `${OUT}/3-party.png` }); await play();
	const scene = await page.waitForSelector('.at-talk', { timeout: 4000 }).catch(() => null);
	if (!scene) fails.push('restoration scene never opened after the party');

	// 4. Through the scene (its puzzle skipped): the full-screen rewards, then "Récupérer" sends them flying.
	for (let k = 0; k < 12 && (await page.locator('.at-talk').count()); k++) {
		if (await page.locator('.at-talk .at-link', { hasText: 'Passer' }).count()) await page.locator('.at-talk .at-link', { hasText: 'Passer' }).click();
		else { await sleep(950); await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); }
		await sleep(250);
	}
	const pop = await page.waitForSelector('.at-reward', { timeout: 3000 }).catch(() => null);
	if (!pop) fails.push('no reward popup after the story scene');
	else {
		await sleep(900);
		await page.screenshot({ path: `${OUT}/4-reward.png` });
		await page.locator('.at-reward-btn').click();
		await sleep(60);
		if (!(await page.locator('.at-fly.coin').count())) fails.push('collecting the rewards sent nothing flying');
		await sleep(1600);
	}

	// 5. The toolbox row opens the generator window: meters, what blocks, upgrade for coins; the welcome pill above.
	if (!(await page.locator('.at-welcome').count())) fails.push('no welcome pill during the first quarter-hour');
	const box = await c(await page.evaluate(() => [...document.querySelectorAll('.at-cell')].findIndex((el) => el.querySelector('img[src*="gen-boite"]'))));
	await page.mouse.click(box.x, box.y);
	await sleep(400);
	await page.locator('.at-info-gen').click();
	if (!(await page.waitForSelector('.at-genpop', { timeout: 2000 }).catch(() => null))) fails.push('generator row opens no window');
	await sleep(300);
	await page.screenshot({ path: `${OUT}/5-gen-pop.png` });
	await page.locator('.at-genpop .at-btn', { hasText: 'Améliorer' }).click();
	await sleep(500);
	if (await page.locator('.at-genpop').count()) fails.push('window still open after the upgrade');
	if (!(await page.locator('.at-genlvl').count())) fails.push('upgraded generator shows no level stars');
	if (!(await page.locator('.at-info-gen', { hasText: 'niv. 2' }).count())) fails.push('row does not say level 2');
	await page.screenshot({ path: `${OUT}/6-after-upgrade.png` });

	// 6. An empty generator: tapping it opens the window on its own, with the blocker and the paid recharge.
	await page.evaluate(async () => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.gens.boite.charges = 0; st.gens.boite.at = Date.now(); st.gens.boite.level = 1; st.coins = 23;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	if (await page.locator('.at-reward-btn').count()) { await page.locator('.at-reward-btn').click(); await sleep(1500); }
	const box2 = await c(await page.evaluate(() => [...document.querySelectorAll('.at-cell')].findIndex((el) => el.querySelector('img[src*="gen-boite"]'))));
	await page.mouse.click(box2.x, box2.y);
	if (!(await page.waitForSelector('.at-genpop', { timeout: 2000 }).catch(() => null))) fails.push('empty generator opens no window');
	if (!(await page.locator('.at-genpop-status.block').count())) fails.push('window does not say what blocks');
	await sleep(300);
	await page.screenshot({ path: `${OUT}/7-gen-empty.png` });
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
