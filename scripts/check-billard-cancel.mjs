/* Throwaway: on PC, left+right pressed together must cancel the shot being aimed (no fire).
   Grabs the cue, pulls, then presses the right button before releasing — expect status still
   'aiming' and rolling false (control run without the right press fires → rolling true). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4352;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const snap = (p) => p.evaluate(() => (window.__billard ? window.__billard() : null));

const FS = `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head, .faux-fs .bi-topbar, .faux-fs .bi-help { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }`;
const open = async () => {
	const ctx = await browser.newContext({ viewport: { width: 820, height: 720 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.bi-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
	await page.addStyleTag({ content: FS });
	await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
	await sleep(800);
	return page;
};

const pull = async (page, withCancel) => {
	const s = await snap(page);
	const cs = s.cueScreen;
	const box = await page.locator('.bi-canvas').boundingBox();
	const pullY = Math.min(cs.y + 120, box.y + box.height - 14);
	await page.mouse.move(cs.x, cs.y);
	await page.mouse.down(); // left
	await page.mouse.move(cs.x + 4, pullY, { steps: 12 });
	await sleep(120);
	const mid = await snap(page); // aiming must be true here, else the grab missed the cue
	if (withCancel) { await page.mouse.down({ button: 'right' }); await sleep(120); }
	await page.mouse.up(); // release left
	if (withCancel) { await page.mouse.up({ button: 'right' }); }
	await sleep(70); // snap before the shot settles: a real fire has rolling=true here
	const toast = await page.locator('.bi-cancel').count();
	return { mid, end: await snap(page), toast };
};

// Control: no cancel → the shot fires → rolling becomes true.
const a = await open();
const s0 = await snap(a);
console.log('initial snap:', { status: s0.status, eightBall: s0.eightBall, match8turn: s0.match8?.turn });
const ctrl = await pull(a, false);
console.log('control (no cancel): aiming@drag', ctrl.mid.aiming, '→ rolling', ctrl.end.rolling);

// Cancel: left+right → no shot → rolling stays false + toast shown.
const b = await open();
const canc = await pull(b, true);
console.log('cancel (left+right): aiming@drag', canc.mid.aiming, '→ rolling', canc.end.rolling, '· toast', canc.toast);

const ok = ctrl.mid.aiming && canc.mid.aiming && ctrl.end.rolling === true && canc.end.rolling === false && canc.toast === 1;
console.log(ok ? 'OK: left+right cancelled the shot (control fired, cancel did not)' : 'FAIL: check the numbers above');

await browser.close();
server.kill();
