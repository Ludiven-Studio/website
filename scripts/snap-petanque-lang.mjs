/* Throwaway: the pétanque island in each of its three languages, on a phone. Each browser locale
   gets its own context, so the first visit shows what the language detection picks by itself; then
   the in-game button cycles the language, which is the path a player actually takes.
   Also reports any French left on screen in English or Spanish. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'D:/tmp/comfy';
const server = await startServer(4510, { mode: process.env.PET_DEV ? 'dev' : 'preview' });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];
// Words that only exist in the French UI: seeing one on an EN/ES screen means a missed string.
const FRENCH = /\b(Libre|Niveaux|Défi|Toi|Mène|Adversaire|Planche|Pose le doigt|Chargement|Recommencer|Terrain|Au hasard|Jouer|Quitter|Nouvelle partie|Parcours|Classement)\b/;

try {
	for (const locale of ['fr-FR', 'en-US', 'es-ES']) {
		const lang = locale.slice(0, 2);
		const ctx = await browser.newContext({ locale, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => errs.push(`${lang} THROW ${e.message}`));
		await page.goto(`${server.base}/jeux/petanque/`, { waitUntil: 'networkidle' });
		await page.waitForSelector('.pe-canvas');
		try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch { /* no tutorial */ }
		await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 20000 });
		await sleep(1200);
		const shot = async (tag) => {
			await page.screenshot({ path: resolve(`${OUT}/lang-${lang}-${tag}.png`) });
			if (lang === 'fr') return;
			const text = await page.evaluate(() => document.querySelector('.pe-root')?.innerText ?? '');
			const hit = text.match(FRENCH);
			if (hit) errs.push(`${lang} ${tag}: French left on screen — "${hit[0]}"`);
		};
		const htmlLang = await page.evaluate(() => document.documentElement.lang);
		const btn = await page.locator('.pe-lang').textContent();
		console.log(`${locale}: detected ${btn} · <html lang=${htmlLang}> · exit "${await page.locator('.gf-exit').textContent()}"`);
		await shot('1-open');

		await page.locator('.dt-seg').nth(2).click(); // free play
		await sleep(1200);
		await shot('2-free');
		// Free play opened the setup card: it is what the next shot shows.
		await sleep(500);
		await shot('3-ground');
		await page.locator('.pe-card .pe-replay').click();
		await sleep(800);

		await page.evaluate(() => window.__petanqueOver());
		await sleep(900);
		await shot('4-over');

		if (lang === 'fr') {
			// The button cycles FR -> EN -> ES without a reload.
			for (const want of ['EN', 'ES', 'FR']) {
				await page.locator('.pe-lang').click();
				await sleep(300);
				const now = await page.locator('.pe-lang').textContent();
				const exit = await page.locator('.gf-exit').textContent();
				console.log(`  cycle -> ${now} · exit "${exit}"`);
				if (now !== want) errs.push(`cycle: expected ${want}, got ${now}`);
				if (want === 'ES') await shot('5-cycled-es');
			}
		}
		await ctx.close();
	}
} finally {
	await browser.close();
	server.stop();
}
console.log(errs.length ? `\n${errs.length} problem(s):\n  ${errs.join('\n  ')}` : '\nno page error, no French left in EN/ES');
process.exit(0);
