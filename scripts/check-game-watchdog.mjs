// The game pages' "could not load" box (GamePage.astro), on the built site:
// - a slow phone (500 kbit/s, 400 ms, CPU 6x) never sees it on a healthy game that only mounts late;
// - a game whose code answers 404 still gets it;
// - with --all, no game page shows it on a normal connection (the false-alarm sweep).
// Usage: node scripts/check-game-watchdog.mjs [--all] [game …]   (needs `npm run build` first)
import { readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4396;
const args = process.argv.slice(2);
const named = args.filter((a) => !a.startsWith('--'));
const SLOW = named.length ? named : ['billard', 'golf', 'petanque'];
const ALL = args.includes('--all')
	? readdirSync('dist/jeux', { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(`dist/jeux/${d.name}/index.html`)).map((d) => d.name)
	: [];

// Watch the page from the inside: when the island mounts and whether the box ever shows.
const WATCH = (maxMs) => new Promise((done) => {
	const kids = [...(document.querySelector('.game-page')?.children ?? [])];
	const end = kids.findIndex((el) => el.classList.contains('game-foot'));
	const island = kids.find((el, i) => i < end && el.tagName === 'ASTRO-ISLAND');
	const box = document.querySelector('.game-down');
	if (!island || !box) return done({ island: false });
	const t0 = performance.now();
	let mounted = null, shown = null;
	const tick = () => {
		const t = Math.round(performance.now() - t0);
		if (mounted === null && island.childElementCount) mounted = t;
		if (shown === null && box.classList.contains('on')) shown = t;
		if (t > maxMs || (mounted !== null && t > 14000)) return done({ island: true, mounted, shown, on: box.classList.contains('on') });
		setTimeout(tick, 100);
	};
	tick();
});

async function open(browser, game, { slow = false, block = false } = {}) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
	const page = await ctx.newPage();
	if (slow) {
		const cdp = await ctx.newCDPSession(page);
		await cdp.send('Network.enable');
		const bytes = (500 * 1024) / 8;
		await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: bytes, uploadThroughput: bytes });
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
	}
	let blocked = null;
	if (block) {
		// The island's own module, as a deploy that removed its hash leaves it.
		await page.route('**/_astro/*.js', async (route) => {
			const url = route.request().url();
			if (blocked === null && (await page.evaluate((u) => [...document.querySelectorAll('astro-island')].some((i) => u.endsWith(i.getAttribute('component-url'))), url).catch(() => false))) {
				blocked = url;
				return route.fulfill({ status: 404, body: '' });
			}
			if (blocked === url) return route.fulfill({ status: 404, body: '' });
			return route.continue();
		});
	}
	await page.goto(`http://localhost:${PORT}/jeux/${game}/`, { waitUntil: 'load', timeout: 180_000 });
	return { ctx, page, blocked: () => blocked };
}

const server = await startServer(PORT);
const browser = await chromium.launch();
const fails = [];
try {
	for (const g of SLOW) {
		const { ctx, page } = await open(browser, g, { slow: true });
		const r = await page.evaluate(WATCH, 40000).catch(() => null);
		// A redirect page (an old game id), or a page without the watched island (Rayou's own layout).
		if (!r?.island) { await ctx.close(); continue; }
		console.log(`slow phone  ${g.padEnd(22)} mounted ${r.mounted ?? '-'} ms after load, box ${r.shown === null ? 'never' : `at ${r.shown} ms`}`);
		if (r.mounted === null || r.shown !== null) fails.push(`${g}: slow phone ${JSON.stringify(r)}`);
		await ctx.close();
	}
	{
		const g = 'billard'; // any game whose island GamePage watches
		const { ctx, page, blocked } = await open(browser, g, { block: true });
		const r = await page.evaluate(WATCH, 15000);
		console.log(`code 404    ${g.padEnd(22)} ${blocked() ? 'game module refused' : 'nothing refused'}, box ${r.on ? `shown at ${r.shown} ms` : 'not shown'}`);
		if (!blocked() || !r.on) fails.push(`${g}: 404 ${JSON.stringify(r)}`);
		await ctx.close();
	}
	const queue = [...ALL];
	await Promise.all(Array.from({ length: 4 }, async () => {
		while (queue.length) {
			const g = queue.shift();
			const { ctx, page } = await open(browser, g);
			// A redirect page (an old game id) navigates away: nothing to watch there.
			const r = await page.evaluate(WATCH, 9000).catch(() => ({ island: false }));
			if (r.island && (r.shown !== null || r.mounted === null)) fails.push(`${g}: normal ${JSON.stringify(r)}`);
			await ctx.close();
		}
	}));
	if (ALL.length) console.log(`normal      ${ALL.length} pages swept`);
} finally {
	await browser.close();
	server.stop();
}
if (fails.length) {
	console.error(`FAIL\n${fails.join('\n')}`);
	process.exit(1);
}
console.log('OK');
