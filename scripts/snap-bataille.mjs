/* Throwaway: fire at every cell of Bataille (→ fleet sunk) to preview the revealed board. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4323;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 640, height: 760 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["bataille"]'));
const page = await ctx.newPage();
await page.goto(`${base}/jeux/bataille/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ba-board');
// Start if there's a start overlay.
const startBtn = page.locator('.ba-startbtn');
if (await startBtn.count()) { try { await startBtn.first().click(); } catch {} }
await sleep(400);
// Fire at every cell (sinks the whole fleet → reveals ships + water).
const cells = page.locator('.ba-board .ba-cell');
const n = await cells.count();
for (let i = 0; i < n; i++) { try { await cells.nth(i).click({ timeout: 500 }); } catch {} }
await sleep(700);
// Hide the win overlay so only the board shows.
await page.evaluate(() => document.querySelectorAll('.ba-win, .ba-overlay').forEach((o) => (o.style.display = 'none')));
await sleep(150);
await page.locator('.ba-boardwrap').screenshot({ path: resolve('D:/tmp/comfy/bataille-revealed.png') });
console.log('→ D:/tmp/comfy/bataille-revealed.png');
await browser.close();
server.kill();
