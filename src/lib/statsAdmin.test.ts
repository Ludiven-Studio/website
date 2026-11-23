import { describe, it, expect } from 'vitest';
import {
	CACHE_KEY, REVENUE_KEY, num, readBoard, readRevenueRow, revenueRange, revenueSummary, readCounts, readHosts, readRetention, readStats, statsHandler, tapRates,
	type Board, type BoardRow, type Overview, type Revenue,
} from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-20T12:00:00Z');
const BASE = 'https://stats.example';
const ENV = { UMAMI_URL: BASE, UMAMI_USER: 'dashboard', UMAMI_PASSWORD: 'pw', PROMO_ADMIN_USER_ID: 'raph' };

/** A fake Umami: two websites, v2 or v3 answer shapes, and the calls it got. */
function fakeUmami(version: 2 | 3, opts: { fail?: RegExp; loginFails?: boolean; inTeam?: boolean; eventsOnly?: boolean } = {}) {
	const calls: string[] = [];
	const fetchFn = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
		const u = new URL(String(url));
		const path = u.pathname.replace(/^\/api/, '');
		const q = u.searchParams;
		calls.push(`${init.method ?? 'GET'} ${path}${q.size ? '?' + q.toString() : ''}`);
		const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
		if (path === '/auth/login') {
			const b = JSON.parse(String(init.body));
			return opts.loginFails || b.password !== 'pw' ? new Response('{}', { status: 401 }) : ok({ token: 'tok', user: { id: 'u' } });
		}
		if ((init.headers as Record<string, string>)?.Authorization !== 'Bearer tok') return new Response('{}', { status: 401 });
		if (opts.fail?.test(`${path}?${q}`)) return new Response('{}', { status: 500 });
		const SITES = [{ id: 'w-meet', name: 'Pétanque Meet', domain: 'com.ludivenstudio.petanquemeet' }, { id: 'w-pg', name: 'Pétanque Game', domain: 'com.ludivenstudio.petanquegame' }];
		// inTeam: the sites belong to a team the user views; /websites lists only its own (one, also in the team).
		if (path === '/websites') return ok(opts.inTeam ? { data: [SITES[1]], count: 1 } : { data: SITES, count: 2 });
		if (path === (version === 3 ? '/me/teams' : '/teams')) return ok({ data: opts.inTeam ? [{ id: 't-ludiven', name: 'Ludiven' }] : [], count: opts.inTeam ? 1 : 0 });
		if (path === '/teams/t-ludiven/websites') return opts.inTeam ? ok({ data: SITES, count: 2 }) : new Response('{}', { status: 404 });
		const site = path.split('/')[2];
		const big = site === 'w-pg';
		if (path.endsWith('/sessions/stats')) {
			if (!opts.eventsOnly) return new Response('{}', { status: 404 });
			const days = Math.round((Number(q.get('endAt')) - Number(q.get('startAt'))) / 86_400_000);
			return ok({ visitors: { value: days * 50 }, visits: { value: days * 60 }, pageviews: { value: 0 } });
		}
		if (path.endsWith('/stats')) {
			const days = Math.round((Number(q.get('endAt')) - Number(q.get('startAt'))) / 86_400_000);
			const v = (n: number) => (version === 2 ? { value: n, prev: 0 } : n);
			return ok({ visitors: v(days * (big ? 10 : 2)), visits: v(days * (big ? 15 : 3)), pageviews: v(days * 40), bounces: v(0), totaltime: v(0) });
		}
		if (path.endsWith('/metrics')) {
			const type = q.get('type');
			if (type === 'event') return ok([{ x: 'house_ad_show', y: 40 }, { x: 'iap_result', y: 3 }]);
			if (version === 2 && type === 'hostname') return new Response('{}', { status: 400 });
			if (type === (version === 2 ? 'host' : 'hostname')) return ok([{ x: 'com.ludivenstudio.petanquegame.dev', y: 2 }, { x: 'com.ludivenstudio.petanquegame', y: 70 }]);
			return ok([]);
		}
		if (path.endsWith('/event-data/values')) {
			const event = version === 2 ? q.get('eventName') : q.get('event');
			const prop = q.get('propertyName');
			const rows: Record<string, [string, number][]> = {
				'house_ad_show.ad': [['dragon-gems', 30], ['nino-rush', 10]],
				'house_ad_tap.ad': [['dragon-gems', 3], ['ghost', 1]],
				'iap_result.item': [['no_ads', 2], ['coins_500', 1]],
				'iap_result.result': [['ok', 2], ['cancel', 1]],
				'sign_in.provider': [['google', 4], ['apple', 1]],
				'sign_in.result': [['ok', 4], ['fail', 1]],
			};
			return ok((rows[`${event}.${prop}`] ?? []).map(([value, total]) => ({ value, total })));
		}
		if (path === '/reports/retention') {
			const b = JSON.parse(String(init.body));
			// Each version refuses the other's shape, with the field it wanted.
			if (!b.websiteId || (version === 2 ? !b.dateRange?.startDate : !b.parameters?.startDate)) return new Response('{"error":"Bad request: startDate required"}', { status: 400 });
			return ok([
				{ date: '2026-11-01', day: 0, visitors: 10, returnVisitors: 10 },
				{ date: '2026-11-01', day: 1, visitors: 10, returnVisitors: 4 },
				{ date: '2026-11-01', day: 7, visitors: 10, returnVisitors: 1 },
				{ date: '2026-11-02', day: 1, visitors: 30, returnVisitors: 6 },
			]);
		}
		return new Response('{}', { status: 404 });
	};
	return { fetchFn: fetchFn as typeof fetch, calls };
}

/** A fake admin_stats_cache: one row per key, with its time. */
function fakeCache(broken = false) {
	const rows = new Map<string, { body: unknown; fetchedAt: string }>();
	return {
		rows,
		get: async (key: string) => {
			if (broken) throw new Error('db down');
			return rows.get(key) ?? null;
		},
		put: async (key: string, body: unknown) => {
			if (broken) throw new Error('db down');
			rows.set(key, { body, fetchedAt: NOW.toISOString() });
		},
	};
}

const isAdmin = async (req: Request) => req.headers.get('Authorization') === 'Bearer raph-jwt';
const post = (body: unknown, token = 'raph-jwt') =>
	new Request('https://fn.example/stats-admin', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('reading Umami', () => {
	it('reads counts as numbers or { value }, and nothing else', () => {
		expect([num(3), num({ value: 4 }), num(-1), num(NaN), num(Infinity), num('5'), num(null), num({ value: '2' })]).toEqual([3, 4, 0, 0, 0, 0, 0, 0]);
		expect(readStats({ visitors: { value: 5, prev: 1 }, visits: 7, pageviews: null })).toEqual({ visitors: 5, visits: 7, pageviews: 0 });
		expect(readStats('nope')).toEqual({ visitors: 0, visits: 0, pageviews: 0 });
	});

	it('reads [{ x, y }] and [{ value, total }], sums repeats, keeps keys as data', () => {
		expect(readCounts([{ x: 'a', y: 2 }, { value: 'b', total: 5 }, { x: 'a', y: 1 }])).toEqual([{ key: 'b', count: 5 }, { key: 'a', count: 3 }]);
		const hostile = readCounts(JSON.parse('[{"x":"__proto__","y":3},{"x":"","y":9},{"x":null,"y":1},{"x":{"a":1},"y":1},null,{"x":"constructor","y":-4}]'));
		expect(hostile).toEqual([{ key: '__proto__', count: 3 }, { key: 'constructor', count: 0 }]);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(readCounts({ data: [{ x: 'z', y: 1 }] })).toEqual([{ key: 'z', count: 1 }]);
		expect(readCounts('x'.repeat(10))).toEqual([]);
		expect(readCounts([{ x: 'k'.repeat(500), y: 1 }])[0].key).toHaveLength(80);
	});

	it('computes J1 and J7 over the cohorts old enough, never above 100 %', () => {
		const r = readRetention([
			{ day: 1, visitors: 10, returnVisitors: 4 },
			{ day: 1, visitors: 30, returnVisitors: 6 },
			{ day: 7, visitors: 10, returnVisitors: 1 },
			{ day: 7, visitors: 5, returnVisitors: 50 },
			{ day: 0, visitors: 40, returnVisitors: 40 },
		]);
		expect(r?.d1).toEqual({ rate: 0.25, visitors: 40, cohorts: 2 });
		expect(r?.d7).toEqual({ rate: 6 / 15, visitors: 15, cohorts: 2 });
		expect(readRetention([{ day: 0, visitors: 3, returnVisitors: 3 }])).toBeNull();
		expect(readRetention({ error: 'x' })).toBeNull();
		expect(readRetention([{ day: 1, visitors: 0, returnVisitors: 0 }])).toBeNull();
	});

	it('gives each ad its tap rate, and none without a show', () => {
		expect(tapRates([{ key: 'a', count: 20 }], [{ key: 'a', count: 2 }, { key: 'b', count: 1 }])).toEqual([
			{ ad: 'a', show: 20, tap: 2, rate: 0.1 },
			{ ad: 'b', show: 0, tap: 1, rate: null },
		]);
	});

	it('puts the store build first, test builds after', () => {
		expect(readHosts([{ key: 'x.y.dev', count: 9 }, { key: 'x.y', count: 2 }, { key: 'x.y.beta', count: 1 }]).map((h) => h.host)).toEqual(['x.y', 'x.y.dev', 'x.y.beta']);
	});
});

describe('the stats-admin function', () => {
	it.each([2, 3] as const)('reads every app of Umami v%i', async (version) => {
		const { fetchFn } = fakeUmami(version);
		const cache = fakeCache();
		const res = await statsHandler({ env: ENV, isAdmin, cache, fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }));
		expect(res.status).toBe(200);
		const body = await res.json() as Overview;
		expect(body.cached).toBe(false);
		expect(body.apps.map((a) => a.name)).toEqual(['Pétanque Game', 'Pétanque Meet']);
		const pg = body.apps[0];
		expect(pg.errors).toEqual([]);
		expect(pg.periods).toEqual({ d1: { visitors: 10, visits: 15, pageviews: 40 }, d7: { visitors: 70, visits: 105, pageviews: 280 }, d28: { visitors: 280, visits: 420, pageviews: 1120 } });
		expect(pg.hosts?.[0]).toEqual({ host: 'com.ludivenstudio.petanquegame', visitors: 70, test: false });
		expect(pg.ads).toEqual([
			{ ad: 'dragon-gems', show: 30, tap: 3, rate: 0.1 },
			{ ad: 'nino-rush', show: 10, tap: 0, rate: 0 },
			{ ad: 'ghost', show: 0, tap: 1, rate: null },
		]);
		expect(pg.purchases.results).toEqual([{ key: 'ok', count: 2 }, { key: 'cancel', count: 1 }]);
		expect(pg.signIn.providers?.[0]).toEqual({ key: 'google', count: 4 });
		expect(pg.retention?.d1?.rate).toBe(0.25);
		expect(pg.retention?.d7?.rate).toBe(0.1);
		expect(cache.rows.has(CACHE_KEY)).toBe(true);
	});

	it('answers from the cache for 10 minutes, then asks Umami again; refresh skips it', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const cache = fakeCache();
		let now = NOW;
		const handle = statsHandler({ env: ENV, isAdmin, cache, fetch: fetchFn, now: () => now });
		await handle(post({ action: 'overview' }));
		const first = calls.length;
		now = new Date(NOW.getTime() + 9 * 60_000);
		expect((await (await handle(post({ action: 'overview' }))).json()).cached).toBe(true);
		expect(calls.length).toBe(first);
		expect((await (await handle(post({ action: 'overview', refresh: true }))).json()).cached).toBe(false);
		expect(calls.length).toBe(first * 2);
		now = new Date(NOW.getTime() + 11 * 60_000);
		expect((await (await handle(post({ action: 'overview' }))).json()).cached).toBe(false);
	});

	it.each([2, 3] as const)('reads the websites of the teams the user is in, once each (Umami v%i)', async (version) => {
		const { fetchFn, calls } = fakeUmami(version, { inTeam: true });
		const res = await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }));
		const body = await res.json() as Overview;
		expect(body.apps.map((a) => a.name)).toEqual(['Pétanque Game', 'Pétanque Meet']);
		expect(calls.filter((c) => c.startsWith('GET /teams/t-ludiven/websites'))).toHaveLength(1);
	});

	it('counts the visitors of an app that sends events only from the session stats', async () => {
		const { fetchFn } = fakeUmami(3, { eventsOnly: true });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		expect(body.apps[0].periods.d7).toEqual({ visitors: 350, visits: 420, pageviews: 280 });
	});

	it('names what Umami refused, with its reason', async () => {
		const { fetchFn } = fakeUmami(3, { fail: /reports\/retention/ });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		expect(body.apps[0].errors.find((e) => e.startsWith('retention:'))).toBe('retention: Umami POST /reports/retention: 500 | Umami POST /reports/retention: 500');
	});

	it('still answers when the cache table fails', async () => {
		const { fetchFn } = fakeUmami(3);
		const res = await statsHandler({ env: ENV, isAdmin, cache: fakeCache(true), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }));
		expect(res.status).toBe(200);
	});

	it('names a failed call and keeps the rest', async () => {
		const { fetchFn } = fakeUmami(3, { fail: /w-pg\/event-data\/values.*house_ad_tap/ });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const pg = body.apps.find((a) => a.id === 'w-pg')!;
		expect(pg.ads).toBeNull();
		expect(pg.errors).toEqual(['house_ad_tap.ad: Umami GET /websites/w-pg/event-data/values: 500']);
		expect(pg.periods.d28?.visitors).toBe(280);
	});

	it('sends no secret to the page and says 502 when Umami refuses the login', async () => {
		const { fetchFn } = fakeUmami(3, { loginFails: true });
		const res = await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }));
		expect(res.status).toBe(502);
		expect(await res.text()).not.toContain('pw');
	});

	it('lets Raphaël only, and checks its setup first', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const handle = statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW });
		expect((await handle(post({ action: 'overview' }, 'someone-else'))).status).toBe(403);
		expect((await handle(new Request('https://fn.example/', { method: 'GET' }))).status).toBe(405);
		expect((await handle(new Request('https://fn.example/', { method: 'OPTIONS' }))).status).toBe(204);
		expect((await handle(post({ action: 'drop' }))).status).toBe(400);
		expect((await handle(new Request('https://fn.example/', { method: 'POST', headers: { Authorization: 'Bearer raph-jwt' }, body: '{not json' }))).status).toBe(400);
		const throwing = statsHandler({ env: ENV, isAdmin: async () => { throw new Error('auth down'); }, cache: fakeCache(), fetch: fetchFn });
		expect((await throwing(post({ action: 'overview' }))).status).toBe(403);
		const bare = statsHandler({ env: { ...ENV, UMAMI_PASSWORD: '' }, isAdmin, cache: fakeCache(), fetch: fetchFn });
		expect((await bare(post({ action: 'overview' }))).status).toBe(503);
		expect(calls).toEqual([]);
	});
});

describe('the board action', () => {
	const ROWS = [
		{ app: 'scan', data: { name: 'Pétanque Scan', order: 2, play_prod: '1.2.15 (102015)', ios: '1.2.15', waits: ['Build iOS 1.2.16'] }, updated_at: '2026-11-22T10:00:00Z' },
		{ app: 'meet', data: { name: 'Pétanque Meet', order: 1, main: 'abc1234', waits: 'Déployer la 1.1.2 | Build iOS' }, updated_at: '2026-11-22T09:00:00Z' },
		{ app: 'odd', data: { order: 'x', name: 7, play_prod: { html: '<b>' }, waits: [3, '', ' ok '], token: 'secret' }, updated_at: 5 },
		{ app: 'bad', data: ['not', 'an', 'object'], updated_at: '' },
		null,
	] as unknown as BoardRow[];

	it('lists the apps in the board order, text fields only', () => {
		const b = readBoard(ROWS, NOW);
		expect(b.generatedAt).toBe(NOW.toISOString());
		expect(b.apps.map((a) => a.app)).toEqual(['meet', 'scan', 'odd']);
		expect(b.apps[0]).toEqual({ app: 'meet', name: 'Pétanque Meet', order: 1, play_prod: '', play_test: '', ios: '', beta: '', main: 'abc1234', waits: ['Déployer la 1.1.2', 'Build iOS'], updatedAt: '2026-11-22T09:00:00Z' });
		const odd = b.apps[2];
		expect([odd.name, odd.order, odd.play_prod, odd.waits, odd.updatedAt]).toEqual(['odd', 999, '', ['ok'], null]);
		expect(Object.keys(odd)).not.toContain('token');
		expect(readBoard('nope', NOW).apps).toEqual([]);
	});

	it('serves the board to Raphaël only, without Umami', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const board = { list: async () => ROWS };
		const handle = statsHandler({ env: { PROMO_ADMIN_USER_ID: 'raph' }, isAdmin, cache: fakeCache(), board, fetch: fetchFn, now: () => NOW });
		const res = await handle(post({ action: 'board' }));
		expect(res.status).toBe(200);
		expect(((await res.json()) as Board).apps).toHaveLength(3);
		expect((await handle(post({ action: 'board' }, 'someone-else'))).status).toBe(403);
		// Overview still needs Umami's secrets.
		expect((await handle(post({ action: 'overview' }))).status).toBe(503);
		expect(calls).toEqual([]);
	});

	it('says when the board is missing or unreadable', async () => {
		const noBoard = statsHandler({ env: ENV, isAdmin, cache: fakeCache() });
		expect((await noBoard(post({ action: 'board' }))).status).toBe(503);
		const broken = statsHandler({ env: ENV, isAdmin, cache: fakeCache(), board: { list: async () => { throw new Error('relation "studio_board" does not exist'); } } });
		const res = await broken(post({ action: 'board' }));
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'board not readable' });
		const noAdmin = statsHandler({ env: { ...ENV, PROMO_ADMIN_USER_ID: '' }, isAdmin, cache: fakeCache(), board: { list: async () => ROWS } });
		expect((await noAdmin(post({ action: 'board' }))).status).toBe(503);
	});
});

/** A fake LevelPlay: the auth endpoint and the report, paged by resultsPerPage. */
function fakeLevelPlay(rows: Record<string, unknown>[], opts: { authFails?: boolean; quoted?: boolean; pageSize?: number } = {}) {
	const calls: string[] = [];
	const fetchFn = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
		const u = new URL(String(url));
		calls.push(`${u.pathname}${u.search}`);
		const h = (init.headers ?? {}) as Record<string, string>;
		if (u.pathname === '/partners/publisher/auth') {
			if (opts.authFails || h.secretkey !== 'sk' || h.refreshToken !== 'rt') return new Response('unauthorized', { status: 401 });
			return new Response(opts.quoted === false ? 'jwt-1' : '"jwt-1"', { status: 200 });
		}
		if (h.Authorization !== 'Bearer jwt-1') return new Response('{}', { status: 401 });
		const size = opts.pageSize ?? 5000;
		const page = Number(u.searchParams.get('page'));
		return new Response(JSON.stringify({ data: rows.slice((page - 1) * size, page * size), page, pageSize: size, totalResults: rows.length }), { status: 200 });
	};
	return { fetchFn: fetchFn as typeof fetch, calls };
}

const LP_ENV = { PROMO_ADMIN_USER_ID: 'raph', LEVELPLAY_SECRET_KEY: 'sk', LEVELPLAY_REFRESH_TOKEN: 'rt' };
const REV_ROWS = [
	{ date: '2026-11-20', appKey: 'k-pg-a', appName: 'Pétanque Game', platform: 'Android', revenue: 1.5, impressions: 100 },
	{ date: '2026-11-20', appKey: 'k-pg-i', appName: 'Pétanque Game', platform: 'iOS', revenue: '0.25', impressions: 10 },
	{ date: '2026-11-02', appKey: 'k-pg-a', appName: 'Pétanque Game', platform: 'Android', revenue: 2, impressions: 150 },
	// 31 October: in the last 30 days, not in November.
	{ date: '2026-10-31', appKey: 'k-dg', appName: 'Dragon Gems Swipe', platform: 'Android', revenue: 4, impressions: 300 },
	// 20 October: before both.
	{ date: '2026-10-20', appKey: 'k-dg', appName: 'Dragon Gems Swipe', platform: 'Android', revenue: 9, impressions: 900 },
	{ revenue: 5 },
];

describe('the revenue action', () => {
	it('asks LevelPlay from the earlier of the month start and 29 days ago, to today (UTC)', () => {
		expect(revenueRange(NOW)).toEqual({ today: '2026-11-20', monthStart: '2026-11-01', from30: '2026-10-22', startDate: '2026-10-22' });
		expect(revenueRange(new Date('2026-12-31T23:00:00Z')).startDate).toBe('2026-12-01');
	});

	it('reads a row whatever the app field is called, and drops rows without a date', () => {
		expect(readRevenueRow({ date: '2026-11-20', app: 'Nino Rush', os: 'ios', revenue: 'x' })).toEqual({ date: '2026-11-20', key: '', name: 'Nino Rush', platform: 'ios', revenue: 0, impressions: 0 });
		expect(readRevenueRow({ revenue: 3 })).toBeNull();
		expect(readRevenueRow('nope')).toBeNull();
	});

	it('sums each app over its platforms, this month and the last 30 days, day by day', () => {
		const r = revenueSummary(REV_ROWS, NOW);
		expect([r.from, r.to, r.monthStart, r.currency]).toEqual(['2026-10-22', '2026-11-20', '2026-11-01', 'USD']);
		expect(r.total).toMatchObject({ month: 3.75, last30: 7.75 });
		expect(r.total.days).toHaveLength(30);
		const [dg, pg] = r.apps;
		expect([dg.name, dg.month, dg.last30, dg.impressions30]).toEqual(['Dragon Gems Swipe', 0, 4, 300]);
		expect([pg.name, pg.month, pg.last30, pg.keys]).toEqual(['Pétanque Game', 3.75, 3.75, ['k-pg-a', 'k-pg-i']]);
		expect(pg.platforms).toEqual([{ platform: 'android', month: 3.5 }, { platform: 'ios', month: 0.25 }]);
		expect(pg.days.find((d) => d.date === '2026-11-20')?.revenue).toBe(1.75);
		expect(dg.days[0]).toEqual({ date: '2026-10-22', revenue: 0 });
	});

	it('gets a token, reads every page, then serves the cache for an hour', async () => {
		const { fetchFn, calls } = fakeLevelPlay(REV_ROWS, { pageSize: 2 });
		const cache = fakeCache();
		const handle = statsHandler({ env: LP_ENV, isAdmin, cache, fetch: fetchFn, now: () => NOW });
		const res = await handle(post({ action: 'revenue' }));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Revenue;
		expect([body.cached, body.total.last30]).toEqual([false, 7.75]);
		expect(calls[0]).toBe('/partners/publisher/auth');
		expect(calls.slice(1).map((c) => new URL(`https://x${c}`).searchParams.get('page'))).toEqual(['1', '2', '3']);
		const q = new URL(`https://x${calls[1]}`).searchParams;
		expect([q.get('startDate'), q.get('endDate'), q.get('breakdowns'), q.get('metrics')]).toEqual(['2026-10-22', '2026-11-20', 'date,app,platform', 'revenue,impressions']);
		expect(cache.rows.has(REVENUE_KEY)).toBe(true);
		const again = (await (await handle(post({ action: 'revenue' }))).json()) as Revenue;
		expect(again.cached).toBe(true);
		expect(calls).toHaveLength(4);
		await handle(post({ action: 'revenue', refresh: true }));
		expect(calls).toHaveLength(8);
	});

	it('takes an unquoted token too', async () => {
		const { fetchFn } = fakeLevelPlay(REV_ROWS, { quoted: false });
		const res = await statsHandler({ env: LP_ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'revenue' }));
		expect(res.status).toBe(200);
	});

	it('says when the keys are missing or refused, and keeps others out', async () => {
		const { fetchFn, calls } = fakeLevelPlay(REV_ROWS, { authFails: true });
		const noKeys = statsHandler({ env: { PROMO_ADMIN_USER_ID: 'raph' }, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW });
		const missing = await noKeys(post({ action: 'revenue' }));
		expect([missing.status, await missing.json()]).toEqual([503, { error: 'revenue not configured' }]);
		expect(calls).toEqual([]);
		const handle = statsHandler({ env: LP_ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW });
		expect((await handle(post({ action: 'revenue' }, 'someone-else'))).status).toBe(403);
		const refused = await handle(post({ action: 'revenue' }));
		expect(refused.status).toBe(502);
		expect(await refused.json()).toEqual({ error: 'LevelPlay did not answer', detail: 'LevelPlay auth: 401' });
	});
});
