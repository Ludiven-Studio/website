/* Guard: the game makes sound, and the mute button really silences it.
   `sfx.played` counts every attempt that got past the enabled gate, so it is the one honest proof a
   sound fired — a screenshot cannot hear. The strong test is the muted window: boules keep landing
   and colliding (player AND AI), and the counter must not move by one. Then unmuting brings it back.
   Plays in Libre against the AI, same throw harness as check-petanque-read. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4373;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });

await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(700);
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1200);

const state = () => page.evaluate(() => window.__petanque());
const box = await page.locator('.pe-canvas').boundingBox();
const arm = await page.evaluate(() => window.__petanque().arm);
const cx = box.x + arm.cx, cy = box.y + arm.cy;
const seam = box.y + arm.top;
// aria-label toggles between "Couper le son" / "Activer le son" — both hold "son", so it always hits.
const soundBtn = page.locator('.pe-act[aria-label*="son"]');

async function humanThrow() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, seam - 132, { steps: 12 });
	await sleep(250);
	const armed = (await state()).power;
	await page.mouse.up();
	if (armed < 0.3) return false;
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 }).catch(() => {});
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 }).catch(() => {});
	await sleep(250);
	return true;
}
async function throwJack() {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 }).catch(() => {});
	await sleep(300);
}
async function placeJack() {
	await page.mouse.click(cx, box.y + box.height * 0.42);
	await sleep(250);
	await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 4000 }).catch(() => {});
	await sleep(300);
}

/* Drive one action from the current state; returns true when a THROW landed (player or a waited-out
   AI turn advances on its own). One end is plenty of impacts. */
async function drive() {
	const s = await state();
	if (s.status === 'over' || s.match.endNo > 1) return 'done';
	if (s.status === 'rolling') { await sleep(200); return 'roll'; }
	if (s.status === 'placing') { if (s.match.turn === 0) await placeJack(); else await sleep(300); return 'place'; }
	if (s.status === 'aim' && s.match.phase === 'throw-jack') { if (s.match.turn === 0) await throwJack(); else await sleep(300); return 'jack'; }
	if (s.match.turn !== 0) { await sleep(300); return 'ai'; }
	await page.waitForFunction(() => !window.__petanque().intro, null, { timeout: 9000 }).catch(() => {});
	return (await humanThrow()) ? 'threw' : 'miss';
}

const played = async () => (await state()).sound.played;

/* ---------- 1. it starts on, and a throw makes sound ---------- */

check((await state()).sound.enabled === true, 'sound is on by default');
let guard = 0;
while ((await played()) === 0 && guard++ < 30) { if ((await drive()) === 'done') break; }
const onCount = await played();
check(onCount > 0, `a throw makes sound (played ${onCount})`);

/* ---------- 2. muted, the counter does not move — even as boules keep landing ---------- */

await soundBtn.click();
await sleep(300);
check((await state()).sound.enabled === false, 'the button mutes');
const atMute = await played();
let threwWhileMuted = 0;
for (let i = 0; i < 14; i++) {
	const r = await drive();
	if (r === 'done') break;
	if (r === 'threw' || r === 'jack') threwWhileMuted++;
}
const afterMute = await played();
console.log(`     muted window: ${threwWhileMuted} throw(s), played ${atMute} -> ${afterMute}`);
check(threwWhileMuted > 0, `boules were actually thrown while muted (${threwWhileMuted})`);
check(afterMute === atMute, `muted, nothing sounds however much is thrown (${atMute} -> ${afterMute})`);

/* ---------- 3. unmute and it comes back ---------- */

await soundBtn.click();
await sleep(300);
check((await state()).sound.enabled === true, 'the button unmutes');
const atUnmute = await played();
guard = 0;
while ((await played()) === atUnmute && guard++ < 20) { if ((await drive()) === 'done') break; }
const afterUnmute = await played();
check(afterUnmute > atUnmute, `unmuted, sound returns (${atUnmute} -> ${afterUnmute})`);

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
