// stats-admin's logic: the studio's figures per app, read from the self-hosted Umami (one website per app),
// for /admin/stats/ and the tiles of /admin/, and the studio board of /admin/versions/. Plain JavaScript with its fetch, cache and admin check passed in,
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

/** The whole overview: every website the Umami user sees, then each one's figures. */
export async function overview(env, fetchFn, now) {
	const u = umami(env.UMAMI_URL, fetchFn);
	await u.login(env.UMAMI_USER, env.UMAMI_PASSWORD);
	const rows = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
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

/**
 * The function's request handler. deps:
 * - env: UMAMI_URL, UMAMI_USER, UMAMI_PASSWORD, PROMO_ADMIN_USER_ID;
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
		if (body?.action !== 'overview') return json({ error: 'unknown action' }, 400);
		if (!env.UMAMI_URL || !env.UMAMI_USER || !env.UMAMI_PASSWORD) return json({ error: 'not configured' }, 503);
		const at = now();
		try {
			const hit = body.refresh === true ? null : await Promise.resolve().then(() => cache.get(CACHE_KEY)).catch(() => null);
			if (hit && at.getTime() - new Date(hit.fetchedAt).getTime() < CACHE_MINUTES * 60_000) return json({ ...hit.body, cached: true });
		} catch { /* a cache that fails is a miss */ }
		let data;
		try {
			data = await overview(env, fetchFn, at);
		} catch (e) {
			return json({ error: 'Umami did not answer', detail: String(e?.message ?? e).slice(0, 200) }, 502);
		}
		await Promise.resolve().then(() => cache.put(CACHE_KEY, data)).catch(() => undefined);
		return json({ ...data, cached: false });
	};
}
