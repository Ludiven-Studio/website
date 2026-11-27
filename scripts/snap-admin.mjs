// Screenshots of the admin pages on mock data: a fake stats-admin on its own port, the dev server pointed at it
// (PUBLIC_STATS_ADMIN_URL, no sign-in), then desk and phone shots in both themes.
// node scripts/snap-admin.mjs --out shots/admin [--path /admin/stats/] [--port 4398]
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { revenueSummary } from '../supabase/functions/_shared/statsAdmin.mjs';

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
		periods: { d1: stats(d1, Math.round(d1 * 1.6)), d7: stats(d7, Math.round(d7 * 2.1)), d28: stats(d28, Math.round(d28 * 2.6)), prev7: stats(Math.round(d7 * 0.88), Math.round(d7 * 1.9)) },
		events: [], hosts: extra.hosts ?? null,
		purchases: { items: counts(extra.items ?? {}), results: counts(extra.results ?? {}), outcomes: extra.buyOut ?? null },
		signIn: { providers: counts(extra.providers ?? {}), results: counts(extra.signins ?? {}), outcomes: extra.signOut ?? null },
		ads: extra.ads ?? [],
		retention: { d1: { rate: extra.r1, visitors: Math.round(d28 * 0.7), cohorts: 27 }, d7: { rate: extra.r7, visitors: Math.round(d28 * 0.6), cohorts: 21 } },
		consent: extra.consent ?? { answers: [], opens: [], platforms: null },
		errors: extra.errors ?? [],
	};
}
const ad = (id, show, tap) => ({ ad: id, show, tap, rate: show ? tap / show : null });
const oc = (key, ok, fail = 0, cancel = 0, later = 0, mixed = 0, again = 0) => ({ key, ok, fail, mixed, cancel, later, other: 0, again });
const outcomes = (split, failures = [], cancels = []) => ({ split, failures, cancels, read: 0, total: 0, partial: false });
const fail = (key, reason, platform, build, count, version = '1.0.16', outcome = 'fail') => ({ key, outcome, reason, platform, build, version, count });
const split = (platform, visitors, answers, opens = {}) => ({ platform, visitors, answers: counts(answers), opens: counts(opens) });
const consent = (platforms, all) => ({
	answers: counts(all ?? platforms.reduce((o, p) => { for (const c of p.answers) o[c.key] = (o[c.key] ?? 0) + c.count; return o; }, {})),
	opens: counts(platforms.reduce((o, p) => { for (const c of p.opens) o[c.key] = (o[c.key] ?? 0) + c.count; return o; }, {})),
	platforms: all ? null : platforms,
});

const OVERVIEW = {
	generatedAt: ago(0.1), cached: true,
	apps: [
		app('pg', 'Pétanque Game', 'com.ludivenstudio.petanquegame', [182, 640, 1204], {
			hosts: [{ host: 'com.ludivenstudio.petanquegame', visitors: 1180, test: false }, { host: 'com.ludivenstudio.petanquegame.dev', visitors: 24, test: true }],
			items: { coins2: 14, no_ads: 9, coins1: 6, coins3: 3 }, results: { ok: 21, cancel: 9, fail: 2 },
			providers: { google: 1290, apple: 48 }, signins: { ok: 597, cancel: 7, fail: 729, later: 5 },
			signOut: outcomes([oc('google', 571, 21, 2, 5, 691, 4), oc('apple', 26, 3, 5, 0, 14)], [
				fail('google', '', 'android', 'store', 663, '1.0.14', 'mixed'), fail('apple', '', 'ios', 'store', 14, '1.0.8', 'mixed'),
				fail('google', '', 'android', 'beta', 28, '1.0.14', 'mixed'), fail('google', 'native:12500', 'android', 'store', 12),
				fail('google', 'no_token', 'android', 'beta', 9, '1.0.17'), fail('apple', 'no_session', 'ios', 'store', 3),
			]),
			buyOut: outcomes([oc('coins2', 12, 0, 2), oc('no_ads', 5, 0, 3, 0, 1), oc('coins1', 3, 1, 2), oc('coins3', 1, 0, 2)], [fail('no_ads', '', 'android', 'store', 1, '1.0.14', 'mixed'), fail('coins1', 'pending', 'ios', 'store', 1, '1.0.18')], [
				fail('coins2', 'store_sheet', 'android', 'store', 1, '1.0.18', 'cancel'), fail('no_ads', 'usercancelled', 'android', 'store', 2, '1.0.17', 'cancel'),
				fail('coins1', 'our_wait', 'ios', 'store', 2, '1.0.18', 'cancel'), fail('coins3', '', 'android', 'store', 2, '1.0.14', 'cancel'),
				fail('no_ads', 'store_sheet', 'ios', 'store', 1, '1.0.18', 'cancel'), fail('coins2', 'store_sheet', 'android', 'beta', 1, '1.0.18', 'cancel'),
			]),
			ads: [ad('dragon-gems', 4120, 61), ad('nino-rush', 3890, 44), ad('petanque-meet', 2210, 52)], r1: 0.152, r7: 0.099,
			consent: consent([split('android', 905, { yes: 212, no: 61 }, { yes: 2480, no: 690, unasked: 410 }), split('ios', 299, { yes: 48, no: 37 }, { yes: 610, no: 420, unasked: 95 })]),
		}),
		app('dg', "Dragon's Gems", 'com.ludivenstudio.dragonsgems', [64, 251, 530], {
			items: { hearts: 4, coins_m: 3 }, results: { ok: 6, cancel: 3 },
			ads: [ad('petanque-game', 1830, 37), ad('nino-rush', 1505, 18)], r1: 0.214, r7: 0.081,
			consent: consent([split('android', 402, { yes: 118, no: 30 }), split('ios', 128, { yes: 26, no: 19 })]),
		}),
		app('nino', 'Nino Rush', 'com.ludivenstudio.ninorush', [41, 170, 388], {
			items: { full: 2, wardrobe: 1 }, results: { ok: 3, fail: 1 },
			ads: [ad('dragon-gems', 990, 9), ad('petanque-game', 940, 14)], r1: 0.183, r7: 0.064,
			errors: ['retention : Umami a mis plus de 10 s à répondre'],
		}),
		app('meet', 'Pétanque Meet', 'com.ludivenstudio.petanquemeet', [23, 118, 301], {
			providers: { google: 41, apple: 9 }, signins: { ok: 47, cancel: 3 }, r1: 0.261, r7: 0.142,
			consent: consent([split('android', 230, { yes: 61, no: 24 }, { yes: 540, no: 160, unasked: 88 }), split('ios', 71, { yes: 14, no: 9 }, { yes: 120, no: 61, unasked: 30 })]),
		}),
		app('scan', 'Pétanque Scan', 'com.ludivenstudio.petanquescan', [12, 66, 175], {
			items: { premium: 3 }, results: { ok: 3, cancel: 2 }, r1: 0.122, r7: 0.051,
			consent: consent([], { yes: 41, no: 22 }),
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

// LevelPlay rows from 1 November only, as the live report: « Ce mois » then equals the 30 days.
const REV_APPS = [['Pétanque Game', 0.052], ["Dragon's Gems", 0.021], ['Pétanque Meet', 0.012]];
const revRows = [];
for (let d = 0; d < 23; d++) {
	const date = `2026-11-${String(d + 1).padStart(2, '0')}`;
	REV_APPS.forEach(([appName, base], i) => {
		const day = base * (0.6 + ((d * 7 + i * 3) % 9) / 10) * (d === 22 ? 0.35 : 1);
		revRows.push({ date, appName, platform: 'Android', networkName: 'unityAds', revenue: Math.round(day * 0.85 * 1000) / 1000, impressions: Math.round(day * 900) });
		revRows.push({ date, appName, platform: 'Android', networkName: 'ironSource', revenue: Math.round(day * 0.15 * 1000) / 1000, impressions: Math.round(day * 200) });
		if (i === 0 && d % 3 === 0) revRows.push({ date, appName, platform: 'iOS', networkName: 'unityAds', revenue: 0.01, impressions: 4 });
	});
}
const REVENUE = { ...revenueSummary(revRows, new Date(NOW)), cached: true };

const board = (app, order, name, f) => ({ app, order, name, updatedAt: ago(f.h ?? 5), play_prod: '', play_test: '', ios: '', beta: '', main: '', waits: [], ...f });
const BOARD = {
	generatedAt: ago(0.1),
	apps: [
		board('petanque-game', 1, 'Pétanque Game', { play_prod: '0.1.21 (121) en ligne', play_test: '0.1.22 (122) piste interne', ios: '0.1.21 en ligne', beta: '0.1.22 beta4', main: '0.1.22 · 4e1c2aa', waits: ['Valider les notes de version 0.1.22'] }),
		board('dragon-gems', 2, "Dragon's Gems", { play_prod: '', play_test: '1.1.8 (118) test fermé', ios: '1.1.8 en examen', beta: '1.1.8 beta3', main: '1.1.8 · 925eabf', waits: ['Répondre au questionnaire Data safety', 'Publier la fiche App Store'], h: 2 }),
		board('petanque-meet', 3, 'Pétanque Meet', { play_prod: '1.0.6 (16) en ligne', play_test: '1.0.7 (17) piste interne', ios: '1.0.6 en ligne', beta: '1.0.7', main: '1.0.7 · c09a15d' }),
		board('nino-rush', 4, 'Nino Rush', { play_test: '0.3.0 (30) piste interne', beta: '0.3.0 beta1', main: '0.3.1 · 7b2d901', waits: ['Choisir le prix de lancement'], h: 30 }),
		board('petanque-scan', 5, 'Pétanque Scan', { play_prod: '2.4.0 (240) en ligne', ios: '2.4.0 en ligne', main: '2.4.1 · 51aa0c3', h: 70 }),
	],
};

const CATALOG = JSON.parse(readFileSync('public/promo/v1/catalog.json', 'utf8'));
// SNAP_MIX=1: a few house and network mix values, to see the table's set and inherited cells.
if (process.env.SNAP_MIX) CATALOG.mix = { '*': { banner: { consent: 10 } }, 'com.ludivenstudio.ninorush': { banner: { consent: 25 }, interstitial: { consent: 20 } } };
const promoFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? promoFiles(`${dir}${f.name}/`) : [{ path: `${dir}${f.name}`, size: 1 }]));
const PROMO = {
	get: { head: '8a081890000000000000000000000000000000ab', catalog: CATALOG, blob: 'b0', files: promoFiles('public/promo/v1/'), missing: [] },
	history: { versions: [
		{ sha: '692fcfb0000000000000000000000000000000aa', date: ago(26), message: '[CHANGED] House ads weights: keyed by the base app id only' },
		{ sha: '3b7921e0000000000000000000000000000000bb', date: ago(50), message: '[ADDED] House ads admin: a weights table' },
		{ sha: 'f7bb1830000000000000000000000000000000cc', date: ago(75), message: "[CHANGED] House ads catalogue: dragon-gems changed (admin page)" },
	] },
};

const appleSale = (date, app, proceeds, currency = 'EUR', gross = proceeds / 0.7) => ({ date, app, units: 1, proceeds, currency, gross: Math.round(gross * 100) / 100, grossCurrency: currency });
const APPSTORE = {
	generatedAt: ago(0.5), from: '2026-10-25', to: '2026-11-22', errors: [], cached: true,
	sales: [
		appleSale('2026-11-03', 'Pétanque Game', 3.49), appleSale('2026-11-09', 'Pétanque Scan', 6.99), appleSale('2026-11-14', "Dragon's Gems", 4.89),
		appleSale('2026-11-18', 'Pétanque Game', 2.09, 'USD', 2.99), appleSale('2026-11-21', 'Pétanque Scan', 6.99), appleSale('2026-10-29', 'Pétanque Game', 1.39),
	],
};
const RATES = { generatedAt: ago(2), date: '2026-11-20', perEur: { EUR: 1, USD: 1.0512, CHF: 0.9381, CAD: 1.4702 }, cached: true };

const rating = (app, store, average, count, countries = []) => ({ app, store, live: count >= 0, average: count ? average : null, count: Math.max(0, count), countries, version: '', url: store === 'play' ? `https://play.google.com/store/apps/details?id=x.${app}` : `https://apps.apple.com/app/${app}/id1` });
const review = (app, h, stars, text, reply = null) => ({ app, store: 'play', stars, at: ago(h), title: '', text, lang: 'fr', version: '1.0.24', reply, replyAt: reply ? ago(h - 2) : null, link: 'https://play.google.com/apps/publish?account=1&reviewid=x' });
const REVIEW_LIST = [
	review('nino-rush', 5, 5, "Ma fille de 7 ans adore, les mondes sont superbes et Nino est trop mignon. On attend la suite !"),
	review('petanque-game', 20, 2, "Le jeu se fige après la 3e mène sur mon Galaxy A14, dommage car le reste est bien fait.", 'Merci, la 1.0.20 corrige ce blocage : dites-nous si ça va mieux.'),
	review('dragon-gems', 50, 4, 'Joli et reposant, un peu trop de vidéos à mon goût.'),
	review('petanque-scan', 70, 5, ''),
	review('petanque-meet', 120, 1, "Impossible de créer une partie dans mon club, l'appli tourne dans le vide."),
	review('nino-rush', 200, 3, 'Bien mais la caméra part dans les loopings.'),
];
const REVIEWS = {
	generatedAt: ago(1), play: process.env.SNAP_PLAY_CLOSED ? 'closed' : 'ok', cached: true, errors: [],
	reviews: process.env.SNAP_PLAY_CLOSED ? [] : REVIEW_LIST,
	apps: [
		{ app: 'petanque-game', name: 'Pétanque Game', stores: [rating('petanque-game', 'appstore', 1, 1, [{ country: 'fr', average: 1, count: 1 }]), rating('petanque-game', 'play', 4.21, 38)], last30: { average: 2, count: 1 } },
		{ app: 'petanque-scan', name: 'Pétanque Scan', stores: [rating('petanque-scan', 'appstore', 5, 1, [{ country: 'fr', average: 5, count: 1 }]), rating('petanque-scan', 'play', 4.6, 12)], last30: { average: 5, count: 1 } },
		{ app: 'petanque-meet', name: 'Pétanque Meet', stores: [rating('petanque-meet', 'appstore', 0, 0), rating('petanque-meet', 'play', 3.9, 9)], last30: { average: 1, count: 1 } },
		{ app: 'dragon-gems', name: "Dragon's Gems", stores: [rating('dragon-gems', 'appstore', 5, 1, [{ country: 'fr', average: 5, count: 1 }]), rating('dragon-gems', 'play', 4.4, 7)], last30: { average: 4, count: 1 } },
		{ app: 'nino-rush', name: 'Nino Rush', stores: [rating('nino-rush', 'appstore', 4.5, 6, [{ country: 'fr', average: 4.5, count: 4 }, { country: 'be', average: 4.5, count: 2 }]), rating('nino-rush', 'play', 4.25, 4)], last30: { average: 4, count: 2 } },
	].map((a) => (process.env.SNAP_PLAY_CLOSED ? { ...a, stores: a.stores.filter((s) => s.store === 'appstore'), last30: { average: null, count: 0 } } : a)),
};

const ANSWERS = { overview: OVERVIEW, orders: ORDERS, purchases: PURCHASES, revenue: REVENUE, board: BOARD, appstore: APPSTORE, rates: RATES, reviews: REVIEWS, ...PROMO };
// SNAP_APPS=1: no store report answers, so the purchases come from what the apps saw, as live in November 2026.
if (process.env.SNAP_APPS) for (const k of ['orders', 'appstore']) delete ANSWERS[k];
// SNAP_RELOAD=1: the home read once, then again 10 minutes later with 15 more visitors, one wait done and $1 more
// ads this month, to see the badges.
let bumped = false;
const BUMPED = {
	overview: { ...OVERVIEW, apps: OVERVIEW.apps.map((a, i) => (i ? a : { ...a, periods: { ...a.periods, d7: { ...a.periods.d7, visitors: a.periods.d7.visitors + 15 } } })) },
	board: { ...BOARD, apps: BOARD.apps.map((a, i) => (i ? a : { ...a, waits: a.waits.slice(1) })) },
	revenue: { ...REVENUE, total: { ...REVENUE.total, month: REVENUE.total.month + 1 } },
};
const answerOf = (action) => (bumped && BUMPED[action]) || ANSWERS[action];

const mock = createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
	if (req.method === 'OPTIONS') return res.writeHead(204).end();
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const { action } = JSON.parse(body || '{}');
		const answer = answerOf(action);
		res.writeHead(answer ? 200 : 400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(answer ?? { error: 'unknown action' }));
	});
});
await new Promise((r) => mock.listen(port + 1, r));
process.env.PUBLIC_STATS_ADMIN_URL = `http://localhost:${port + 1}/`;
process.env.PUBLIC_PROMO_ADMIN_URL = `http://localhost:${port + 1}/`;

mkdirSync(out, { recursive: true });
const VIEWPORTS = { desk: { width: 1366, height: 900 }, phone: { width: 390, height: 844 } };
const errors = [];
// --preview serves a build made with PUBLIC_STATS_ADMIN_URL and PUBLIC_PROMO_ADMIN_URL set to http://localhost:<port+1>/.
// --live <url> loads that site's real bundle signed in with a fake session, its function calls answered by the mocks.
const live = opt('live', '');
const server = live ? { base: live.replace(/\/$/, ''), stop() {} } : await startServer(port, { mode: args.includes('--preview') ? 'preview' : 'dev' });
const FAKE_SESSION = (() => {
	const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const user = { id: 'raph', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: ago(1000) };
	return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'raph', exp, role: 'authenticated', aud: 'authenticated' })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
})();
async function answerFunctions(page) {
	await page.addInitScript((s) => localStorage.setItem('ludiven-meetup-auth', s), JSON.stringify(FAKE_SESSION));
	await page.route(/\/functions\/v1\/(stats-admin|promo-admin)/, (route) => {
		if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
		const { action } = JSON.parse(route.request().postData() || '{}');
		const answer = answerOf(action);
		return route.fulfill({ status: answer ? 200 : 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(answer ?? { error: 'unknown action' }) });
	});
}
try {
	const browser = await chromium.launch();
	for (const path of paths) {
		for (const view of views) {
			const [kind, theme] = view.split('-');
			// The page's CSP has no room for a localhost function.
			const ctx = await browser.newContext({ viewport: VIEWPORTS[kind], deviceScaleFactor: kind === 'phone' ? 2 : 1, colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce', bypassCSP: true });
			const page = await ctx.newPage();
			if (live) await answerFunctions(page);
			page.on('pageerror', (e) => errors.push(`${path} ${view}: ${e.message}`));
			page.on('console', (m) => m.type() === 'error' && !m.text().includes('fetching the script') && errors.push(`${path} ${view}: ${m.text()}`));
			const reload = !!process.env.SNAP_RELOAD && path === '/admin/';
			bumped = false;
			if (reload) await page.clock.install();
			await page.goto(server.base + path, { waitUntil: 'networkidle' });
			if (reload) {
				await page.waitForSelector('.ah-tile strong');
				bumped = true;
				await page.clock.runFor('10:01');
				await page.waitForSelector('.ah-delta');
				await page.waitForLoadState('networkidle');
			}
			// A full-page shot would paint the fixed tab bar in the middle of the page.
			await page.addStyleTag({ content: 'astro-dev-toolbar, nav.tb { display: none !important; }' });
			await page.waitForTimeout(800);
			// SNAP_OPEN=1: the folded failure tables open.
			if (process.env.SNAP_OPEN) await page.$$eval('details.ak-fails', (ds) => ds.forEach((d) => { d.open = true; }));
			// SNAP_EDIT=1: two weights changed, then the screen as it is, the save bar at its bottom over the weights table.
			const edit = !!process.env.SNAP_EDIT && (await page.locator('.pw-root:not(.pm-root) .pw-table input[type="number"]').count()) > 0;
			if (edit) {
				const inputs = page.locator('.pw-root:not(.pm-root) .pw-table input[type="number"]');
				await inputs.first().fill('3');
				await inputs.last().fill('4');
				await page.locator('.pw-root:not(.pm-root) .pw-changed').last().evaluate((el) => el.scrollIntoView({ block: 'center' }));
				await page.waitForTimeout(300);
			}
			const name = `${path.replace(/^\/|\/$/g, '').replace(/\//g, '_')}-${view}${edit ? '-edit' : ''}.png`;
			await page.screenshot({ path: `${out}/${name}`, fullPage: !edit });
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
