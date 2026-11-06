/* The testers' way in on the apps' download pages (TesterLinks.astro, src/data/testerLinks.ts).
     · Every download page, in every language: nothing shows, and its HTML holds no beta or dev path in clear.
     · On a phone, per app: 4 quick taps or 5 slow ones on the icon show nothing; 5 quick ones show « Bêta » (or
       « Beta ») and « Dev » for the pages that exist, in that order, and each answers; a reload keeps them, a fresh
       phone does not; with storage blocked the taps still work.
     · After a build (MODE=preview): no beta nor dev page in sw.js nor in the sitemap, each one in noindex.
   MODE=preview after a build (default: dev). SHOTS=<dir> writes phone captures of the unlocked pages. */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './preview-server.mjs';

const PORT = 4531;
const MODE = process.env.MODE || 'dev';
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

// The table as the component reads it, and only the pages already written, like the component.
const table = readFileSync('src/data/testerLinks.ts', 'utf8');
const devDg = readFileSync('src/data/dragonsGems.ts', 'utf8').match(/export const TEST_APK = '([^']+)'/)[1];
const written = (p) => {
	const base = join('src/pages', p.replace(/\/$/, ''));
	return existsSync(`${base}.astro`) || existsSync(join(base, 'index.astro'));
};
const LINKS = {};
for (const [, app, beta, dev] of table.matchAll(/'([\w-]+)': \{ beta: '([^']+)', dev: ([^ ]+) \}/g)) {
	LINKS[app] = { beta, dev: dev === 'DRAGONS_GEMS_DEV' ? devDg : dev.replace(/'/g, '') };
}
const ALL_PATHS = Object.values(LINKS).flatMap((l) => [l.beta, l.dev]);

const DOWNLOADS = {
	'petanque-meet': ['/petanque-meet/telecharger/', '/en/petanque-meet/download/', '/es/petanque-meet/descargar/', '/de/petanque-meet/herunterladen/', '/it/petanque-meet/scarica/'],
	'petanque-scan': ['/petanque-scanner/telecharger/', '/en/petanque-scanner/download/', '/es/petanque-scanner/descargar/', '/de/petanque-scanner/herunterladen/', '/it/petanque-scanner/scarica/'],
	'petanque-game': ['/petanque-game/telecharger/', '/en/petanque-game/download/', '/es/petanque-game/descargar/', '/de/petanque-game/herunterladen/', '/it/petanque-game/scarica/'],
	'dragons-gems': ['/dragons-gems/telecharger/', '/en/dragons-gems/download/', '/es/dragons-gems/descargar/', '/de/dragons-gems/herunterladen/', '/it/dragons-gems/scarica/'],
};

const server = await startServer(PORT, { mode: MODE });
const browser = await chromium.launch();
const fail = [];
const line = (ok, what, detail = '') => {
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${!ok && detail ? ` — ${detail}` : ''}`);
	if (!ok) fail.push(what);
};
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function phone({ blockStorage = false } = {}) {
	const ctx = await browser.newContext({ ...PHONE, locale: 'fr-FR', reducedMotion: 'reduce' });
	await ctx.route(/stats\.ludiven-studio\.fr/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
	if (blockStorage) {
		await ctx.addInitScript(() => {
			const no = () => {
				throw new DOMException('blocked', 'SecurityError');
			};
			Storage.prototype.getItem = no;
			Storage.prototype.setItem = no;
		});
	}
	return ctx;
}

async function open(ctx, path) {
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !m.text().includes('astro-dev-toolbar') && !m.text().includes('(404) was received when fetching the script')) errors.push(m.text());
	});
	await page.goto(server.base + path, { waitUntil: 'load', timeout: 120000 });
	await page.waitForTimeout(300);
	return { page, errors };
}

const buttons = (page) => page.$$eval('.tl-row:not([hidden]) .tl-btn', (as) => as.map((a) => [a.textContent, new URL(a.href).pathname]));
const iconOf = (page) => page.getAttribute('[data-tl]', 'data-tl-icon');

async function taps(page, n, gap) {
	const icon = await iconOf(page);
	for (let i = 0; i < n; i++) {
		await page.tap(icon);
		if (gap) await page.waitForTimeout(gap);
	}
	await page.waitForTimeout(150);
}

try {
	// 1. Every download page: nothing shown, nothing readable.
	for (const [app, paths] of Object.entries(DOWNLOADS)) {
		for (const path of paths) {
			const res = await fetch(server.base + path);
			const html = await res.text();
			const clear = ALL_PATHS.filter((p) => html.includes(p) || html.includes(p.replace(/\/$/, '')));
			line(res.ok && html.includes('data-tl=') && !clear.length && !html.includes('beta-'), `${path}: the row is there, no path in clear`, `${res.status} ${clear.join(' ')}`);
		}
		void app;
	}

	// 2. The taps, on a phone, per app (French and another language).
	const others = { 'petanque-meet': 1, 'petanque-scan': 3, 'petanque-game': 4, 'dragons-gems': 2 };
	for (const [app, paths] of Object.entries(DOWNLOADS)) {
		for (const path of [paths[0], paths[others[app]]]) {
			const fr = path === paths[0];
			const want = [
				[fr ? 'Bêta' : 'Beta', LINKS[app].beta],
				['Dev', LINKS[app].dev],
			].filter(([, p]) => written(p));
			const ctx = await phone();
			const { page, errors } = await open(ctx, path);
			line((await buttons(page)).length === 0 && (await page.isHidden('[data-tl]')), `${path}: nothing before the taps`);
			await taps(page, 4, 0);
			line((await buttons(page)).length === 0, `${path}: 4 quick taps show nothing`);
			await page.waitForTimeout(800);
			await taps(page, 5, 900);
			line((await buttons(page)).length === 0, `${path}: 5 slow taps show nothing`);
			await page.waitForTimeout(800);
			await taps(page, 5, 0);
			const got = await buttons(page);
			line(JSON.stringify(got) === JSON.stringify(want), `${path}: 5 quick taps show ${want.map((w) => w[0]).join(' and ')}`, JSON.stringify(got));
			for (const [label, href] of got) {
				const r = await page.request.get(server.base + href);
				line(r.ok(), `${path}: « ${label} » answers (${href})`, String(r.status()));
			}
			if (shots && fr) await page.screenshot({ path: join(shots, `${app}-phone.png`), fullPage: false });
			await page.reload({ waitUntil: 'load' });
			await page.waitForTimeout(300);
			line(JSON.stringify(await buttons(page)) === JSON.stringify(want), `${path}: kept after a reload`);
			line(!errors.length, `${path}: no console error`, errors.join(' | '));
			await ctx.close();

			const fresh = await phone();
			const again = await open(fresh, path);
			line((await buttons(again.page)).length === 0, `${path}: a fresh phone sees nothing`);
			await fresh.close();
		}
	}

	// Unlocked once, unlocked on every app's page.
	{
		const ctx = await phone();
		const { page } = await open(ctx, DOWNLOADS['petanque-meet'][0]);
		await taps(page, 5, 0);
		const other = await open(ctx, DOWNLOADS['dragons-gems'][0]);
		line((await buttons(other.page)).length > 0, 'unlocked on Meet, shown on Dragon Gems');
		await ctx.close();
	}

	// Storage blocked: the taps still work for the visit.
	{
		const ctx = await phone({ blockStorage: true });
		const { page, errors } = await open(ctx, DOWNLOADS['petanque-scan'][0]);
		await taps(page, 5, 0);
		line((await buttons(page)).length > 0, 'storage blocked: 5 taps still show the buttons');
		// Other scripts of the page read the storage without a guard: not this component's errors.
		if (errors.length) console.log(`note  storage blocked: ${errors.length} error(s) from other scripts of the page`);
		await ctx.close();
	}

	// 3. After a build: out of sw.js and the sitemap, in noindex.
	if (MODE === 'preview') {
		const sw = await (await fetch(`${server.base}/sw.js`)).text();
		const sitemap = await (await fetch(`${server.base}/sitemap-0.xml`)).text();
		for (const p of ALL_PATHS.filter(written)) {
			const bare = p.replace(/^\/|\/$/g, '');
			line(!sw.includes(`"${bare}"`) && !sw.includes(`"${bare}/`), `${p}: not in sw.js`);
			line(!sitemap.includes(p), `${p}: not in the sitemap`);
			const html = await (await fetch(server.base + p)).text();
			line(/<meta name="robots" content="noindex/.test(html), `${p}: noindex`);
		}
	}
} finally {
	await browser.close();
	server.stop();
}

console.log(fail.length ? `\n${fail.length} check(s) failed` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
