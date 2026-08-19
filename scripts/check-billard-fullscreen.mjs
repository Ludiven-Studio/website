/* Fullscreen billard: the site's own gf-full button must give the table the whole viewport with the
   HUD overlaid on it (and still tap-through), a shot must leave no ball spinning on the spot, and
   the hand-over card must show then leave on its own. Single player, no network. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4363;
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

await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2000 }); } catch {}
await page.locator('.bi-modetoggle button:has-text("Libre")').click();
await sleep(900);

// The site's own fullscreen button (adds gf-full; the native API call is best-effort).
await page.locator('.gf-btn').click();
await sleep(2500);
const geo = await page.evaluate(() => {
	const wrap = document.querySelector('.bi-playwrap').getBoundingClientRect();
	const bar = document.querySelector('.bi-topbar').getBoundingClientRect();
	return { wrap: { x: wrap.x, y: wrap.y, w: wrap.width, h: wrap.height }, bar: { y: bar.y, h: bar.height }, vw: innerWidth, vh: innerHeight };
});
console.log('geo:', geo);
check(geo.wrap.w === geo.vw && geo.wrap.x === 0, 'la table occupe toute la largeur');
check(geo.wrap.y === 0 && Math.abs(geo.wrap.h - geo.vh) < 1, 'la table occupe toute la hauteur');
check(geo.bar.y < geo.wrap.h / 3, 'le HUD est superpose en haut du jeu');
check(geo.bar.h < geo.vh * 0.12, `le HUD reste une bande fine (${Math.round(geo.bar.h)}px)`);
await page.screenshot({ path: resolve(`${OUT}/billard-fs-hud.png`) });

// A drag between the HUD pills must reach the canvas, not be swallowed by the bar.
const cs0 = (await snap()).cueScreen;
const box = await page.locator('.bi-canvas').boundingBox();
const pullY = Math.min(cs0.y + 150, box.y + box.height - 14);
await page.mouse.move(cs0.x, cs0.y);
await page.mouse.down();
await page.mouse.move(cs0.x + 4, pullY, { steps: 18 });
await sleep(150);
check((await snap()).aiming === true, 'la visee demarre bien sous le HUD superpose');
await page.mouse.up();

// Wait for the break to settle: no ball may keep any speed (they would spin on the spot forever).
// Sample the framing on the way: a ball you just hit must never leave the screen (edge > 1).
let s = null, movOut = 0, movEdge = 0, edge = 0;
for (let i = 0; i < 300; i++) {
	await sleep(70); s = await snap();
	if (s?.rolling) { movOut = Math.max(movOut, s.frame.movingOut); movEdge = Math.max(movEdge, s.frame.movingEdge); edge = Math.max(edge, s.frame.edge); }
	if (!s?.rolling && s?.match8?.broken) break;
}
console.log('after break:', { potted: s?.potted, moving: s?.moving, turn: s?.match8?.turn }, 'framing:', { movOut, movEdge: +movEdge.toFixed(2), edge: +edge.toFixed(2) });
check(s?.rolling === false, 'le tir est resolu');
check(s?.moving === 0, `aucune boule ne garde de vitesse apres le tir (${s?.moving})`);
check(movOut === 0, `aucune boule en mouvement ne sort du cadre (bord max ${movEdge.toFixed(2)})`);
check(edge < 2, `la table reste lisible pendant le roulement (bord max ${edge.toFixed(2)})`);

// Impact FX: the break must have spawned sparks and laid trail points (cumulative counters,
// so no frame-rate luck).
console.log('fx:', s?.fx);
check(s?.fx?.bornSparks > 10, `le break fait jaillir des etincelles (${s?.fx?.bornSparks} emises)`);
check(s?.fx?.bornTrailPts > 8, `les boules laissent des trainees (${s?.fx?.bornTrailPts} points)`);

// The hand-over card: it shows the moment the turn changes.
let sawCard = false, cardText = '';
for (let i = 0; i < 60; i++) {
	if (await page.locator('.bi-turnflash').count()) {
		sawCard = true;
		cardText = (await page.locator('.bi-turnflash').innerText()).replace(/\n/g, ' · ');
		await page.screenshot({ path: resolve(`${OUT}/billard-turnflash.png`) });
		break;
	}
	await sleep(160);
}
console.log('carte:', cardText);
check(sawCard, 'la carte de changement de joueur apparait');
for (let i = 0; i < 40; i++) { if (!(await page.locator('.bi-turnflash').count())) break; await sleep(200); }
check((await page.locator('.bi-turnflash').count()) === 0, 'la carte disparait toute seule');

// Nothing may keep glowing forever: wait for a quiet moment (the AI may shoot again in between).
let calm = false;
for (let i = 0; i < 50 && !calm; i++) {
	await sleep(300);
	const c = await snap();
	calm = !c.rolling && c.fx.sparks === 0 && c.fx.trailPts === 0;
}
check(calm, 'les FX se resorbent une fois la table immobile');

console.log(fails ? `\n${fails} FAIL` : '\nTOUT OK');
await browser.close();
server.kill();
