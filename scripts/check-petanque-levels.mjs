/* M6 guard: the Niveaux mode is reachable and actually starts the level it was asked for.
   Measurement G proves the ladder is tuned; this proves the ladder is WIRED. Opens the level
   picker, starts level 1, and checks the match came up on that level's config (target 5). */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4366;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });

/* The landing is levels-first (lv.resume), so a fresh device lands ON level 1, not on free play.
   Checked before anything is clicked: a landing that silently fell back to a free match to 13
   would otherwise still pass every step below. */
check((await page.evaluate(() => window.__petanque().match.target)) === 5, 'a fresh device lands on level 1 (match to 5)');

// Free play, so a broken Niveaux cannot pass by accident.
// ModeToggle segments declare role="tab", so they are not buttons to the a11y tree.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(600);
check((await page.evaluate(() => window.__petanque().match.target)) === 13, 'Libre opens a match to 13');

await page.getByRole('tab', { name: /Niveaux/ }).click();
await page.waitForSelector('.pe-levels .ls-wrap', { timeout: 5000 });
check(true, 'the Niveaux tab opens the level picker');

await page.locator('.pe-levels').getByText('1', { exact: true }).first().click();
await page.waitForFunction(() => !document.querySelector('.pe-levels'), null, { timeout: 5000 });
await sleep(600);

const s = await page.evaluate(() => window.__petanque());
check(s.match.target === 5, `level 1 starts a match to 5 (got ${s.match.target})`);
check(s.status === 'aim', `the level is playable (status ${s.status})`);
check(await page.locator('.pe-stat', { hasText: 'Niveau 1' }).count() > 0, 'the HUD shows the level badge');

// Back to free play: the tab must swap back, and the match must reset to 13.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(600);
check((await page.evaluate(() => window.__petanque().match.target)) === 13, 'the Libre tab returns to a match to 13');

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
