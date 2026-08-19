/* Tron theme: own it via localStorage, check the boutique section, the in-game toggle,
   the live rebuild both ways, FX on the neon table, and that no purchase = no theme. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4365;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 820, height: 680 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text()); });
const snap = () => page.evaluate(() => (window.__billard ? window.__billard() : null));
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`); if (!ok) fails++; };

// Own the theme + start with it active.
await page.addInitScript(() => {
	localStorage.setItem('ludiven-cocottes', JSON.stringify({ balance: 40, owned: ['cocotte', 'skin:billard-tron'], equipped: null, lastReward: '' }));
	localStorage.setItem('billard-theme', 'tron');
});

// Boutique: the theme section shows the owned state.
await page.goto(`${base}/jeux/boutique/`, { waitUntil: 'networkidle' });
await sleep(600);
check((await page.locator('text=Thèmes de jeu').count()) > 0, 'la boutique a une section Thèmes');
check((await page.locator('text=Billard Néon').count()) > 0, 'le thème Billard Néon y figure');
const themeItem = page.locator('.bp-item', { hasText: 'Billard Néon' });
check((await themeItem.locator('a:has-text("Jouer")').count()) > 0, 'le thème possédé montre "Jouer →"');
await themeItem.screenshot({ path: resolve(`${OUT}/billard-tron-shop.png`) });

// In game: loads straight into the Tron skin.
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
await page.locator('.bi-modetoggle button:has-text("Libre")').click();
await sleep(900);
await page.locator('.gf-btn').click();
await sleep(2500);
check((await snap()).skin === 'tron', 'la partie demarre avec le skin tron');
await page.screenshot({ path: resolve(`${OUT}/billard-tron-table.png`) });

// Toggle back to classic and again to tron — live rebuild both ways.
const btn = page.locator('button[aria-label="Thème néon"]');
check((await btn.count()) === 1, 'le bouton de theme est present');
await btn.click();
await sleep(800);
check((await snap()).skin === 'classic', 'retour a la table classique');
await page.screenshot({ path: resolve(`${OUT}/billard-tron-back-classic.png`) });
await btn.click();
await sleep(800);
check((await snap()).skin === 'tron', 're-activation du skin tron');

// A shot on the neon table: FX still spawn, nothing breaks.
const cue = (await snap()).cueScreen;
const box = await page.locator('.bi-canvas').boundingBox();
await page.mouse.move(cue.x, cue.y);
await page.mouse.down();
await page.mouse.move(cue.x + 4, Math.min(cue.y + 150, box.y + box.height - 14), { steps: 18 });
await sleep(150);
await page.mouse.up();
await sleep(1500);
await page.screenshot({ path: resolve(`${OUT}/billard-tron-break.png`) });
let s = null;
for (let i = 0; i < 200; i++) { await sleep(70); s = await snap(); if (!s.rolling && i > 10) break; }
console.log('fx after break:', s.fx);
check(s.fx.bornSparks > 10, `les etincelles marchent sur la table neon (${s.fx.bornSparks})`);
check(s.fx.bornTrailPts > 8, `les trainees marchent sur la table neon (${s.fx.bornTrailPts})`);

// Without the unlock: no theme button, classic skin even with the pref set.
const ctx2 = await browser.newContext({ viewport: { width: 820, height: 680 } });
const p2 = await ctx2.newPage();
await p2.addInitScript(() => { localStorage.setItem('billard-theme', 'tron'); });
await p2.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await p2.waitForSelector('.bi-canvas');
try { await p2.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
await p2.locator('.bi-modetoggle button:has-text("Libre")').click();
await sleep(900);
const s2 = await p2.evaluate(() => window.__billard());
check(s2.skin === 'classic', 'sans achat, la pref est ignoree (classic)');
check((await p2.locator('button[aria-label="Thème néon"]').count()) === 0, 'sans achat, pas de bouton theme');

console.log(fails ? `\n${fails} FAIL` : '\nTOUT OK');
await browser.close();
server.kill();
