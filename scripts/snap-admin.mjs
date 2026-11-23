// Screenshots of the admin pages on mock data: a fake stats-admin on its own port, the dev server pointed at it
// (PUBLIC_STATS_ADMIN_URL, no sign-in), then desk and phone shots in both themes.
// node scripts/snap-admin.mjs --out shots/admin [--path /admin/stats/] [--port 4398]
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const out = opt('out', 'shots/admin');
const port = Number(opt('port', 4398));
const paths = args.flatMap((a, i) => (a === '--path' ? [args[i + 1]] : []));
if (!paths.length) paths.push('/admin/stats/');
const views = opt('views', 'desk,desk-dark,phone,phone-dark').split(',');

const NOW = Date.parse('2026-11-23T10:00:00Z');
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
const stats = (visitors, visits) => ({ visitors, visits, pageviews: 0 });
const counts = (o) => Object.entries(o).map(([key, count]) => ({ key, count }));

function app(id, name, domain, [d1, d7, d28], extra) {
	return {
		id, name, domain,
		periods: { d1: stats(d1, Math.round(d1 * 1.6)), d7: stats(d7, Math.round(d7 * 2.1)), d28: stats(d28, Math.round(d28 * 2.6)) },
		events: [], hosts: extra.hosts ?? null,
		purchases: { items: counts(extra.items ?? {}), results: counts(extra.results ?? {}) },
		signIn: { providers: counts(extra.providers ?? {}), results: counts(extra.signins ?? {}) },
		ads: extra.ads ?? [],
		retention: { d1: { rate: extra.r1, visitors: Math.round(d28 * 0.7), cohorts: 27 }, d7: { rate: extra.r7, visitors: Math.round(d28 * 0.6), cohorts: 21 } },
		errors: extra.errors ?? [],
	};
}
const ad = (id, show, tap) => ({ ad: id, show, tap, rate: show ? tap / show : null });

const OVERVIEW = {
	generatedAt: ago(0.1), cached: true,
	apps: [
		app('pg', 'Pétanque Game', 'com.ludivenstudio.petanquegame', [182, 640, 1204], {
			hosts: [{ host: 'com.ludivenstudio.petanquegame', visitors: 1180, test: false }, { host: 'com.ludivenstudio.petanquegame.dev', visitors: 24, test: true }],
			items: { coins2: 14, no_ads: 9, coins1: 6, coins3: 3 }, results: { ok: 21, cancel: 9, fail: 2 },
			providers: { google: 96, apple: 11 }, signins: { ok: 98, cancel: 7, fail: 2 },
			ads: [ad('dragon-gems', 4120, 61), ad('nino-rush', 3890, 44), ad('petanque-meet', 2210, 52)], r1: 0.152, r7: 0.099,
		}),
		app('dg', "Dragon's Gems", 'com.ludivenstudio.dragonsgems', [64, 251, 530], {
			items: { hearts: 4, coins_m: 3 }, results: { ok: 6, cancel: 3 },
			ads: [ad('petanque-game', 1830, 37), ad('nino-rush', 1505, 18)], r1: 0.214, r7: 0.081,
		}),
		app('nino', 'Nino Rush', 'com.ludivenstudio.ninorush', [41, 170, 388], {
			items: { full: 2, wardrobe: 1 }, results: { ok: 3, fail: 1 },
			ads: [ad('dragon-gems', 990, 9), ad('petanque-game', 940, 14)], r1: 0.183, r7: 0.064,
			errors: ['retention : Umami a mis plus de 10 s à répondre'],
		}),
		app('meet', 'Pétanque Meet', 'com.ludivenstudio.petanquemeet', [23, 118, 301], {
			providers: { google: 41, apple: 9 }, signins: { ok: 47, cancel: 3 }, r1: 0.261, r7: 0.142,
		}),
		app('scan', 'Pétanque Scan', 'com.ludivenstudio.petanquescan', [12, 66, 175], {
			items: { premium: 3 }, results: { ok: 3, cancel: 2 }, r1: 0.122, r7: 0.051,
		}),
	],
};

const ORDER_PLAN = [
	['coins2', 4.99, 'FR'], ['no_ads', 2.99, 'FR'], ['coins1', 1.99, 'BE'], ['coins2', 4.99, 'FR'], ['hearts', 6.99, 'FR'],
	['coins3', 9.99, 'CH'], ['no_ads', 2.99, 'FR'], ['coins2', 4.99, 'FR'], ['premium', 9.99, 'FR'], ['coins1', 1.99, 'FR'],
	['coins_m', 2.49, 'FR'], ['no_ads', 2.99, 'CA'], ['coins2', 4.99, 'FR'], ['coins1', 1.99, 'FR'], ['full', 3.99, 'FR'],
];
const APP_OF = { coins1: 'Pétanque Game', coins2: 'Pétanque Game', coins3: 'Pétanque Game', no_ads: 'Pétanque Game', hearts: "Dragon's Gems", coins_m: "Dragon's Gems", premium: 'Pétanque Scan', full: 'Nino Rush' };
const CURRENCY = { CH: 'CHF', CA: 'CAD' };
const orders = ORDER_PLAN.map(([product, price, country], i) => ({
	at: ago(6 + i * 41), app: APP_OF[product], package: '', product, country,
	status: i === 4 ? 'refund' : i === 9 ? 'cancelled' : 'charged',
	currency: CURRENCY[country] ?? 'EUR', price, charged: price,
}));
const totals = Object.values(orders.filter((o) => o.status === 'charged').reduce((m, o) => {
	const t = (m[o.currency] ??= { currency: o.currency, orders: 0, charged: 0 });
	t.orders++;
	t.charged = Math.round((t.charged + o.charged) * 100) / 100;
	return m;
}, {}));
const ORDERS = { generatedAt: ago(3), from: ago(720), orders, totals, errors: [] };

const KIND_PLAN = ['real', 'real', 'real', 'tester', 'real', 'unchecked', 'real', 'beta', 'real', 'real', 'dev', 'real', 'promo', 'real'];
const ITEM_PLAN = ['coins2', 'no_ads', 'coins1', 'coins2', 'hearts', 'coins3', 'premium', 'coins2', 'coins_m', 'no_ads', 'full', 'coins1', 'wardrobe', 'coins2'];
const bought = KIND_PLAN.map((kind, i) => ({
	at: ago(4 + i * 37), app: APP_OF[ITEM_PLAN[i]] ?? 'Nino Rush', item: ITEM_PLAN[i], store: kind === 'unchecked' ? 'appstore' : 'play',
	later: i === 2, kind, buyer: ['real', 'unchecked'].includes(kind) ? [1, 2, 3, 2, 4, 5, 6, 7, 8][i % 9] : null,
}));
const PURCHASES = { generatedAt: ago(0.1), from: ago(720), purchases: bought, counted: bought.filter((p) => ['real', 'unchecked'].includes(p.kind)).length, buyers: 8, errors: [] };

const ANSWERS = { overview: OVERVIEW, orders: ORDERS, purchases: PURCHASES };

const mock = createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
	if (req.method === 'OPTIONS') return res.writeHead(204).end();
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const { action } = JSON.parse(body || '{}');
		const answer = ANSWERS[action];
		res.writeHead(answer ? 200 : 400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(answer ?? { error: 'unknown action' }));
	});
});
await new Promise((r) => mock.listen(port + 1, r));
process.env.PUBLIC_STATS_ADMIN_URL = `http://localhost:${port + 1}/`;

mkdirSync(out, { recursive: true });
const VIEWPORTS = { desk: { width: 1366, height: 900 }, phone: { width: 390, height: 844 } };
const errors = [];
const server = await startServer(port, { mode: 'dev' });
try {
	const browser = await chromium.launch();
	for (const path of paths) {
		for (const view of views) {
			const [kind, theme] = view.split('-');
			// The page's CSP has no room for a localhost function.
			const ctx = await browser.newContext({ viewport: VIEWPORTS[kind], deviceScaleFactor: kind === 'phone' ? 2 : 1, colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce', bypassCSP: true });
			const page = await ctx.newPage();
			page.on('pageerror', (e) => errors.push(`${path} ${view}: ${e.message}`));
			page.on('console', (m) => m.type() === 'error' && !m.text().includes('fetching the script') && errors.push(`${path} ${view}: ${m.text()}`));
			await page.goto(server.base + path, { waitUntil: 'networkidle' });
			// A full-page shot would paint the fixed tab bar in the middle of the page.
			await page.addStyleTag({ content: 'astro-dev-toolbar, nav.tb { display: none !important; }' });
			await page.waitForTimeout(800);
			const name = `${path.replace(/^\/|\/$/g, '').replace(/\//g, '_')}-${view}.png`;
			await page.screenshot({ path: `${out}/${name}`, fullPage: true });
			console.log(`${out}/${name}`);
			await ctx.close();
		}
	}
	await browser.close();
} finally {
	server.stop();
	mock.close();
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
