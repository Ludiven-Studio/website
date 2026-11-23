// stats-admin's logic: the studio's figures per app, read from the self-hosted Umami (one website per app),
// for /admin/stats/ and the tiles of /admin/, the recent purchases, the studio board of /admin/versions/ and the ad revenue of /admin/revenus/ (LevelPlay). Plain JavaScript with its fetch, cache and admin check passed in,
// so vitest runs it against a fake Umami and a fake table, and Deno serves it (stats-admin/index.ts).
//
// Umami differs between v2 and v3 in a few names (stats as { value } or plain numbers, `eventName` or `event`,
// `host` or `hostname`): every read below accepts both, and a call that fails leaves its figure empty, named
// in `errors`, instead of failing the page.

export const CACHE_MINUTES = 10;
export const CACHE_KEY = 'overview';
export const PERIODS = { d1: 1, d7: 7, d28: 28 };
// Cohorts need a week after them for J7: the retention report reads 5 weeks.
export const RETENTION_DAYS = 35;
export const TIMEZONE = 'Europe/Paris';
const DAY = 86_400_000;

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** A count from Umami: a number, or { value } (v2's stats). Anything else counts 0. */
export function num(v) {
	if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : 0;
	if (v && typeof v === 'object' && typeof v.value === 'number') return num(v.value);
	return 0;
}

/** Visitors, visits and page views of a stats answer. */
export function readStats(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	return { visitors: num(r.visitors), visits: num(r.visits), pageviews: num(r.pageviews) };
}

/** A metrics or event-data answer ([{ x, y }] or [{ value, total }]) as [{ key, count }], largest first.
 *  Keys stay data: a Map, never object properties. */
export function readCounts(raw) {
	const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
	const sums = new Map();
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue;
		const key = row.x ?? row.value ?? row.name;
		if ((typeof key !== 'string' && typeof key !== 'number') || key === '') continue;
		const k = String(key).slice(0, 80);
		sums.set(k, (sums.get(k) ?? 0) + num(row.y ?? row.total ?? row.count));
	}
	return [...sums].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** J1 and J7 from Umami's retention rows ({ date, day, visitors, returnVisitors }): the visitors of every cohort
 *  old enough that came back on that day, over those cohorts' visitors. Null when no cohort is old enough. */
export function readRetention(raw) {
	const rows = Array.isArray(raw) ? raw : [];
	const at = (d) => {
		const cohorts = rows.filter((r) => r && Number(r.day) === d && num(r.visitors) > 0);
		const visitors = cohorts.reduce((s, r) => s + num(r.visitors), 0);
		if (!visitors) return null;
		const back = cohorts.reduce((s, r) => s + Math.min(num(r.returnVisitors), num(r.visitors)), 0);
		return { rate: back / visitors, visitors, cohorts: cohorts.length };
	};
	const d1 = at(1);
	const d7 = at(7);
	return d1 || d7 ? { d1, d7 } : null;
}

/** Each ad's shows, taps and tap rate (null without a show). */
export function tapRates(shows, taps) {
	const ads = new Map(shows.map((s) => [s.key, { ad: s.key, show: s.count, tap: 0 }]));
	for (const t of taps) {
		const row = ads.get(t.key) ?? { ad: t.key, show: 0, tap: 0 };
		row.tap += t.count;
		ads.set(t.key, row);
	}
	return [...ads.values()].map((r) => ({ ...r, rate: r.show > 0 ? r.tap / r.show : null })).sort((a, b) => b.show - a.show || a.ad.localeCompare(b.ad));
}

/** The app's hostnames, the store build first: the ids without .dev or .beta. */
export function readHosts(counts) {
	return counts.map(({ key, count }) => ({ host: key, visitors: count, test: /\.(dev|beta)$/.test(key) }))
		.sort((a, b) => Number(a.test) - Number(b.test) || b.visitors - a.visitors);
}

/** A small Umami client on `fetch`: login, then GET and POST with the token. */
export function umami(base, fetchFn) {
	const root = String(base).replace(/\/+$/, '');
	let token = '';
	async function call(method, path, body) {
		const res = await fetchFn(`${root}/api${path}`, {
			method,
			headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			// Umami's 400 names the field it refused: keep a bit of it for the page's « Non lus » line.
			const why = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
			throw new Error(`Umami ${method} ${path.split('?')[0]}: ${res.status}${why && why !== '{}' ? ` ${why}` : ''}`);
		}
		return await res.json();
	}
	return {
		async login(username, password) {
			const r = await call('POST', '/auth/login', { username, password });
			if (!r?.token) throw new Error('Umami login: no token');
			token = r.token;
		},
		get: (path) => call('GET', path),
		post: (path, body) => call('POST', path, body),
	};
}

const query = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

/** Everything the page shows for one Umami website; each failed call is named in `errors`. */
export async function appStats(u, site, now) {
	const errors = [];
	const id = encodeURIComponent(site.id);
	const end = now.getTime();
	const range = (days) => ({ startAt: end - days * DAY, endAt: end });
	const safe = async (what, fn) => {
		try {
			return await fn();
		} catch (e) {
			errors.push(`${what}: ${String(e?.message ?? e).slice(0, 240)}`);
			return null;
		}
	};
	const values = (event, property) => safe(`${event}.${property}`, async () =>
		readCounts(await u.get(`/websites/${id}/event-data/values?${query({ ...range(28), event, eventName: event, propertyName: property })}`)));
	const [d1, d7, d28, events, hostname, iapItem, iapResult, signProvider, signResult, adShow, adTap, retention] = await Promise.all([
		...Object.values(PERIODS).map((days) => safe(`stats ${days} j`, async () => {
			// /stats counts pageviews only; the apps send events only, so their visitors come from the session
			// stats, which count every event (Umami 2.14 and later). The larger of the two wins.
			const page = readStats(await u.get(`/websites/${id}/stats?${query(range(days))}`));
			const all = await u.get(`/websites/${id}/sessions/stats?${query(range(days))}`).then(readStats).catch(() => null);
			return all ? { visitors: Math.max(page.visitors, all.visitors), visits: Math.max(page.visits, all.visits), pageviews: page.pageviews } : page;
		})),
		safe('events', async () => readCounts(await u.get(`/websites/${id}/metrics?${query({ ...range(28), type: 'event' })}`))),
		safe('hosts', async () => {
			// Newer Umami names it hostname, older host; an empty answer to hostname is an answer.
			const v3 = await u.get(`/websites/${id}/metrics?${query({ ...range(28), type: 'hostname' })}`).then(readCounts).catch(() => null);
			return v3 ?? readCounts(await u.get(`/websites/${id}/metrics?${query({ ...range(28), type: 'host' })}`));
		}),
		values('iap_result', 'item'),
		values('iap_result', 'result'),
		values('sign_in', 'provider'),
		values('sign_in', 'result'),
		values('house_ad_show', 'ad'),
		values('house_ad_tap', 'ad'),
		safe('retention', async () => {
			const startDate = new Date(end - RETENTION_DAYS * DAY).toISOString();
			const endDate = now.toISOString();
			// v3 takes parameters, v2 dateRange; each refuses the other's shape, so try one then the other.
			const v3 = { websiteId: site.id, type: 'retention', filters: {}, parameters: { startDate, endDate, timezone: TIMEZONE } };
			const v2 = { websiteId: site.id, dateRange: { startDate, endDate }, timezone: TIMEZONE };
			return readRetention(await u.post('/reports/retention', v3).catch((e3) =>
				u.post('/reports/retention', v2).catch((e2) => { throw new Error(`${e3.message} | ${e2.message}`); })));
		}),
	]);
	return {
		id: String(site.id),
		name: String(site.name ?? site.domain ?? site.id),
		domain: typeof site.domain === 'string' ? site.domain : '',
		periods: { d1, d7, d28 },
		events,
		hosts: hostname ? readHosts(hostname) : null,
		purchases: { items: iapItem, results: iapResult },
		signIn: { providers: signProvider, results: signResult },
		ads: adShow && adTap ? tapRates(adShow, adTap) : null,
		retention,
		errors,
	};
}

const rows = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);

/** A logged-in Umami client and every website its user sees. */
export async function umamiSites(env, fetchFn) {
	const u = umami(env.UMAMI_URL, fetchFn);
	await u.login(env.UMAMI_USER, env.UMAMI_PASSWORD);
	// The user's own websites, then each of its teams' websites: this Umami does not mix team websites into
	// /websites, and the studio's sites belong to a team the dashboard user only views (2026-11-20).
	const own = rows(await u.get(`/websites?${query({ includeTeams: 'true', pageSize: 200 })}`));
	const teams = rows(await u.get(`/me/teams?${query({ pageSize: 100 })}`).catch(() => u.get(`/teams?${query({ pageSize: 100 })}`)).catch(() => []));
	const teamSites = await Promise.all(teams.filter((t) => t && t.id != null)
		.map((t) => u.get(`/teams/${encodeURIComponent(t.id)}/websites?${query({ pageSize: 200 })}`).then(rows).catch(() => [])));
	const seen = new Set();
	const sites = [...own, ...teamSites.flat()]
		.filter((s) => s && (typeof s.id === 'string' || typeof s.id === 'number'))
		.filter((s) => !seen.has(s.id) && seen.add(s.id));
	return { u, sites };
}

/** The whole overview: every website the Umami user sees, then each one's figures. */
export async function overview(env, fetchFn, now) {
	const { u, sites } = await umamiSites(env, fetchFn);
	const apps = await Promise.all(sites.map((s) => appStats(u, s, now)));
	apps.sort((a, b) => (b.periods.d28?.visitors ?? 0) - (a.periods.d28?.visitors ?? 0) || a.name.localeCompare(b.name));
	return { generatedAt: now.toISOString(), apps };
}

// The board's text fields, as board.py writes them; anything else in a row is left out.
export const BOARD_FIELDS = ['name', 'play_prod', 'play_test', 'ios', 'beta', 'main'];

/** studio_board rows ({ app, data, updated_at }) as the page's list, in the board's order. */
export function readBoard(rows, now) {
	const text = (v) => (typeof v === 'string' ? v.slice(0, 600) : '');
	const apps = (Array.isArray(rows) ? rows : [])
		.filter((r) => r && typeof r.app === 'string' && r.data && typeof r.data === 'object' && !Array.isArray(r.data))
		.map((r) => {
			const d = r.data;
			const app = { app: r.app, order: Number.isFinite(d.order) ? d.order : 999, updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null };
			for (const f of BOARD_FIELDS) app[f] = text(d[f]);
			if (!app.name) app.name = r.app;
			app.waits = (Array.isArray(d.waits) ? d.waits : typeof d.waits === 'string' ? d.waits.split(' | ') : [])
				.map(text).map((w) => w.trim()).filter(Boolean).slice(0, 20);
			return app;
		});
	apps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
	return { generatedAt: now.toISOString(), apps };
}

// Ad revenue from the LevelPlay Reporting API (every mediated network, Unity Ads included), per app and day.
export const LEVELPLAY = 'https://platform.ironsrc.com';
export const REVENUE_KEY = 'revenue';
export const REVENUE_CACHE_MINUTES = 60;
export const REVENUE_DAYS = 30;
const MAX_PAGES = 20;

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const money = (v) => {
	const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
	return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 120) : '');

/** The report's dates: from the earlier of the month's first day and 29 days ago, to today (UTC, as LevelPlay). */
export function revenueRange(now) {
	const today = isoDay(now);
	const monthStart = `${today.slice(0, 8)}01`;
	const from30 = isoDay(now.getTime() - (REVENUE_DAYS - 1) * DAY);
	return { today, monthStart, from30, startDate: from30 < monthStart ? from30 : monthStart };
}

/** One report row as { date, key, name, platform, revenue, impressions }; null when it has no date.
 *  The docs show no example of the app breakdown's fields, so the likely names are all read. */
export function readRevenueRow(row) {
	if (!row || typeof row !== 'object') return null;
	const date = str(row.date ?? row.day).slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const key = str(row.appKey ?? row.app_key ?? row.applicationKey ?? row.appId);
	const name = str(row.appName ?? row.app_name ?? row.applicationName ?? row.app ?? row.title) || key || '?';
	const platform = str(row.platform ?? row.os).toLowerCase();
	return { date, key, name, platform, revenue: money(row.revenue), impressions: money(row.impressions) };
}

/** The page's figures from the report rows: totals, and per app (its platforms merged under its name)
 *  this month, the last 30 days and each of those days. */
export function revenueSummary(rows, now) {
	const r = revenueRange(now);
	const days = [];
	for (let t = new Date(`${r.from30}T00:00:00Z`).getTime(); isoDay(t) <= r.today; t += DAY) days.push(isoDay(t));
	const apps = new Map();
	const total = { month: 0, last30: 0, byDay: new Map(days.map((d) => [d, 0])) };
	for (const row of rows.map(readRevenueRow).filter(Boolean)) {
		const id = row.name.replace(/\s*\((android|ios)\)\s*$/i, '').toLowerCase();
		let app = apps.get(id);
		if (!app) {
			app = { name: row.name.replace(/\s*\((android|ios)\)\s*$/i, ''), keys: new Set(), platforms: new Map(), month: 0, last30: 0, impressions30: 0, byDay: new Map(days.map((d) => [d, 0])) };
			apps.set(id, app);
		}
		if (row.key) app.keys.add(row.key);
		if (row.date >= r.monthStart && row.date <= r.today) {
			app.month += row.revenue;
			total.month += row.revenue;
			if (row.platform) app.platforms.set(row.platform, (app.platforms.get(row.platform) ?? 0) + row.revenue);
		}
		if (app.byDay.has(row.date)) {
			app.byDay.set(row.date, app.byDay.get(row.date) + row.revenue);
			total.byDay.set(row.date, total.byDay.get(row.date) + row.revenue);
			app.last30 += row.revenue;
			app.impressions30 += row.impressions;
			total.last30 += row.revenue;
		}
	}
	const series = (m) => days.map((date) => ({ date, revenue: round2(m.get(date)) }));
	return {
		generatedAt: now.toISOString(),
		currency: 'USD',
		monthStart: r.monthStart,
		from: r.from30,
		to: r.today,
		total: { month: round2(total.month), last30: round2(total.last30), days: series(total.byDay) },
		apps: [...apps.values()]
			.map((a) => ({
				name: a.name,
				keys: [...a.keys].sort(),
				platforms: [...a.platforms].map(([platform, month]) => ({ platform, month: round2(month) })).sort((x, y) => y.month - x.month),
				month: round2(a.month),
				last30: round2(a.last30),
				impressions30: Math.round(a.impressions30),
				days: series(a.byDay),
			}))
			.sort((a, b) => b.last30 - a.last30 || b.month - a.month || a.name.localeCompare(b.name)),
	};
}

/** The report rows for those dates: a bearer token from the secret key and refresh token, then every page. */
export async function levelPlayRows(env, fetchFn, now) {
	const auth = await fetchFn(`${LEVELPLAY}/partners/publisher/auth`, {
		method: 'GET',
		headers: { secretkey: env.LEVELPLAY_SECRET_KEY, refreshToken: env.LEVELPLAY_REFRESH_TOKEN },
	});
	if (!auth.ok) throw new Error(`LevelPlay auth: ${auth.status}`);
	// The docs show the token as the bare body, which their own example strips of quotes.
	const raw = (await auth.text()).trim();
	let token = raw.replace(/^"|"$/g, '');
	if (raw.startsWith('{')) {
		try { token = JSON.parse(raw).token ?? JSON.parse(raw).access_token ?? ''; } catch { token = ''; }
	}
	if (!token) throw new Error('LevelPlay auth: no token');
	const { startDate, today } = revenueRange(now);
	const rows = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const q = query({ startDate, endDate: today, breakdowns: 'date,app,platform', metrics: 'revenue,impressions', page, resultsPerPage: 5000 });
		const res = await fetchFn(`${LEVELPLAY}/levelPlay/reporting/v1?${q}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
		if (!res.ok) {
			const why = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
			throw new Error(`LevelPlay report: ${res.status}${why ? ` ${why}` : ''}`);
		}
		const body = await res.json();
		const data = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
		rows.push(...data);
		const total = Number(body?.totalResults);
		if (!data.length || !Number.isFinite(total) || rows.length >= total) break;
	}
	return rows;
}

// Recent purchases: the apps' iap_result events (ShopEvents in LudivenTools), read one by one with their
// properties through Umami's event-data list (Umami 3, newest first). The buyer is the Umami session (one device,
// salted anew each month), read from the events list and turned into « 1, 2, 3… » here: no id leaves the function.
export const PURCHASES_KEY = 'purchases';
export const PURCHASES_DAYS = 30;
const PURCHASE_PAGE = 100;
const PURCHASE_PAGES = 5;
const NOT_REAL = new Set(['yes', 'true', '1']);

/** One event-data entry as a purchase that went through, or null: another event, another result, a tester's
 *  card or a dev build's fake store. */
export function readPurchase(entry, app) {
	if (!entry || typeof entry !== 'object') return null;
	const name = entry.eventName ?? entry.event;
	if (name !== undefined && name !== 'iap_result') return null;
	const props = new Map();
	let at = '';
	for (const p of Array.isArray(entry.eventProperties) ? entry.eventProperties : []) {
		if (!p || typeof p.dataKey !== 'string') continue;
		const v = p.stringValue ?? p.numberValue ?? p.value;
		if (v != null) props.set(p.dataKey, str(v).toLowerCase());
		if (!at && p.createdAt) at = String(p.createdAt);
	}
	const time = Date.parse(at || entry.createdAt);
	if (props.get('result') !== 'ok' || NOT_REAL.has(props.get('test') ?? '') || props.get('store') === 'dev' || !Number.isFinite(time)) return null;
	return {
		at: new Date(time).toISOString(),
		app,
		item: (props.get('item') || '?').slice(0, 40),
		store: (props.get('store') ?? '').slice(0, 20),
		later: props.get('asked') === 'no',
	};
}

/** Every app's purchases of the last 30 days, newest first; an app that could not be read is named in errors. */
export async function recentPurchases(env, fetchFn, now) {
	const { u, sites } = await umamiSites(env, fetchFn);
	const end = now.getTime();
	const startAt = end - PURCHASES_DAYS * DAY;
	const errors = [];
	const perSite = await Promise.all(sites.map(async (site) => {
		const name = String(site.name ?? site.domain ?? site.id);
		const found = [];
		const id = encodeURIComponent(site.id);
		try {
			for (let page = 1; page <= PURCHASE_PAGES; page++) {
				const q = query({ startAt, endAt: end, event: 'iap_result', page, pageSize: PURCHASE_PAGE });
				const body = await u.get(`/websites/${id}/event-data?${q}`);
				const data = rows(body);
				for (const e of data) {
					const p = readPurchase(e, name);
					if (p) found.push({ p, event: typeof e.eventId === 'string' ? e.eventId : '' });
				}
				const count = Number(body?.count);
				if (data.length < PURCHASE_PAGE || !Number.isFinite(count) || page * PURCHASE_PAGE >= count) break;
				if (page === PURCHASE_PAGES) errors.push(`${name} : plus de ${PURCHASE_PAGE * PURCHASE_PAGES} issues d'achat, seules les plus récentes sont lues`);
			}
		} catch (e) {
			errors.push(`${name} : ${String(e?.message ?? e).slice(0, 200)}`);
		}
		const sessions = new Map();
		const wanted = new Set(found.map((f) => f.event).filter(Boolean));
		try {
			for (let page = 1; page <= PURCHASE_PAGES && wanted.size > 0; page++) {
				const q = query({ startAt, endAt: end, event: 'iap_result', page, pageSize: PURCHASE_PAGE });
				const body = await u.get(`/websites/${id}/events?${q}`);
				const data = rows(body);
				for (const e of data) {
					if (!e || !wanted.has(e.id) || (typeof e.sessionId !== 'string' && typeof e.sessionId !== 'number')) continue;
					sessions.set(e.id, `${site.id}|${e.sessionId}`);
					wanted.delete(e.id);
				}
				if (data.length < PURCHASE_PAGE) break;
			}
		} catch (e) {
			errors.push(`${name} : acheteurs non lus (${String(e?.message ?? e).slice(0, 160)})`);
		}
		return found.map((f) => ({ ...f.p, session: sessions.get(f.event) ?? null }));
	}));
	const sorted = perSite.flat().sort((a, b) => b.at.localeCompare(a.at) || a.app.localeCompare(b.app));
	// Numbered in order of the newest purchase, within this answer only: the session never reaches the page.
	const buyers = new Map();
	const purchases = sorted.map(({ session, ...p }) => {
		if (session && !buyers.has(session)) buyers.set(session, buyers.size + 1);
		return { ...p, buyer: session ? buyers.get(session) : null };
	});
	return { generatedAt: now.toISOString(), from: new Date(startAt).toISOString(), purchases, buyers: buyers.size, errors };
}

/**
 * The function's request handler. deps:
 * - env: UMAMI_URL, UMAMI_USER, UMAMI_PASSWORD, PROMO_ADMIN_USER_ID, LEVELPLAY_SECRET_KEY, LEVELPLAY_REFRESH_TOKEN;
 * - isAdmin(req): true for Raphaël's account only (the same check as promo-admin);
 * - cache: { get(key) → { body, fetchedAt } | null, put(key, body) };
 * - board: { list() → studio_board rows } for /admin/versions/;
 * - fetch, now() for the tests.
 */
export function statsHandler({ env, isAdmin, cache, board, fetch: fetchFn = fetch, now = () => new Date() }) {
	return async (req) => {
		if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
		if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
		if (!env.PROMO_ADMIN_USER_ID) return json({ error: 'not configured' }, 503);
		try {
			if (!(await isAdmin(req))) return json({ error: 'not allowed' }, 403);
		} catch {
			return json({ error: 'not allowed' }, 403);
		}
		let body;
		try {
			body = await req.json();
		} catch {
			return json({ error: 'invalid JSON body' }, 400);
		}
		if (body?.action === 'board') {
			if (!board) return json({ error: 'not configured' }, 503);
			try {
				return json(readBoard(await board.list(), now()));
			} catch {
				return json({ error: 'board not readable' }, 502);
			}
		}
		if (body?.action === 'revenue') {
			if (!env.LEVELPLAY_SECRET_KEY || !env.LEVELPLAY_REFRESH_TOKEN) return json({ error: 'revenue not configured' }, 503);
			const at = now();
			const hit = body.refresh === true ? null : await Promise.resolve().then(() => cache.get(REVENUE_KEY)).catch(() => null);
			if (hit && at.getTime() - new Date(hit.fetchedAt).getTime() < REVENUE_CACHE_MINUTES * 60_000) return json({ ...hit.body, cached: true });
			let data;
			try {
				data = revenueSummary(await levelPlayRows(env, fetchFn, at), at);
			} catch (e) {
				return json({ error: 'LevelPlay did not answer', detail: String(e?.message ?? e).slice(0, 200) }, 502);
			}
			await Promise.resolve().then(() => cache.put(REVENUE_KEY, data)).catch(() => undefined);
			return json({ ...data, cached: false });
		}
		const read = body?.action === 'overview' ? { key: CACHE_KEY, load: overview } : body?.action === 'purchases' ? { key: PURCHASES_KEY, load: recentPurchases } : null;
		if (!read) return json({ error: 'unknown action' }, 400);
		if (!env.UMAMI_URL || !env.UMAMI_USER || !env.UMAMI_PASSWORD) return json({ error: 'not configured' }, 503);
		const at = now();
		const hit = body.refresh === true ? null : await Promise.resolve().then(() => cache.get(read.key)).catch(() => null);
		if (hit && at.getTime() - new Date(hit.fetchedAt).getTime() < CACHE_MINUTES * 60_000) return json({ ...hit.body, cached: true });
		let data;
		try {
			data = await read.load(env, fetchFn, at);
		} catch (e) {
			return json({ error: 'Umami did not answer', detail: String(e?.message ?? e).slice(0, 200) }, 502);
		}
		await Promise.resolve().then(() => cache.put(read.key, data)).catch(() => undefined);
		return json({ ...data, cached: false });
	};
}
