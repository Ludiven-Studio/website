// Generates per-game preview images (Open Graph + card thumbnails) by screenshotting
// each game "in situation". Requires a built site served locally.
//
//   npm run build && npm run og
//
// Produces, for every daily-capable game (those with a .daily-chip on /jeux):
//   public/assets/jeux/<id>.jpg       — raw game screenshot (card thumbnail)
//   public/assets/jeux/og/<id>.jpg    — same shot + a branded 1200×630 band (OG preview)
//
// Set OG_BASE to reuse an already-running server (e.g. OG_BASE=http://localhost:4321),
// otherwise the script spawns `astro preview` on port 4321 and shuts it down at the end.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'jeux');
const PORT = 4321;
const DOMAIN = 'ludiven-studio.fr';
const START_RE = /commencer|jouer|go|d[ée]marrer|rejouer|play|▶/i; // NOT "partie rapide" (multiplayer)
const BOT_RE = /🤖|contre le bot|ordinateur|entra[iî]nement|vs\s*bot|solo/i;
const FREE_RE = /mode libre|^\s*libre\s*$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeout = 40000) {
	const t0 = Date.now();
	for (;;) {
		try {
			const res = await fetch(url, { method: 'HEAD' });
			if (res.ok || res.status === 404) return;
		} catch {
			/* not up yet */
		}
		if (Date.now() - t0 > timeout) throw new Error(`Serveur injoignable: ${url}`);
		await sleep(400);
	}
}

async function main() {
	await mkdir(path.join(OUT, 'og'), { recursive: true });

	let server = null;
	let base = process.env.OG_BASE;
	if (!base) {
		base = `http://localhost:${PORT}`;
		server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: ROOT, shell: true, stdio: 'ignore' });
		await waitForServer(base);
	}

	const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] }); // software WebGL for 3D games
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();

	// Discover all playable games from the /jeux grid.
	await page.goto(`${base}/jeux/`, { waitUntil: 'networkidle' });
	const allJeux = await page.evaluate(() => {
		const out = [];
		document.querySelectorAll('.game-card-wrap[data-game-id]').forEach((w) => {
			const id = w.getAttribute('data-game-id');
			const href = w.querySelector('a.game-card[href]')?.getAttribute('href');
			if (id && href) out.push({ id, href });
		});
		return out;
	});
	// OG_ONLY=snake,flappy → recapture only those games.
	const only = (process.env.OG_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
	const jeux = only.length ? allJeux.filter((j) => only.includes(j.id)) : allJeux;
	console.log(`${jeux.length} jeux à capturer${only.length ? ` (filtre: ${only.join(', ')})` : ''}`);

	// Pre-mark tutorials as "seen" (never auto-open) and set a pseudo (some modes, e.g.
	// pong "vs ordinateur", refuse to start without a name).
	await ctx.addInitScript((ids) => {
		try {
			localStorage.setItem('ludiven-tuto-seen', JSON.stringify(ids));
			if (!localStorage.getItem('ludiven-player')) localStorage.setItem('ludiven-player', 'Ludiven');
		} catch {
			/* ignore */
		}
	}, jeux.map((j) => j.id));

	// Click the first visible, enabled button whose text matches `rxSrc`. Returns true if clicked.
	const clickBtn = (rxSrc) =>
		page.evaluate((src) => {
			const rx = new RegExp(src, 'i');
			const vis = (el) => el && el.offsetParent !== null && el.getClientRects().length > 0;
			const b = Array.from(document.querySelectorAll('button')).find((x) => vis(x) && !x.disabled && rx.test(x.textContent || ''));
			if (b) {
				b.click();
				return true;
			}
			return false;
		}, rxSrc);

	// Click a start CTA — prefer the primary button inside a visible overlay.
	const startCTA = () =>
		page.evaluate((src) => {
			const rx = new RegExp(src, 'i');
			const vis = (el) => el && el.offsetParent !== null && el.getClientRects().length > 0;
			for (const ov of Array.from(document.querySelectorAll('[class*="overlay"]')).filter(vis)) {
				const btns = Array.from(ov.querySelectorAll('button')).filter((x) => vis(x) && !x.disabled);
				const b = btns.find((x) => rx.test(x.textContent || '')) || btns[0];
				if (b) {
					b.click();
					return true;
				}
			}
			const b = Array.from(document.querySelectorAll('button')).find((x) => vis(x) && !x.disabled && rx.test(x.textContent || ''));
			if (b) {
				b.click();
				return true;
			}
			return false;
		}, START_RE.source);

	const startGame = async () => {
		// Multiplayer → launch a game vs the bot.
		if (await clickBtn(BOT_RE.source)) {
			await sleep(500);
			return;
		}
		// Force free mode (some games default to the daily, which needs a pseudo).
		if (await clickBtn(FREE_RE.source)) await sleep(200);
		for (let i = 0; i < 3; i++) {
			const started = await startCTA();
			await sleep(500);
			if (!started) break;
		}
	};

	let ok = 0;
	for (const { id, href } of jeux) {
		try {
			await page.goto(`${base}${href}`, { waitUntil: 'networkidle' });
			await page.waitForSelector('.game-page [class$="-root"]', { timeout: 12000 }).catch(() => {});
			const title = await page.$eval('.game-head h1', (el) => el.textContent?.trim()).catch(() => id);

			// Hide site chrome, center the game on a dark backdrop.
			await page.addStyleTag({
				content: `nav, footer, .game-head { display: none !important; }
					.game-page { max-width: none !important; width: 100vw; min-height: 100vh; margin: 0 !important; padding: 0 !important; display: flex; align-items: center; justify-content: center; }
					body, .backgrounds { background: ${process.env.OG_BG || 'linear-gradient(160deg, #f0d5e8, #d8cfef, #c6d4f1)'} !important; }
					${process.env.OG_CSS || ''}`, // OG_CSS='.lc-root{zoom:0.75}' → extra per-run tweaks (e.g. fit tall games)
			});

			if (!process.env.OG_NOSTART) await startGame(); // OG_NOSTART=1 → capture the ready scene
			await sleep(1100);

			// OG_HIDE_OVERLAY=1 → hide tutorial + start/game-over overlays for a clean board
			// (e.g. Snake dies instantly under auto-play and would otherwise show "Perdu").
			if (process.env.OG_HIDE_OVERLAY) {
				await page.evaluate(() => {
					document.querySelectorAll('.tuto, .tuto-overlay, [class$="-overlay"], [class*="overlay"]').forEach((o) => (o.style.display = 'none'));
				});
				await sleep(120);
			}

			await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 82 });

			// Branded band → OG variant.
			await page.evaluate(({ title, domain }) => {
				document.getElementById('og-band')?.remove();
				const bar = document.createElement('div');
				bar.id = 'og-band';
				bar.style.cssText =
					'position:fixed;left:0;right:0;bottom:0;height:118px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;background:linear-gradient(to top, rgba(9,11,17,0.97), rgba(9,11,17,0.80));color:#fff;z-index:2147483647;box-sizing:border-box;';
				bar.innerHTML =
					`<div style="font-family:Rubik,system-ui,sans-serif;font-weight:600;font-size:42px;line-height:1.05;">${title}</div>` +
					`<div style="text-align:right;font-family:'Public Sans',system-ui,sans-serif;">` +
					`<div style="font-size:23px;font-weight:700;color:#c8b6ff;">Gratuit · sans pub · sans inscription</div>` +
					`<div style="font-size:21px;opacity:0.82;margin-top:4px;">${domain}</div></div>`;
				document.body.appendChild(bar);
			}, { title, domain: DOMAIN });
			await sleep(120);

			await page.screenshot({ path: path.join(OUT, 'og', `${id}.jpg`), type: 'jpeg', quality: 82 });
			ok++;
			console.log(`  ✓ ${id}`);
		} catch (e) {
			console.warn(`  ✗ ${id}: ${e.message}`);
		}
	}

	await browser.close();
	if (server) server.kill();
	console.log(`Terminé : ${ok}/${jeux.length} jeux capturés → public/assets/jeux/`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
