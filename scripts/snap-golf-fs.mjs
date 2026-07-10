/* Throwaway: simulate .game-page fullscreen for golf to verify it fills wide + controls overlay. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4325;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/golf/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.gf-canvas');
// Start a Libre game so the course renders (no pseudo needed).
try { await page.locator('button:has-text("Libre")').first().click({ timeout: 2000 }); } catch {}
try { await page.locator('button:has-text("Jouer")').first().click({ timeout: 2000 }); } catch {}
await sleep(1500);
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 1rem !important; background: var(--gray-999); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .gf-root { max-width: none !important; width: 100% !important; height: 100% !important; display: flex; flex-direction: column; }
  .faux-fs .gf-boardwrap { flex: 1 !important; aspect-ratio: auto !important; max-width: none !important; }
  .faux-fs .gf-canvas { border-radius: 0 !important; border: none !important; }
  .faux-fs .gf-help { display: none !important; }
  .faux-fs .gf-board { top: 54px !important; }
  .mock-quit { position: fixed; top: 12px; right: 12px; z-index: 99999; background: #141925; color: #fff; border: 1.5px solid #505d84; border-radius: 999px; padding: 7px 14px; font: 600 14px sans-serif; }
`});
await page.evaluate(() => {
  document.querySelector('.game-page')?.classList.add('faux-fs');
  const q = document.createElement('div'); q.className = 'mock-quit'; q.textContent = '⛶ Quitter'; document.body.appendChild(q);
  window.dispatchEvent(new Event('resize')); // trigger golf's renderer resize
});
await sleep(900);
await page.screenshot({ path: resolve('D:/tmp/comfy/golf-fs.png') });
console.log('→ D:/tmp/comfy/golf-fs.png');
await browser.close();
server.kill();
