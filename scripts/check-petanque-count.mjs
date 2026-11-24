/* Guard: counting now, played for real in the browser (Pétanque Game's Rules13.CountNow).
   A side alone with boules that holds the point may count at once when those points win the match:
     1. on the player's turn, the « Compter … et gagner » button shows exactly then, and taking it wins
        the match with the boules in hand unplayed;
     2. on the computer's turn it counts at once: the match ends with its boules unplayed, and the card
        says so.
   Starts a Libre match at 12-12, so any end that reaches that layout wins it, and plays until one of
   the two shows up (or a match ends without it, which is legal: the last boule closed the end).
   node scripts/check-petanque-count.mjs [--port 4402] [--tries 6] */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = Number(arg('port', 4402));
const TRIES = Number(arg('tries', 6));
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT, { mode: 'dev' });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };
const state = () => page.evaluate(() => window.__petanque());
const near = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
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
const offerBtn = () => page.getByRole('button', { name: /et gagner/ });
const cardText = () => page.locator('.pe-endnote').textContent({ timeout: 4000 }).catch(() => '');

let box, cx, cy, seam;
async function open() {
	await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 30000 });
	await page.getByRole('tab', { name: /Libre/ }).click();
	await sleep(700);
	// Facile: the player's plain throws then hold the point often enough for the offer to come up.
	await page.locator('.pe-ground').getByRole('button', { name: /^Facile$/ }).click();
	await page.locator('.pe-ground .pe-replay').click();
	await page.waitForFunction(() => window.__petanque().status === 'aim', null, { timeout: 30000 });
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1200);
	box = await page.locator('.pe-canvas').boundingBox();
	cx = box.x + box.width * 0.5;
	const arm = await page.evaluate(() => window.__petanque().arm);
	cy = box.y + arm.cy;
	seam = box.y + arm.top;
	await page.evaluate(() => window.__petanqueScores(12, 12));
}

async function humanThrow() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, seam - 132, { steps: 12 });
	await sleep(250);
	await page.mouse.up();
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 }).catch(() => {});
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(400);
}

let seenOffer = false, seenAiCount = false, missed = null, wrongOffer = null;
for (let attempt = 1; attempt <= TRIES && !(seenOffer && seenAiCount) && !missed && !wrongOffer; attempt++) {
	await open();
	let offeredThisEnd = false;
	for (let step = 0; step < 80; step++) {
		const s = await state();
		if (s.status === 'end' || s.status === 'over') break;
		if (s.status === 'rolling') { await sleep(250); continue; }
		if (s.status === 'placing') {
			if (s.match.turn === 0) {
				await page.mouse.click(cx, box.y + box.height * 0.42);
				await sleep(250);
				await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 4000 });
				await sleep(400);
			} else await sleep(300);
			continue;
		}
		if (s.status === 'aim' && s.match.phase === 'throw-jack') {
			if (s.match.turn === 0) {
				await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
				await page.waitForFunction(() => window.__petanque().status !== 'aim', null, { timeout: 4000 }).catch(() => {});
				await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
				await sleep(400);
			} else await sleep(300);
			continue;
		}
		if (s.match.turn !== 0) { await sleep(300); continue; }

		const due = !offeredThisEnd && s.match.left[0] > 0 && s.match.left[1] === 0 && holderOf(s) === 0;
		const shown = await offerBtn().isVisible().catch(() => false);
		if (due && !shown) { missed = `no offer though the player alone holds ${s.match.left[0]} boule(s) and the point at 12-12`; break; }
		if (shown && !due && !offeredThisEnd) { wrongOffer = `an offer with left ${s.match.left.join('/')} and the point to ${holderOf(s)}`; break; }
		if (shown) {
			offeredThisEnd = true;
			seenOffer = true;
			const inHand = s.match.left[0];
			await offerBtn().click();
			await page.waitForFunction(() => window.__petanque().status === 'over', null, { timeout: 6000 });
			const fin = await state();
			check(fin.match.phase === 'match-done' && fin.match.winner === 0, `taking the offer wins the match (${fin.match.scores.join('-')})`);
			check(fin.bs.filter((b) => b.side === 0).length === 3 - inHand, `the ${inHand} boule(s) in hand stay unplayed`);
			check((await cardText()).includes('Tu comptes'), 'the end panel says the player counted');
			break;
		}
		await humanThrow();
	}
	const fin = await state();
	if (!seenAiCount && fin.match.phase === 'match-done' && fin.match.winner === 1 && fin.match.left[1] > 0) {
		seenAiCount = true;
		check(fin.bs.filter((b) => b.side === 1).length === 3 - fin.match.left[1], `the computer won with ${fin.match.left[1]} boule(s) unplayed`);
		check((await cardText()).includes('L’adversaire compte'), 'the end panel says the computer counted');
	}
	console.log(`     match ${attempt}: ${fin.match.scores.join('-')} · left ${fin.match.left.join('/')} · offer ${seenOffer} · computer counted ${seenAiCount}`);
}

check(missed === null, missed ?? 'the offer shows whenever it is due');
check(wrongOffer === null, wrongOffer ?? 'no offer when it is not due');
check(seenOffer || seenAiCount, `at least one count-now branch was played (offer ${seenOffer}, computer ${seenAiCount})`);
console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
