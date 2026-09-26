/* Guard: an online pétanque match survives a flaky phone. Real Supabase Realtime, two contexts
   joined by code; B's websocket runs through a proxy that can swallow what the server sends it.
     1. B misses a whole throw of A's (and the host's ruling): it must catch up by itself, with the
        same boules and rules as A, and the match must go on.
     2. B reloads the page at rest: it walks back into the same match, same seat, same board.
     3. B reloads while A's boule is rolling: that throw is lost with the page, and must come back.
   While B is gone, A must say so on screen instead of looking frozen. Needs network. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4372;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };
const bail = async (why) => { console.log(`FAIL: ${why}`); await browser.close(); server.stop(); process.exit(1); };

let dropB = false;
const mk = async (label, proxy) => {
	const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
	if (proxy) {
		await ctx.routeWebSocket(/supabase/, (ws) => {
			const srv = ws.connectToServer();
			ws.onMessage((m) => srv.send(m));
			srv.onMessage((m) => { if (!dropB) ws.send(m); });
		});
	}
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`[${label}] THROW ${e.message}`));
	await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	return page;
};

const goFull = async (page) => {
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1200);
};
const snap = (p) => p.evaluate(() => (window.__petanque ? window.__petanque() : null));
const ground = (s) => s.bs.map((x) => `${x.side}:${x.x.toFixed(9)},${x.y.toFixed(9)},${x.z.toFixed(9)},${x.live ? 1 : 0}`).join('|');
const rules = (s) => `${s.match.turn}/${s.match.phase}/${s.match.left.join('-')}/${s.match.scores.join('-')}/${s.match.endNo}`;

const A = await mk('A', false), B = await mk('B', true);

await A.getByRole('tab', { name: /ligne/i }).click();
await A.locator('button:has-text("Créer un code")').click();
await sleep(2500);
const code = (await A.locator('.pe-mp-code strong').textContent().catch(() => null))?.trim();
if (!code) await bail('no code (Supabase unreachable?)');
await B.getByRole('tab', { name: /ligne/i }).click();
await B.locator('.pe-mp-join input').fill(code);
await B.locator('.pe-mp-join button:has-text("Rejoindre")').click();

let a = null, b = null;
for (let i = 0; i < 60; i++) {
	await sleep(400);
	a = await snap(A); b = await snap(B);
	if (a?.online && b?.online) break;
}
if (!(a?.online && b?.online)) await bail('both peers did not reach a live match');
const sideB = b.online.side;
console.log(`code ${code} · A side ${a.online.side} · B side ${sideB}`);

const boxes = new Map();
const full = async (p) => { await goFull(p); boxes.set(p, await p.locator('.pe-canvas').boundingBox()); };
await full(A); await full(B);

const settled = async (p, ms = 45000) => p.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: ms });

/** Fire the boule of whoever is on turn; waits only for the thrower's own board. */
async function throwOn(page) {
	const s = await snap(page);
	if (s.match.phase === 'throw-jack') {
		await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	} else {
		const box = boxes.get(page), arm = s.arm;
		const x = box.x + arm.cx, y = box.y + arm.cy, pull = box.y + arm.top - 130;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x, pull, { steps: 14 });
		await sleep(300);
		await page.mouse.up();
	}
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
	await settled(page);
}

async function placeOn(page) {
	const box = boxes.get(page);
	await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.42);
	await sleep(300);
	await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 5000 });
	await sleep(800);
}

/** Both boards agree and rest. */
async function agree(ms) {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		a = await snap(A); b = await snap(B);
		if (a && b && a.status !== 'rolling' && b.status !== 'rolling' && ground(a) === ground(b) && rules(a) === rules(b)) return true;
		await sleep(400);
	}
	return false;
}

/** Play normally until it is A's turn with a boule in hand (the jack is down). */
async function untilATurn() {
	for (let step = 0; step < 20; step++) {
		if (!(await agree(20000))) return false;
		const onTurn = a.match.turn === a.online.side ? A : B;
		if (a.status === 'placing') { await placeOn(onTurn); continue; }
		if (onTurn === A && a.match.phase === 'play') return true;
		await throwOn(onTurn);
	}
	return false;
}

/* ---- 1. a throw lost in transit ---- */
if (!(await untilATurn())) await bail('could not reach A on turn');
const before = (await snap(B)).bs.length;
dropB = true;
await throwOn(A);
await sleep(1500); // the host's ruling goes out, and is swallowed too
const blind = await snap(B);
dropB = false;
check(blind.bs.length === before, `B n'a rien reçu pendant la coupure (${blind.bs.length} corps, avant ${before})`);
const t0 = Date.now();
const caught = await agree(20000);
check(caught, `B rattrape le lancer perdu seul (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
check(ground(a) === ground(b), 'même sol après rattrapage');
if (!caught) console.log('   A', a.status, rules(a), a.bs.length, JSON.stringify(a.online), '\n   B', b.status, rules(b), b.bs.length, JSON.stringify(b.online));

/* ---- 2. reload at rest ---- */
if (!(await untilATurn())) await bail('could not reach A on turn (2)');
const pre = await snap(B);
await B.reload({ waitUntil: 'networkidle' });
let awaySeen = false;
for (let i = 0; i < 40; i++) {
	if (await A.locator('.pe-link').isVisible().catch(() => false)) awaySeen = true;
	const s = await snap(B).catch(() => null);
	if (s?.online && s.status !== 'rolling') break;
	await sleep(300);
}
b = await snap(B);
check(!!b?.online, 'B revient dans la partie après rechargement');
check(b?.online?.side === sideB, `B garde son siège (${b?.online?.side})`);
check(ground(b) === ground(pre), `B retrouve le même sol (${b.bs.length} corps)`);
check(await agree(15000), 'les deux plateaux concordent après le rechargement');
await full(B);

/* ---- 3. reload while A's boule rolls ---- */
if (!(await untilATurn())) await bail('could not reach A on turn (3)');
const box = boxes.get(A), arm = (await snap(A)).arm;
await A.mouse.move(box.x + arm.cx, box.y + arm.cy);
await A.mouse.down();
await A.mouse.move(box.x + arm.cx, box.y + arm.top - 130, { steps: 14 });
await sleep(300);
await A.mouse.up();
await A.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
await B.reload({ waitUntil: 'networkidle' });
for (let i = 0; i < 20 && !awaySeen; i++) {
	if (await A.locator('.pe-link').isVisible().catch(() => false)) awaySeen = true;
	await sleep(250);
}
await settled(A);
const t1 = Date.now();
const back = await agree(25000);
check(back, `le lancer fait pendant le rechargement arrive sur B (${((Date.now() - t1) / 1000).toFixed(1)} s, ${b?.bs.length}/${a?.bs.length} corps)`);
check(awaySeen, 'A affiche que l’adversaire est déconnecté');
await full(B);

/* ---- the match goes on ---- */
let more = 0;
for (let step = 0; step < 8 && more < 2; step++) {
	if (!(await agree(20000))) break;
	if (a.status === 'end' || a.status === 'over') break;
	const onTurn = a.match.turn === a.online.side ? A : B;
	if (a.status === 'placing') { await placeOn(onTurn); continue; }
	await throwOn(onTurn);
	more++;
}
check(more >= 1 && (await agree(20000)), `la partie continue ensuite (${more} lancers, plateaux identiques)`);
check(!(await A.locator('.pe-link').isVisible()) && !(await B.locator('.pe-link').isVisible()), 'plus de bandeau de connexion une fois revenu');

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
