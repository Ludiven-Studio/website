/* Throwaway: browsers join the same friend-code room and race. Checks the netcode end to end —
   seats, host go, ghosts moving, standings agreeing — plus the lobby rules: countdown rewinds on
   a latecomer, fires on its own, and a lone host can launch against bots.
   Run against `npm run preview`. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4321';
const URL = `${BASE}/jeux/bolides`;

const standings = (page) => page.$$eval('.bo-leaderboard li:not(.goal)', (ls) => ls.map((l) => l.textContent.trim()));
const seats = (page) => page.$$eval('.bo-roster li', (ls) => ls.map((l) => l.textContent.trim()));
const countdown = async (page) => {
	const t = await page.textContent('.bo-card .bo-sub');
	const m = /dans (\d+)/.exec(t);
	return m ? Number(m[1]) : -1;
};

/** Seat -> pct, keyed by the dot colour so it does not depend on the local labels ('Toi'). */
const byColour = (page) => page.$$eval('.bo-leaderboard li:not(.goal)', (ls) => ls.map((l) => ({
	colour: l.querySelector('.bo-dot').style.background,
	pct: Number(/([\d.]+)%/.exec(l.textContent)?.[1] ?? -1),
})));

async function open(browser, label, rich) {
	const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error') console.log(`[${label}] console: ${m.text()}`); });
	page.on('pageerror', (e) => console.log(`[${label}] pageerror: ${e.message}`));
	// A fresh context owns nothing, so the garage would only offer the free car.
	if (rich) {
		await page.addInitScript(() => {
			localStorage.setItem('ludiven-cocottes', JSON.stringify({
				balance: 999,
				owned: ['cocotte', 'car:comet', 'car:hornet', 'car:drifter', 'car:bunker'],
				equipped: null, lastReward: '',
			}));
		});
	}
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.getByRole('tab', { name: /En ligne/ }).click();
	return { ctx, page, label };
}

/** Pick a bolide through the real garage UI, exactly like a player would. */
async function pick(who, label) {
	await who.page.getByRole('button', { name: /Garage/ }).click();
	await who.page.waitForSelector('.bo-cars li');
	const btn = who.page.locator('.bo-cars li', { hasText: label }).locator('.bo-pick');
	await btn.scrollIntoViewIfNeeded();
	if (await btn.isEnabled()) await btn.click(); // already equipped = the free car
	else if ((await btn.textContent()).includes('Choisir')) throw new Error(`cannot pick ${label}`);
	await who.page.getByRole('button', { name: 'Fermer' }).click();
	await who.page.waitForTimeout(200);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

/* --- 1. a lone host races the bots --- */
const solo = await open(browser, 'S');
await solo.page.getByRole('button', { name: /Créer un code ami/ }).click();
await solo.page.waitForSelector('.bo-code strong', { timeout: 15000 });
await wait(3000); // long enough that an auto-start would have fired if we had one wrong
console.log('solo countdown (want -1):', await countdown(solo.page));
await solo.page.getByRole('button', { name: /Jouer contre les bots/ }).click();
await solo.page.waitForSelector('.bo-leaderboard', { timeout: 15000 });
console.log('solo racing vs bots:', await standings(solo.page));
await solo.ctx.close();

/* --- 2. three drivers, latecomer rewinds the clock, auto-start fires --- */
const a = await open(browser, 'A');
const b = await open(browser, 'B');
const c = await open(browser, 'C');

await a.page.getByRole('button', { name: /Créer un code ami/ }).click();
await a.page.waitForSelector('.bo-code strong', { timeout: 15000 });
const code = (await a.page.textContent('.bo-code strong')).trim();
console.log('code:', code);

const join = async (who) => {
	await who.page.locator('.bo-join input').fill(code);
	await who.page.getByRole('button', { name: 'Rejoindre' }).click();
	await who.page.waitForSelector('.bo-code strong', { timeout: 15000 });
};
await join(b);
await a.page.waitForFunction(() => document.querySelectorAll('.bo-roster li').length === 2, null, { timeout: 15000 });
await wait(4000);
const before = await countdown(a.page);
await join(c);
await a.page.waitForFunction(() => document.querySelectorAll('.bo-roster li').length === 3, null, { timeout: 15000 });
await wait(1500);
const after = await countdown(a.page);
console.log(`countdown before the 3rd: ${before}, after: ${after} (want it to jump back up)`);
console.log('lobby A:', await seats(a.page));
console.log('lobby C:', await seats(c.page));

// Nobody presses anything: the 10 s clock has to drop the flag by itself.
for (const who of [a, b, c]) await who.page.waitForSelector('.bo-leaderboard', { timeout: 20000 });
console.log('all three racing, no click');

await a.page.keyboard.down('ArrowUp');
await b.page.keyboard.down('ArrowRight');
await c.page.keyboard.down('ArrowLeft');
await wait(6000);
await a.page.keyboard.up('ArrowUp');
await b.page.keyboard.up('ArrowRight');
await c.page.keyboard.up('ArrowLeft');

for (const who of [a, b, c]) console.log(`${who.label} sees:`, await standings(who.page));
await a.page.screenshot({ path: 'D:/tmp/bolides-mp-a.png' });
await c.page.screenshot({ path: 'D:/tmp/bolides-mp-c.png' });
for (const who of [a, b, c]) await who.ctx.close();

/* --- 3. a full grid, four different bolides: the seat/car order must match everywhere --- */
const PICKS = [['P1', 'Cocotte GT'], ['P2', 'Comète'], ['P3', 'Frelon'], ['P4', 'Toupie']];
const four = [];
for (const [label] of PICKS) four.push(await open(browser, label, true));
for (let i = 0; i < four.length; i++) await pick(four[i], PICKS[i][1]);
console.log('picks:', await Promise.all(four.map((w) => w.page.evaluate(() => window.__bolides().car))));

await four[0].page.getByRole('button', { name: /Créer un code ami/ }).click();
await four[0].page.waitForSelector('.bo-code strong', { timeout: 15000 });
const code4 = (await four[0].page.textContent('.bo-code strong')).trim();
console.log('code (4p):', code4);
const join4 = async (who) => {
	await who.page.locator('.bo-join input').fill(code4);
	await who.page.getByRole('button', { name: 'Rejoindre' }).click();
	await who.page.waitForSelector('.bo-code strong', { timeout: 15000 });
};
// Read the roster at three drivers: a full grid starts the race instantly and wipes the lobby.
await join4(four[1]);
await join4(four[2]);
await four[0].page.waitForFunction(() => document.querySelectorAll('.bo-roster li').length === 3, null, { timeout: 20000 });
for (const who of four.slice(0, 3)) console.log(`lobby ${who.label}:`, await seats(who.page));
await join4(four[3]);

for (const who of four) await who.page.waitForSelector('.bo-leaderboard', { timeout: 25000 });
console.log('four racing');

const grids = await Promise.all(four.map((w) => w.page.evaluate(() => window.__bolides().seats)));
grids.forEach((g, i) => console.log(`seats ${four[i].label}:`, g.join(' ')));
const ref = grids[0].join(',');
if (grids.some((g) => g.join(',') !== ref)) throw new Error('seat/car order differs between clients');
if (new Set(grids[0]).size !== 4) throw new Error(`grid is not four different bolides: ${ref}`);

// Loop, do not just cruise: only a closed loop captures ground, and flat 0.9 % everywhere
// would agree between clients even if the sim had drifted.
const keys = [['ArrowUp', 'ArrowRight'], ['ArrowUp', 'ArrowLeft'], ['ArrowRight'], ['ArrowUp', 'ArrowRight']];
for (let i = 0; i < four.length; i++) for (const k of keys[i]) await four[i].page.keyboard.down(k);
await wait(16000);
for (let i = 0; i < four.length; i++) for (const k of keys[i]) await four[i].page.keyboard.up(k);
await wait(1200); // let the last host tick reach everyone before sampling

const boards = await Promise.all(four.map((w) => byColour(w.page)));
boards.forEach((bd, i) => console.log(`${four[i].label} sees:`, bd.map((r) => `${r.colour} ${r.pct}%`).join(' | ')));
const order = (bd) => bd.map((r) => r.colour).join(',');
if (boards.some((bd) => order(bd) !== order(boards[0]))) throw new Error('standings order differs between clients');
// Clients are sampled a few frames apart, so only a real desync moves a score by whole points.
for (const bd of boards) {
	for (let i = 0; i < bd.length; i++) {
		if (Math.abs(bd[i].pct - boards[0][i].pct) > 1.5) throw new Error(`standings drifted: ${JSON.stringify(boards)}`);
	}
}
console.log('4 clients, 4 different bolides, same seats and same standings');
await four[0].page.screenshot({ path: 'D:/tmp/bolides-mp-p1.png' });
await four[3].page.screenshot({ path: 'D:/tmp/bolides-mp-p4.png' });
for (const who of four) await who.ctx.close();

/* --- 4. swapping bolide inside a lobby: presence carries the car, so the room stays up and the
       peer sees the new chip. Two drivers means a 10 s auto-start, which is the budget here. --- */
const r = await open(browser, 'R', true);
const w = await open(browser, 'W');
await r.page.getByRole('button', { name: /Créer un code ami/ }).click();
await r.page.waitForSelector('.bo-code strong', { timeout: 15000 });
const codeBefore = (await r.page.textContent('.bo-code strong')).trim();
await w.page.locator('.bo-join input').fill(codeBefore);
await w.page.getByRole('button', { name: 'Rejoindre' }).click();
await w.page.waitForFunction(() => document.querySelectorAll('.bo-roster li').length === 2, null, { timeout: 15000 });

await pick(r, 'Blindé');
// The watcher's chip for the other seat is the only proof the swap left this browser.
await w.page.waitForFunction(
	() => [...document.querySelectorAll('.bo-roster li:not(.me) .bo-carchip')].some((e) => e.textContent.includes('Blindé')),
	null, { timeout: 6000 });
const codeAfter = (await r.page.textContent('.bo-code strong')).trim();
console.log(`lobby swap: code ${codeBefore} -> ${codeAfter}, car`, await r.page.evaluate(() => window.__bolides().car));
if (codeBefore !== codeAfter) throw new Error('a car swap tore the lobby down');
for (const who of [r, w]) await who.ctx.close();

await browser.close();
