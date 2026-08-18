/* Throwaway: 8-ball multiplayer over the REAL Supabase Realtime. Two browser contexts — one
   creates a friend code, the other joins — then a break from the host must replay identically
   on both peers (deterministic lockstep). Also covers the two cosmetic aids: the opponent's cue
   stick streamed while they aim, and the top view during ball in hand. Needs network. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4357;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const FS = `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
  .faux-fs .bi-help { display: none !important; }
  .faux-fs .bi-modetoggle { display: block !important; }`;
const mk = async (label) => {
	const ctx = await browser.newContext({ viewport: { width: 820, height: 680 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error') console.log(`[${label}] ERR:`, m.text()); });
	await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.bi-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
	await page.addStyleTag({ content: FS });
	await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
	await sleep(700);
	return page;
};
const snap = (p) => p.evaluate(() => (window.__billard ? window.__billard() : null));
const setCam = async (p, want) => { for (let i = 0; i < 4; i++) { if ((await snap(p)).camMode === want) return; await p.locator('.bi-act[title="Changer de vue"]').click(); await sleep(900); } };
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`); if (!ok) fails++; };

const A = await mk('A'), B = await mk('B');

// A creates a code.
await A.locator('.bi-modetoggle button:has-text("En ligne")').click();
await A.locator('button:has-text("Créer un code")').click();
await sleep(2500);
const code = (await A.locator('.bi-mp-code strong').textContent().catch(() => null))?.trim();
console.log('code:', code);
if (!code) { console.log('FAIL: no code (Supabase unreachable?)'); await browser.close(); server.kill(); process.exit(1); }

// B joins with the code.
await B.locator('.bi-modetoggle button:has-text("En ligne")').click();
await B.locator('.bi-mp-join input').fill(code);
await B.locator('.bi-mp-join button:has-text("Rejoindre")').click();

// Wait for both to reach a live 8-ball match.
let a, b;
for (let i = 0; i < 50; i++) { await sleep(300); a = await snap(A); b = await snap(B); if (a?.n === 16 && b?.n === 16 && a?.match8 && b?.match8) break; }
console.log('A:', a && { n: a.n, turn: a.match8?.turn }, ' B:', b && { n: b.n, turn: b.match8?.turn });
if (!(a?.n === 16 && b?.n === 16)) { console.log('FAIL: both peers did not reach a 16-ball match'); await browser.close(); server.kill(); process.exit(1); }

const host = a.myPlayer === 0 ? A : B, guest = a.myPlayer === 0 ? B : A;
console.log('host is', a.myPlayer === 0 ? 'A' : 'B');
// Hide the mode toggle again so the topbar shrinks back to the layout where the break grab works,
// then let the camera finish easing — cueScreen is only trustworthy once it has settled.
for (const p of [A, B]) await p.addStyleTag({ content: '.faux-fs .bi-modetoggle { display: none !important; }' });
await sleep(2500);
const hs = await snap(host);

check((await snap(guest)).stickVisible === false, 'pas de canne adverse avant le geste');

// The host grabs the cue and pulls WITHOUT releasing: the guest must grow a ghost stick.
// The grab can miss while the camera is still gliding (cueScreen is a projection), so re-read
// the ball and try again instead of running the whole scenario on a drag that never took.
const box = await host.locator('.bi-canvas').boundingBox();
let cs = hs.cueScreen, pullY = 0;
for (let i = 0; i < 4; i++) {
	cs = (await snap(host)).cueScreen;
	pullY = Math.min(cs.y + 150, box.y + box.height - 14);
	await host.mouse.move(cs.x, cs.y);
	await host.mouse.down();
	await host.mouse.move(cs.x + 5, pullY, { steps: 20 });
	if ((await snap(host)).aiming) break;
	await host.mouse.up();
	await sleep(1200);
}
check((await snap(host)).aiming === true, 'le host tient la canne');

let g = null;
for (let i = 0; i < 30; i++) { await sleep(200); g = await snap(guest); if (g?.stickVisible && g?.remoteAim?.live) break; await host.mouse.move(cs.x + 6, pullY - (i % 2), { steps: 2 }); }
console.log('guest remoteAim:', g?.remoteAim);
check(!!g?.remoteAim?.live, 'le guest recoit la visee adverse (live)');
check(g?.stickVisible === true, 'la canne adverse est affichee chez le guest');
check(!!g?.remoteAim && g.remoteAim.power > 0.05, `la puissance suit le tirage (${g?.remoteAim?.power?.toFixed(2)})`);
await setCam(guest, 'top'); // the whole table, so the ghost stick is in frame on the shot
await host.mouse.move(cs.x + 7, pullY - 2, { steps: 2 }); // keep the stream alive
await sleep(600);
await guest.screenshot({ path: resolve(`${OUT}/billard-mp-oppcue.png`) });
await setCam(guest, 'shoulder'); // so the top view we expect below is not the one we picked

// Ease the pull down to a feather tap, then release: the cue rolls a few units and touches
// nothing — a foul, so the guest gets ball in hand.
await host.mouse.move(cs.x + 5, cs.y + 40, { steps: 12 });
await sleep(200);
await host.mouse.up();
for (let i = 0; i < 60; i++) { await sleep(250); a = await snap(A); b = await snap(B); if (!a?.rolling && !b?.rolling && a?.match8?.broken) break; }
console.log('after break — A:', a && { potted: a.potted, turn: a.match8?.turn, bih: a.match8?.ballInHand },
	' B:', b && { potted: b.potted, turn: b.match8?.turn, bih: b.match8?.ballInHand });
check(a?.potted === b?.potted && a?.match8?.turn === b?.match8?.turn && a?.match8?.broken === b?.match8?.broken, 'lockstep conserve apres le tir');
const gAfter = await snap(guest);
check(!gAfter?.remoteAim || gAfter.remoteAim.live === false, 'la canne fantome est retiree apres le tir');
check(gAfter?.placing === true, 'le guest a la bille en main apres la faute');
check(gAfter?.camMode === 'top', `la camera passe en vue du haut (${gAfter?.camMode})`);
await sleep(1400); // let the camera glide there
await guest.screenshot({ path: resolve(`${OUT}/billard-bih-top.png`) });

// A gesture started AWAY from the white ball turns the view — it must not drop the ball there.
// No drag here on purpose: panning would flag the camera as user-set and the restore check below
// (which only fires on an untouched camera) would no longer mean anything.
const far = (await snap(guest)).cueScreen;
await guest.mouse.move(far.x + 220, far.y - 120);
await guest.mouse.down();
await guest.mouse.up();
await sleep(500);
const gAway = await snap(guest);
check(gAway?.placing === true, 'un geste loin de la bille ne valide pas le placement');
check(Math.hypot(gAway.cueScreen.x - far.x, gAway.cueScreen.y - far.y) < 2, 'la blanche ne saute pas sous le doigt');

// Placing the ball gives the player's own view back.
const gcs = (await snap(guest)).cueScreen;
await guest.mouse.move(gcs.x, gcs.y);
await guest.mouse.down();
await guest.mouse.move(gcs.x - 40, gcs.y + 20, { steps: 10 });
await guest.mouse.up();
await sleep(700);
const gPlaced = await snap(guest);
check(gPlaced?.placing === false, 'la bille en main est validee au relachement');
check(gPlaced?.camMode === 'shoulder', `la vue du joueur revient apres le placement (${gPlaced?.camMode})`);

console.log(fails ? `\n${fails} FAIL` : '\nTOUT OK');
await browser.close();
server.kill();
