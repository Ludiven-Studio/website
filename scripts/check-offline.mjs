// The site offline after one visit: the service worker installs from the home page, the network goes away,
// then every game page must open from the precache, mount its game and fetch nothing it cannot get.
// Usage: node scripts/check-offline.mjs [game …]   (needs `npm run build` first)
import { readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4397;
const BASE = `http://localhost:${PORT}`;
const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const GAMES = named.length
	? named
	: readdirSync('dist/jeux', { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(`dist/jeux/${d.name}/index.html`)).map((d) => d.name);
const PAGES = ['/', '/jeux/', ...GAMES.map((g) => `/jeux/${g}/`)];
// Games that load a big engine on demand (/vendor/, cached once fetched): played once online first.
const ON_DEMAND = ['molkky'].filter((g) => GAMES.includes(g));

const server = await startServer(PORT);
const browser = await chromium.launch();
const fails = [];
try {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/`, { waitUntil: 'load' });
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
	});
	const precached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
	console.log(`service worker in control, ${precached} entries cached`);
	for (const g of ON_DEMAND) {
		const engine = page.waitForResponse((r) => r.url().includes('/vendor/'), { timeout: 30000 }).catch(() => {});
		await page.goto(`${BASE}/jeux/${g}/`, { waitUntil: 'load' });
		await engine;
		await page.waitForTimeout(1500);
	}
	await ctx.setOffline(true);

	for (const path of PAGES) {
		const p = await ctx.newPage();
		const missed = [];
		const errors = [];
		p.on('requestfailed', (r) => {
			const u = new URL(r.url());
			// Images are cached on demand, never precached: offline they may be missing and the page copes.
			if (u.origin === BASE && r.resourceType() !== 'image') missed.push(u.pathname);
		});
		p.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
		try {
			await p.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 20000 });
		} catch (e) {
			fails.push(`${path}: does not open offline (${e.message.split('\n')[0]})`);
			await p.close();
			continue;
		}
		const r = await p.evaluate(() => new Promise((done) => {
			const kids = [...(document.querySelector('.game-page')?.children ?? [])];
			const end = kids.findIndex((el) => el.classList.contains('game-foot'));
			const island = kids.find((el, i) => i < end && el.tagName === 'ASTRO-ISLAND');
			const box = document.querySelector('.game-down');
			const t0 = performance.now();
			const tick = () => {
				const mounted = !island || island.childElementCount > 0;
				if ((mounted && performance.now() - t0 > 1500) || performance.now() - t0 > 6000)
					return done({ h1: !!document.querySelector('h1'), mounted, down: !!box?.classList.contains('on') });
				setTimeout(tick, 100);
			};
			tick();
		})).catch((e) => ({ navigated: e.message.split('\n')[0] }));
		const bad = [
			!r.navigated && !r.h1 && 'no h1',
			!r.navigated && !r.mounted && 'game never mounted',
			r.down && 'the "could not load" box shows',
			missed.length && `fetched offline: ${[...new Set(missed)].join(', ')}`,
			errors.length && `errors: ${errors.join(' | ')}`,
		].filter(Boolean);
		if (bad.length) fails.push(`${path}: ${bad.join('; ')}`);
		await p.close();
	}
	console.log(`${PAGES.length} pages opened offline`);
} finally {
	await browser.close();
	server.stop();
}
if (fails.length) {
	console.error(`FAIL\n${fails.join('\n')}`);
	process.exit(1);
}
console.log('OK');
