/* Every game page, the same two popups.
     · The 🎯 Niveaux tab opens the shared level popup (.gm-card): the page stays behind it, and
       Escape closes it without an error.
     · ?defi lays no leaderboard under the game: the day's board is behind the trophy (.lbc-pill).
   The network to the scores backend is stubbed empty, so nothing is read from or sent to prod.
   GAMES=2048,golf node scripts/check-game-popups.mjs  to run a few. */
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const PORT = 4391;
const base = `http://localhost:${PORT}`;
const NOT_GAMES = new Set(['index', 'defi', 'boutique']);
const NO_DAILY_BOARD = new Set(['accords', 'molkky']);
const all = readdirSync('src/pages/jeux').filter((f) => f.endsWith('.astro')).map((f) => f.replace(/\.astro$/, '')).filter((g) => !NOT_GAMES.has(g));
const games = process.env.GAMES ? process.env.GAMES.split(',') : all;

const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const fail = [];
const line = (g, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${g}: ${what}`); if (!ok) fail.push(`${g}: ${what}`); };

try {
	for (const g of games) {
		const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1100, height: 800 } });
		await ctx.route(/supabase\.co\/(rest|functions)\//, (r) => r.fulfill({
			status: 200, contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', 'content-range': '*/0' },
			body: r.request().url().includes('/functions/') ? '{"ok":true}' : '[]',
		}));
		const page = await ctx.newPage();
		const errs = [];
		page.on('pageerror', (e) => errs.push(e.message));
		try {
			await page.goto(`${base}/jeux/${g}/`, { waitUntil: 'networkidle' });
			// The tutorial can land a beat after the page settles, and it takes every click.
			try { await page.locator('.tuto-close').click({ timeout: 4000 }); } catch {}
			await page.waitForTimeout(600);
			// A game that opens on its next level still offers the tab; one without levels has none.
			const tab = page.getByRole('tab', { name: /Niveaux/ }).first();
			if (await tab.count()) {
				// Some games open on the grid already (all levels cleared, or no resume): close it first.
				if (await page.locator('.gm-card').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
				await tab.click();
				const open = await page.locator('.gm-card').waitFor({ timeout: 6000 }).then(() => true, () => false);
				const inPage = open && await page.evaluate(() => !!document.querySelector('.game-page .gm-card') && !!document.querySelector('.gm-x'));
				line(g, open && inPage, 'Niveaux opens the level popup');
				if (open) {
					await page.keyboard.press('Escape');
					await page.waitForTimeout(600);
					line(g, (await page.locator('.gm-card').count()) === 0, 'Escape closes it');
				}
			} else {
				console.log(`--    ${g}: no Niveaux tab`);
			}

			await page.goto(`${base}/jeux/${g}/?defi`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(1500);
			const b = await page.evaluate(() => ({
				inline: [...document.querySelectorAll('.lb-root')].filter((el) => !el.closest('.lbc-panel')).length,
				pill: document.querySelectorAll('.lbc-pill').length,
			}));
			line(g, b.inline === 0 && b.pill === (NO_DAILY_BOARD.has(g) ? 0 : 1), `?defi: board behind one trophy (inline ${b.inline}, trophies ${b.pill})`);
		} catch (e) {
			line(g, false, `crashed: ${e.message.split('\n')[0]}`);
		}
		line(g, errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
		await ctx.close();
	}
} finally {
	await browser.close();
	server.stop();
}
console.log(fail.length ? `\n${fail.length} failed:\n${fail.join('\n')}` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
