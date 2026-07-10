/* Throwaway: cave portals + longer/wider tunnels (TEMP: tunnel @ seg 2, fork @ seg 4). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4341;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'dev', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 200; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["luge"]'));
const page = await ctx.newPage();
await page.goto(`${base}/jeux/luge/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.lg-canvas', { timeout: 60000 });
await sleep(800);
await page.locator('.lg-startbtn').first().click();
let shot = 0;
for (let i = 0; i < 60; i++) {
	const score = await page.evaluate(() => parseInt(document.querySelector('.lg-score')?.textContent ?? '0'));
	await sleep(700);
	if (score > 110 && shot < 16) {
		await page.locator('.lg-boardwrap').screenshot({ path: `${OUT}/luge-cave-${String(shot).padStart(2, '0')}.png` });
		console.log('shot', shot, score + ' m');
		shot++;
	}
	if (await page.locator('.lg-go-title').count()) { console.log('over at', score); break; }
	if (shot >= 16) break;
}
await browser.close();
try { process.kill(server.pid); } catch {}
