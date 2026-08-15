/* Throwaway: 8-ball multiplayer over the REAL Supabase Realtime. Two browser contexts — one
   creates a friend code, the other joins — then a break from the host must replay identically
   on both peers (deterministic lockstep). Needs network to reach Supabase. */
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
	await page.locator('.bi-modetoggle button:has-text("Libre")').click(); // switch to Libre 8-ball
	await sleep(700);
	// Hide the toggle again so the topbar shrinks back to the layout where the break grab works.
	await page.addStyleTag({ content: '.faux-fs .bi-modetoggle { display: none !important; }' });
	await sleep(200);
	return page;
};
const snap = (p) => p.evaluate(() => (window.__billard ? window.__billard() : null));

const A = await mk('A'), B = await mk('B');

// A creates a code.
await A.locator('.bi-act[title="Jouer en ligne"]').click();
await A.locator('button:has-text("Créer un code")').click();
await sleep(2500);
const code = (await A.locator('.bi-mp-code strong').textContent().catch(() => null))?.trim();
console.log('code:', code);
if (!code) { console.log('FAIL: no code (Supabase unreachable?)'); await browser.close(); server.kill(); process.exit(1); }

// B joins with the code.
await B.locator('.bi-act[title="Jouer en ligne"]').click();
await B.locator('.bi-mp-join input').fill(code);
await B.locator('.bi-mp-join button:has-text("Rejoindre")').click();

// Wait for both to reach a live 8-ball match.
let a, b;
for (let i = 0; i < 50; i++) { await sleep(300); a = await snap(A); b = await snap(B); if (a?.n === 16 && b?.n === 16 && a?.match8 && b?.match8) break; }
console.log('A:', a && { n: a.n, turn: a.match8?.turn }, ' B:', b && { n: b.n, turn: b.match8?.turn });
if (!(a?.n === 16 && b?.n === 16)) { console.log('FAIL: both peers did not reach a 16-ball match'); await browser.close(); server.kill(); process.exit(1); }

// The host is player 0 and breaks. Fire the break on whichever page has myPlayer === 0.
const hostPage = a.myPlayer === 0 ? A : B;
const hs = a.myPlayer === 0 ? a : b;
console.log('host is', a.myPlayer === 0 ? 'A' : 'B', 'cueScreen', hs.cueScreen);
{
	const cs = hs.cueScreen;
	const box = await hostPage.locator('.bi-canvas').boundingBox();
	const pullY = Math.min(cs.y + 150, box.y + box.height - 14); // stay on-screen
	await hostPage.mouse.move(cs.x, cs.y); await hostPage.mouse.down(); // grab the cue exactly
	await hostPage.mouse.move(cs.x + 5, pullY, { steps: 14 }); // pull down → break up-table
	await sleep(150); await hostPage.mouse.up();
}
// Wait for the break to settle on both.
for (let i = 0; i < 60; i++) { await sleep(250); a = await snap(A); b = await snap(B); if (!a?.rolling && !b?.rolling && a?.match8?.broken) break; }
console.log('after break — A:', a && { potted: a.potted, broken: a.match8?.broken, turn: a.match8?.turn, open: a.match8?.open },
	' B:', b && { potted: b.potted, broken: b.match8?.broken, turn: b.match8?.turn, open: b.match8?.open });
await A.screenshot({ path: resolve(`${OUT}/billard-mp-A.png`) });
await B.screenshot({ path: resolve(`${OUT}/billard-mp-B.png`) });
const same = a && b && a.potted === b.potted && a.match8?.turn === b.match8?.turn && a.match8?.broken === b.match8?.broken;
console.log(same ? 'OK: both peers agree after the break (lockstep)' : 'CHECK: peers diverged');

await browser.close();
server.kill();
