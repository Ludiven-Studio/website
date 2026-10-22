/* Guard for the pétanque shop and the uneven pitches. Proves the shop is WIRED, not just drawn:
   a boule bought with cocoins is the one the next match plays (its radius on the ground, its kit
   in the sim), the daily still plays every boule as the standard one, a jack and a decor change at
   once, and free play lays the uneven pitch the terrain row asked for. Needs `npm run build`. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4434;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
try {
	const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
	// 200 cocoins, a pitch at 70/100 for free play, no tutorial in the way.
	await ctx.addInitScript(() => {
		if (sessionStorage.getItem('shop-guard')) return; // set once: a reload keeps what was bought
		sessionStorage.setItem('shop-guard', '1');
		localStorage.setItem('ludiven-cocottes', JSON.stringify({ balance: 200, owned: ['cocotte'], equipped: null, lastReward: '' }));
		localStorage.setItem('petanque-ground', JSON.stringify({ surface: 'auto', pitch: 70 }));
		localStorage.setItem('petanque-tuto-throw', '1');
		localStorage.setItem('petanque-promo-shut', '1');
	});
	const page = await ctx.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));
	const state = () => page.evaluate(() => window.__petanque());

	await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 20000 });

	const s0 = await state();
	check(s0.shop.equipped.boule === 'boule_inox' && s0.shop.kits === null, 'a fresh device throws the standard boule (no kit in the sim)');
	check(typeof s0.shop.rough === 'number', `the levels lay an uneven pitch (difficulty ${s0.shop.rough})`);

	// The shop: buy La Bronze (30 cocoins), worn at once.
	await page.locator('.pe-shop').click();
	await page.waitForSelector('.gm-card .ps-list', { timeout: 5000 });
	const row = page.locator('.ps-list li', { hasText: 'La Bronze' });
	await row.locator('.ps-act').click();
	await sleep(300);
	const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem('ludiven-cocottes')));
	check(wallet.balance === 170 && wallet.owned.includes('petanque:boule_bronze'), `La Bronze costs 30 cocoins (balance ${wallet.balance})`);
	check((await state()).shop.equipped.boule === 'boule_bronze', 'a bought boule is worn');

	// A jack: changes at once.
	await page.locator('.ps-tab', { hasText: 'Bouchons' }).click();
	await page.locator('.ps-list li', { hasText: 'Bouchon jaune' }).locator('.ps-act').click();
	await sleep(200);
	check((await state()).shop.equipped.jack === 'jack_jaune', 'a bought jack is worn');

	// A decor: the square, re-dressed round the pitch now.
	await page.locator('.ps-tab', { hasText: 'Décors' }).click();
	await page.locator('.ps-list li', { hasText: 'La place du village' }).locator('.ps-act').click();
	await sleep(1500);
	check((await state()).shop.decor === 'place', 'a bought decor stands round the pitch at once');
	// 200 - 30 - 15 - 100 = 55 left: the harbour (180) stays locked and says what is missing.
	const port = page.locator('.ps-list li', { hasText: 'Le port' });
	check(await port.locator('.ps-act').isDisabled() && (await port.innerText()).includes('Encore 125 cocoins'),
		'an item the balance does not cover cannot be bought, and says how much is missing');
	await page.locator('.gm-x').click();

	// Free play: the next match plays La Bronze, on the 70/100 pitch the terrain row asked for.
	await page.getByRole('tab', { name: /Libre/ }).click();
	await sleep(600);
	await page.locator('.pe-ground .pe-replay').click();
	await sleep(1200);
	const s1 = await state();
	const k0 = s1.shop.kits?.[0];
	check(!!k0 && k0.m === 0.72 && k0.r === 0.038 && k0.e === 0.86, `the next match plays La Bronze's make (${JSON.stringify(k0)})`);
	check(s1.shop.rough === 0.7, `free play lays the pitch the terrain row asked for (${s1.shop.rough})`);
	check(s1.terrain && s1.terrain.amp === 0.049, `its relief follows the difficulty (${s1.terrain?.amp} m)`);

	// The daily: every boule plays as the standard one, whatever is worn.
	await page.getByRole('tab', { name: /Défi/ }).click();
	// The course's own ground, not free play's still under it: the daily state shows up before it is laid.
	await page.waitForFunction((seed) => { const s = window.__petanque(); return s.daily !== null && s.terrain && s.terrain.seed !== seed; },
		s1.terrain.seed, { timeout: 15000 });
	await sleep(500);
	const s2 = await state();
	check(s2.shop.kits === null && s2.shop.rough === null, 'the daily keeps the even pitch and the standard boule');
	check(s2.bs.every((b) => b.side === -1 || Math.abs(b.r - 0.0375) < 1e-9), 'the daily\'s boules are standard size');

	// A reload keeps what was bought and worn.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__petanque && window.__petanque().status, null, { timeout: 20000 });
	const s3 = await state();
	check(s3.shop.equipped.boule === 'boule_bronze' && s3.shop.equipped.jack === 'jack_jaune' && s3.shop.equipped.decor === 'decor_place', 'a reload keeps the boule, the jack and the decor');

	check(errs.length === 0, `no page error${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
} finally {
	await browser.close();
	server.stop();
}
console.log(fail.length ? `\n${fail.length} FAIL` : '\nall ok');
process.exit(fail.length ? 1 : 0);
