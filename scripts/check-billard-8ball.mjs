/* Throwaway smoke check: 8-ball Libre/Niveaux renders 16 balls, a human break advances the
   match, and the AI takes its turn. Deterministic rules live in the Vitest suites. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4351;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
// Fill the frame so the cue sits at a predictable foreground spot.
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
  .faux-fs .bi-help { display: none !important; }
`});
await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
await sleep(1800);

const snap = () => page.evaluate(() => (window.__billard ? window.__billard() : null));
let s = await snap();
console.log('initial:', s && { n: s.n, eightBall: s.eightBall, turn: s.match8?.turn, broken: s.match8?.broken, open: s.match8?.open });
if (!s || s.n !== 16) { console.log('FAIL: expected 16 balls (cue + 15), got', s?.n); await browser.close(); server.kill(); process.exit(1); }

// Human break: drag from the cue (foreground low-centre) hard into the rack.
const box = await page.locator('.bi-canvas').boundingBox();
const gx = box.x + box.width * 0.5, gy = box.y + box.height * 0.72;
await page.mouse.move(gx, gy); await page.mouse.down();
await page.mouse.move(gx + 6, gy + box.height * 0.24, { steps: 14 }); // pull straight down → shoot up into the rack, hard
await sleep(200); await page.mouse.up();

// Poll: the break should register (broken), balls should roll, and the AI should get a turn.
let rollingPhases = 0, wasRolling = false, brokeSeen = false;
for (let i = 0; i < 140; i++) {
	await sleep(200);
	s = await snap();
	if (s?.match8?.broken) brokeSeen = true;
	if (s?.rolling && !wasRolling) rollingPhases++;
	wasRolling = !!s?.rolling;
	if (s?.match8?.winner != null) break;
	if (brokeSeen && rollingPhases >= 2 && !s?.rolling) break; // human break + at least one AI shot, settled
}
s = await snap();
console.log('after break+AI:', s && { potted: s.potted, broken: s.match8?.broken, turn: s.match8?.turn, open: s.match8?.open, winner: s.match8?.winner, groups: s.match8?.groups });
await page.screenshot({ path: resolve(`${OUT}/billard-8ball.png`) });
console.log('→', `${OUT}/billard-8ball.png`);
console.log('brokeSeen:', brokeSeen, '| rollingPhases:', rollingPhases, brokeSeen && rollingPhases >= 2 ? 'OK: break + AI turn' : 'CHECK');

await browser.close();
server.kill();
