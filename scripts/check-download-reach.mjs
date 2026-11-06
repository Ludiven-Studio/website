/* Every app's download page is reachable in one or two taps, in every language.
     · From the home page: a link to the download page itself, or to the app's page that links to it.
     · From the app's page: a link to the download page in the first screen of a phone.
     · The download page answers.
   MODE=preview after a build (default: dev). */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4532;
const MODE = process.env.MODE || 'dev';
const LANGS = ['fr', 'en', 'es', 'de', 'it'];
const HOME = { fr: '/', en: '/en/', es: '/es/', de: '/de/', it: '/it/' };
const at = (lang, path) => (lang === 'fr' ? path : `/${lang}${path}`);

const APPS = {
	'Pétanque Meet': {
		landing: { fr: '/petanque-meet/', en: '/en/petanque-meet/' },
		download: { fr: '/petanque-meet/telecharger/', en: '/en/petanque-meet/download/', es: '/es/petanque-meet/descargar/', de: '/de/petanque-meet/herunterladen/', it: '/it/petanque-meet/scarica/' },
	},
	'Pétanque Scan': {
		landing: Object.fromEntries(LANGS.map((l) => [l, at(l, '/petanque-scanner/')])),
		download: { fr: '/petanque-scanner/telecharger/', en: '/en/petanque-scanner/download/', es: '/es/petanque-scanner/descargar/', de: '/de/petanque-scanner/herunterladen/', it: '/it/petanque-scanner/scarica/' },
	},
	'Pétanque Game': {
		landing: Object.fromEntries(LANGS.map((l) => [l, at(l, '/petanque-game/')])),
		download: { fr: '/petanque-game/telecharger/', en: '/en/petanque-game/download/', es: '/es/petanque-game/descargar/', de: '/de/petanque-game/herunterladen/', it: '/it/petanque-game/scarica/' },
	},
	"Dragon's Gems": {
		landing: Object.fromEntries(LANGS.map((l) => [l, at(l, '/dragons-gems/')])),
		download: { fr: '/dragons-gems/telecharger/', en: '/en/dragons-gems/download/', es: '/es/dragons-gems/descargar/', de: '/de/dragons-gems/herunterladen/', it: '/it/dragons-gems/scarica/' },
	},
};

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' };

const server = await startServer(PORT, { mode: MODE });
const browser = await chromium.launch();
const fail = [];
const line = (ok, what, detail = '') => {
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` (${detail})` : ''}`);
	if (!ok) fail.push(what);
};

async function open(ctx, path) {
	const page = await ctx.newPage();
	await page.goto(server.base + path, { waitUntil: 'load', timeout: 120000 });
	return page;
}

const hrefs = (page) => page.$$eval('a[href]', (as) => [...new Set(as.map((a) => new URL(a.href).pathname))]);

/** The first link to `path` that shows, and how far down the page it starts. */
async function firstShown(page, path) {
	const link = page.locator(`a[href="${path}"]:visible`).first();
	try {
		// The Meet map is a client-only island: its links come after the page's load.
		await link.waitFor({ state: 'visible', timeout: 15000 });
	} catch {
		return null;
	}
	// The page is still at its top: the box's y is the distance from the page's top.
	const box = await link.boundingBox();
	return box ? Math.round(box.y) : null;
}

try {
	const ctx = await browser.newContext({ ...PHONE });
	await ctx.route(/stats\.ludiven-studio\.fr/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

	for (const lang of LANGS) {
		const home = await open(ctx, HOME[lang]);
		const fromHome = await hrefs(home);
		await home.close();

		for (const [app, { landing, download }] of Object.entries(APPS)) {
			const dl = download[lang];
			const res = await fetch(server.base + dl);
			line(res.ok, `${lang} ${app}: ${dl} answers`, String(res.status));

			if (fromHome.includes(dl)) {
				line(true, `${lang} ${app}: 1 tap from the home page`);
				continue;
			}
			const page = landing[lang];
			if (!page || !fromHome.includes(page)) {
				line(false, `${lang} ${app}: the home page links neither ${dl} nor the app's page`, page ?? 'no app page');
				continue;
			}
			const p = await open(ctx, page);
			const y = await firstShown(p, dl);
			await p.close();
			line(y !== null && y < PHONE.viewport.height, `${lang} ${app}: 2 taps from the home page, via ${page}`, y === null ? 'no shown link' : `link at ${y} px`);
		}

		// The app's pages that the home page does not lead to still link their download page.
		for (const [app, { landing, download }] of Object.entries(APPS)) {
			const page = landing[lang];
			if (!page || fromHome.includes(page)) continue;
			const p = await open(ctx, page);
			const y = await firstShown(p, download[lang]);
			await p.close();
			line(y !== null && y < PHONE.viewport.height, `${lang} ${app}: ${page} links its download page`, y === null ? 'no shown link' : `link at ${y} px`);
		}
	}
	await ctx.close();
} finally {
	await browser.close();
	server.stop();
}

console.log(fail.length ? `\n${fail.length} check(s) failed` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
