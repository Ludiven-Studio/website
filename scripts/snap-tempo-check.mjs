/* Throwaway: runtime smoke-check of the Tempo music overhaul (console/page errors + snap). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4342;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'dev', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 200; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tempo"]'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(`${base}/jeux/tempo/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tp-canvas', { timeout: 60000 });
await sleep(500);
await page.locator('.tp-btn.primary.big').first().click(); // start free run
await sleep(4000);
await page.locator('.tp-playwrap').screenshot({ path: `${OUT}/tempo-check-early.png` });
// tap the canvas a few times to exercise pressLane/playPiano
for (let i = 0; i < 6; i++) { await page.mouse.click(200 + i * 80, 700); await sleep(400); }
await sleep(6000);
await page.locator('.tp-playwrap').screenshot({ path: `${OUT}/tempo-check-late.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO RUNTIME ERRORS');
await browser.close();
try { process.kill(server.pid); } catch {}
