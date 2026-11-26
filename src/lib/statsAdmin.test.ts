import { describe, it, expect } from 'vitest';
import {
	CACHE_KEY, NO_CANCEL, OUTCOME_PAGE, OUTCOME_PAGES, PURCHASES_KEY, REVENUE_KEY, baseVersion, buildOf, num, versionAtMost, osPlatform, outcomeOf, readOutcomes, purchaseKind, readPurchase, readBoard, readRevenueRow, revenueRange, revenueSummary, readCounts, readHosts, readRetention, readStats, statsHandler, tapRates,
	type Board, type BoardRow, type Overview, type Purchases, type Revenue,
} from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-20T12:00:00Z');
const BASE = 'https://stats.example';
const ENV = { UMAMI_URL: BASE, UMAMI_USER: 'dashboard', UMAMI_PASSWORD: 'pw', PROMO_ADMIN_USER_ID: 'raph' };

/** A fake Umami: two websites, v2 or v3 answer shapes, and the calls it got. */
function fakeUmami(version: 2 | 3, opts: { fail?: RegExp; loginFails?: boolean; inTeam?: boolean; eventsOnly?: boolean; iapEvents?: Record<string, unknown[]>; osIgnored?: boolean } = {}) {
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
			if (type === 'os') return ok([{ x: 'Android OS', y: 40 }, { x: 'iOS', y: 20 }, { x: 'Windows 10', y: 1 }]);
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
			// Pétanque Game answers its consent window and says its state at each launch; Meet sends neither.
			const consent: Record<string, Record<string, [string, number][]>> = {
				'': { 'ad_consent.result': [['yes', 30], ['no', 10]], 'app_open.ads': [['yes', 100], ['no', 20], ['unasked', 30]] },
				'Android OS': { 'ad_consent.result': [['yes', 20], ['no', 8]], 'app_open.ads': [['yes', 70], ['no', 15], ['unasked', 20]] },
				iOS: { 'ad_consent.result': [['yes', 10], ['no', 2]], 'app_open.ads': [['yes', 30], ['no', 5], ['unasked', 10]] },
			};
			const os = opts.osIgnored ? '' : q.get('os') ?? '';
			if (big && consent[os]?.[`${event}.${prop}`]) return ok(consent[os][`${event}.${prop}`].map(([value, total]) => ({ value, total })));
			return ok((rows[`${event}.${prop}`] ?? []).map(([value, total]) => ({ value, total })));
		}
		if (path.endsWith('/event-data')) {
			// Umami 3 only: each event with its properties, newest first, one page of events at a time.
			if (version === 2) return new Response('{}', { status: 404 });
			const all = ((q.get('event') === 'sign_in' ? SIGN_EVENTS : opts.iapEvents ?? IAP_EVENTS)[site] ?? []) as { session?: string; host?: string; os?: string }[];
			const size = Number(q.get('pageSize') ?? 20), page = Number(q.get('page') ?? 1);
			// This list carries no session: drop the fake's own field.
			return ok({ data: all.slice((page - 1) * size, page * size).map(({ session: _session, host: _host, os: _os, ...e }) => e), count: all.length, page, pageSize: size });
		}
		if (path.endsWith('/events')) {
			if (version === 2) return new Response('{}', { status: 404 });
			const all = ((q.get('event') === 'sign_in' ? SIGN_EVENTS : opts.iapEvents ?? IAP_EVENTS)[site] ?? []) as { eventId: string; eventName: string; session?: string; host?: string; os?: string }[];
			const size = Number(q.get('pageSize') ?? 20), page = Number(q.get('page') ?? 1);
			const data = all.slice((page - 1) * size, page * size)
				.map((e) => ({ id: e.eventId, websiteId: site, sessionId: e.session, visitId: `v-${e.session}`, hostname: e.host ?? 'com.ludivenstudio.app', eventName: e.eventName, country: 'FR', device: 'mobile', os: e.os }));
			return ok({ data, count: all.length, page, pageSize: size });
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

/** An iap_result event as Umami 3's event-data list gives it. */
const iap = (at: string, props: Record<string, string>, eventName = 'iap_result', session = 's-x', host?: string) => ({
	websiteId: 'w', eventId: `e-${at}`, eventName, session, host,
	eventProperties: Object.entries(props).map(([dataKey, stringValue]) => ({ dataKey, stringValue, numberValue: null, dateValue: null, dataType: 1, createdAt: at })),
});
/** A sign_in event, with the OS and hostname the event list gives. */
const sign = (at: string, props: Record<string, string>, os: string, host = 'com.ludivenstudio.petanquegame') => ({ ...iap(at, props, 'sign_in', 's-x', host), os });
const SIGN_EVENTS: Record<string, unknown[]> = {
	'w-pg': [
		sign('2026-11-19T10:00:00Z', { provider: 'google', result: 'ok', app_version: '1.0.16' }, 'Android OS'),
		sign('2026-11-19T09:00:00Z', { provider: 'google', result: 'fail', reason: 'native:12500', app_version: '1.0.16', again: 'yes' }, 'Android OS'),
		sign('2026-11-19T08:00:00Z', { provider: 'google', result: 'fail', reason: 'native:12500', app_version: '1.0.16' }, 'Android OS'),
		sign('2026-11-18T08:00:00Z', { provider: 'google', result: 'fail', reason: 'native:12500' }, 'Android OS', 'com.ludivenstudio.petanquegame.dev'),
		sign('2026-11-17T08:00:00Z', { provider: 'apple', result: 'cancel', app_version: '1.0.16' }, 'iOS'),
		sign('2026-11-16T08:00:00Z', { provider: 'apple', result: 'fail', reason: 'no_session', app_version: '1.0.15-beta3' }, 'iOS', 'com.ludivenstudio.petanquegame.beta'),
		sign('2026-11-15T08:00:00Z', { provider: 'google', result: 'later', app_version: '1.0.16' }, 'Android OS'),
		// Store builds without a cancel value: a closed sheet was sent as a failure.
		sign('2026-11-14T08:00:00Z', { provider: 'google', result: 'fail', app_version: '1.0.14' }, 'Android OS'),
		sign('2026-11-13T08:00:00Z', { provider: 'google', result: 'fail', app_version: '1.0.14' }, 'Android OS'),
		sign('2026-11-12T08:00:00Z', { provider: 'apple', result: 'failed', app_version: '1.0.8' }, 'iOS'),
	],
};
const IAP_EVENTS: Record<string, unknown[]> = {
	'w-pg': [
		iap('2026-11-19T10:00:00Z', { item: 'coins_s', result: 'ok', store: 'play', asked: 'yes', test: 'no' }, 'iap_result', 's-a'),
		iap('2026-11-18T09:00:00Z', { item: 'no_ads', result: 'cancel', store: 'play', asked: 'yes' }),
		iap('2026-11-17T09:00:00Z', { item: 'coins_l', result: 'ok', store: 'play', asked: 'yes', test: 'yes' }),
		iap('2026-11-16T09:00:00Z', { item: 'no_ads', result: 'ok', store: 'appstore', asked: 'no' }, 'iap_result', 's-a'),
		iap('2026-11-15T09:00:00Z', { item: 'coins_m', result: 'ok', store: 'play' }, 'iap_tap'),
		// A beta build known by its hostname only.
		iap('2026-11-14T09:00:00Z', { item: 'coins_m', result: 'ok', store: 'play', test: 'no' }, 'iap_result', 's-d', 'com.ludivenstudio.petanquegame.beta'),
	],
	'w-meet': [
		// A cancel with its reason (template, next versions), and a store's « UserCancelled » sent as a failure.
		iap('2026-11-21T08:00:00Z', { item: 'hearts', result: 'cancel', reason: 'store_sheet', app_version: '1.1.6' }),
		iap('2026-11-21T07:00:00Z', { item: 'hearts', result: 'cancel', reason: 'our_wait', app_version: '1.1.6' }),
		iap('2026-11-21T06:00:00Z', { item: 'full', result: 'failed', reason: 'UserCancelled', app_version: '1.1.4' }),
		iap('2026-11-21T05:00:00Z', { item: 'full', result: 'fail', reason: 'product_unavailable', app_version: '1.1.4' }),
		iap('2026-11-20T08:00:00Z', { item: 'hearts', result: 'ok', store: 'dev', asked: 'yes' }),
		iap('2026-11-18T12:00:00Z', { item: 'full', result: 'ok', store: 'play', asked: 'yes' }, 'iap_result', 's-a'),
		iap('2026-11-19T12:00:00Z', { item: 'wardrobe', result: 'ok', store: 'play', test: 'no', app_version: '1.0.15-Beta3' }, 'iap_result', 's-b'),
	],
};

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
		// Umami 2 has no event list: the outcomes are named as unread, the rest stays.
		expect(pg.errors).toEqual(version === 2 ? [
			'iap_result outcomes: Umami GET /websites/w-pg/event-data: 404',
			'sign_in outcomes: Umami GET /websites/w-pg/event-data: 404',
		] : []);
		expect(pg.periods).toEqual({
			d1: { visitors: 10, visits: 15, pageviews: 40 }, d7: { visitors: 70, visits: 105, pageviews: 280 }, d28: { visitors: 280, visits: 420, pageviews: 1120 },
			prev7: { visitors: 70, visits: 105, pageviews: 280 },
		});
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

	it('reads the 7 days before the last 7, for the week’s trend', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }));
		const DAY = 86_400_000, t = NOW.getTime();
		expect(calls).toContain(`GET /websites/w-pg/stats?startAt=${t - 14 * DAY}&endAt=${t - 7 * DAY}`);
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

	it('splits each product and provider by outcome, and breaks the failures down by reason, platform and build', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const pg = body.apps.find((a) => a.id === 'w-pg')!;
		// Up to 1.0.14, Pétanque Game's fail also covers a closed sheet; from 1.0.15 (beta included) it is a failure;
		// an event without a version stays a failure.
		expect(pg.signIn.outcomes?.split).toEqual([
			{ key: 'google', ok: 1, fail: 3, mixed: 2, cancel: 0, later: 1, other: 0, again: 1 },
			{ key: 'apple', ok: 0, fail: 1, mixed: 1, cancel: 1, later: 0, other: 0, again: 0 },
		]);
		expect(pg.signIn.outcomes?.failures).toEqual([
			{ key: 'google', outcome: 'fail', reason: 'native:12500', platform: 'android', build: 'store', version: '1.0.16', count: 2 },
			{ key: 'google', outcome: 'mixed', reason: '', platform: 'android', build: 'store', version: '1.0.14', count: 2 },
			{ key: 'apple', outcome: 'fail', reason: 'no_session', platform: 'ios', build: 'beta', version: '1.0.15', count: 1 },
			{ key: 'apple', outcome: 'mixed', reason: '', platform: 'ios', build: 'store', version: '1.0.8', count: 1 },
			{ key: 'google', outcome: 'fail', reason: 'native:12500', platform: 'android', build: 'dev', version: '?', count: 1 },
		]);
		expect(pg.signIn.outcomes).toMatchObject({ read: 10, total: 10, partial: false });
		// iap_tap is not a purchase outcome.
		expect(pg.purchases.outcomes?.split.find((s) => s.key === 'no_ads')).toEqual({ key: 'no_ads', ok: 1, fail: 0, mixed: 0, cancel: 1, later: 0, other: 0, again: 0 });
		expect(pg.purchases.outcomes?.read).toBe(5);
		// No hostname leaves the function, only the build's kind.
		expect(JSON.stringify(pg.signIn.outcomes)).not.toMatch(/ludivenstudio|s-x|e-2026/);
		// Meet's list is empty: nothing to split, and no failure to look up in the event list.
		expect(body.apps.find((a) => a.id === 'w-meet')!.signIn.outcomes).toEqual({ split: [], failures: [], cancels: [], read: 0, total: 0, partial: false });
		expect(calls.some((c) => c.includes('w-meet/events?') && c.includes('event=sign_in'))).toBe(false);
	});

	it('counts a store\'s « UserCancelled » as a cancel, and lists the cancels by reason', async () => {
		const { fetchFn } = fakeUmami(3);
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const o = body.apps.find((a) => a.id === 'w-meet')!.purchases.outcomes!;
		expect(o.split.find((s) => s.key === 'full')).toMatchObject({ ok: 1, fail: 1, cancel: 1 });
		expect(o.split.find((s) => s.key === 'hearts')).toMatchObject({ ok: 1, cancel: 2 });
		expect(o.failures).toEqual([{ key: 'full', outcome: 'fail', reason: 'product_unavailable', platform: '?', build: 'store', version: '1.1.4', count: 1 }]);
		expect(o.cancels?.map((c) => [c.key, c.reason, c.version])).toEqual([['full', 'usercancelled', '1.1.4'], ['hearts', 'store_sheet', '1.1.6'], ['hearts', 'our_wait', '1.1.6']]);
	});

	it('reads a version from its first three numbers, and compares them as numbers', () => {
		expect(['1.0.14', '1.0.15-beta3', '1.0.14 (114)', ' 2.10.0', 'v1.0', '', undefined].map(baseVersion)).toEqual(['1.0.14', '1.0.15', '1.0.14', '2.10.0', null, null, null]);
		expect(versionAtMost('1.0.8', '1.0.14')).toBe(true);
		expect(versionAtMost('1.0.14', '1.0.14')).toBe(true);
		expect(versionAtMost('1.0.15', '1.0.14')).toBe(false);
		expect(versionAtMost('1.1.0', '1.0.17')).toBe(false);
		expect(NO_CANCEL['com.ludivenstudio.petanquegame']).toEqual({ sign_in: '1.0.14', iap_result: '1.0.17' });
	});

	it('names the outcomes of the apps in plain kinds, and the build from its hostname', () => {
		expect(['ok', 'success', 'FAIL', 'failed', 'error', 'cancel', 'canceled', 'cancelled', 'later', 'pending', undefined].map(outcomeOf))
			.toEqual(['ok', 'ok', 'fail', 'fail', 'fail', 'cancel', 'cancel', 'cancel', 'later', 'other', 'other']);
		expect(buildOf('com.ludivenstudio.petanquegame')).toBe('store');
		expect(buildOf('com.ludivenstudio.petanquegame.dev')).toBe('dev');
		expect(buildOf('com.ludivenstudio.petanquegame.beta')).toBe('beta');
		expect(buildOf('com.ludivenstudio.petanquegame', '1.0.15-beta3')).toBe('beta');
		expect(buildOf(undefined)).toBe('?');
	});

	it('stops at its page limit and says the count is partial; a failure without its event row is of unknown platform', async () => {
		const total = OUTCOME_PAGE * OUTCOME_PAGES + 50;
		const at = (i: number) => new Date(NOW.getTime() - i * 60_000).toISOString();
		const all = Array.from({ length: total }, (_, i) => iap(at(i), { provider: 'google', result: i % 2 ? 'ok' : 'fail' }, 'sign_in'));
		const asked: string[] = [];
		const u = {
			get: async (path: string) => {
				asked.push(path);
				const q = new URLSearchParams(path.split('?')[1]);
				const size = Number(q.get('pageSize')), page = Number(q.get('page'));
				const slice = all.slice((page - 1) * size, page * size);
				return path.includes('/event-data?') ? { data: slice, count: total } : { data: [], count: total };
			},
		};
		const out = await readOutcomes(u, 'w', { startAt: 0, endAt: 1 }, 'sign_in', 'provider');
		expect(out).toMatchObject({ read: OUTCOME_PAGE * OUTCOME_PAGES, total, partial: true });
		expect(out.split).toEqual([{ key: 'google', ok: 1000, fail: 1000, mixed: 0, cancel: 0, later: 0, other: 0, again: 0 }]);
		expect(out.failures).toEqual([{ key: 'google', outcome: 'fail', reason: '', platform: '?', build: '?', version: '?', count: 1000 }]);
		expect(asked.filter((a) => a.includes('/event-data?'))).toHaveLength(OUTCOME_PAGES);
		// An empty event list ends the lookup at its first page.
		expect(asked.filter((a) => a.includes('/events?'))).toHaveLength(1);
	});

	it('reads the ad consent answers and launch states, per platform through the OS filter', async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const pg = body.apps.find((a) => a.id === 'w-pg')!;
		expect(pg.errors).toEqual([]);
		expect(pg.consent?.answers).toEqual([{ key: 'yes', count: 30 }, { key: 'no', count: 10 }]);
		expect(pg.consent?.opens?.find((c) => c.key === 'unasked')?.count).toBe(30);
		expect(pg.consent?.platforms).toEqual([
			{ platform: 'android', visitors: 40, answers: [{ key: 'yes', count: 20 }, { key: 'no', count: 8 }], opens: [{ key: 'yes', count: 70 }, { key: 'unasked', count: 20 }, { key: 'no', count: 15 }] },
			{ platform: 'ios', visitors: 20, answers: [{ key: 'yes', count: 10 }, { key: 'no', count: 2 }], opens: [{ key: 'yes', count: 30 }, { key: 'unasked', count: 10 }, { key: 'no', count: 5 }] },
		]);
		expect(calls.some((c) => c.includes('/w-pg/event-data/values') && c.includes('os=Android+OS') && c.includes('event=ad_consent'))).toBe(true);
		// An app without either event: nothing per platform, and no call per OS.
		const meet = body.apps.find((a) => a.id === 'w-meet')!;
		expect(meet.consent).toEqual({ answers: [], opens: [], platforms: null });
		expect(calls.some((c) => c.includes('/w-meet/event-data/values') && c.includes('os='))).toBe(false);
	});

	it('drops the platform split when Umami ignores the OS filter, and says so', async () => {
		const { fetchFn } = fakeUmami(3, { osIgnored: true });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const pg = body.apps.find((a) => a.id === 'w-pg')!;
		expect(pg.consent?.answers).toEqual([{ key: 'yes', count: 30 }, { key: 'no', count: 10 }]);
		expect(pg.consent?.platforms).toBeNull();
		expect(pg.errors).toEqual(['consent per platform: Umami did not filter by OS']);
	});

	it('keeps the totals when a per-platform read fails', async () => {
		const { fetchFn } = fakeUmami(3, { fail: /w-pg\/event-data\/values.*os=iOS/ });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'overview' }))).json() as Overview;
		const pg = body.apps.find((a) => a.id === 'w-pg')!;
		expect(pg.consent?.answers?.length).toBe(2);
		expect(pg.consent?.platforms).toBeNull();
		expect(pg.errors.every((e) => e.includes('(iOS)'))).toBe(true);
	});

	it('names the platform of the OS the apps send', () => {
		expect(['Android OS', 'Android', 'iOS', 'iPadOS', 'Windows 10', 'Mac OS', ''].map(osPlatform)).toEqual(['android', 'android', 'ios', 'ios', null, null, null]);
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
		expect(readRevenueRow({ date: '2026-11-20', app: 'Nino Rush', os: 'ios', revenue: 'x' })).toEqual({ date: '2026-11-20', key: '', name: 'Nino Rush', platform: 'ios', network: '', revenue: 0, impressions: 0 });
		expect(readRevenueRow({ date: '2026-11-20', appName: 'Nino Rush', networkName: 'unityAds', revenue: 1 })?.network).toBe('unityAds');
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
		// Rows without a network fall under « ? ».
		expect(r.total.networks).toEqual([{ network: '?', name: '?', month: 3.75, last30: 7.75 }]);
	});

	it('splits each app and the total by ad network, Unity Ads apart, this month and the last 30 days', () => {
		const rows = [
			{ date: '2026-11-20', appName: 'Pétanque Game', platform: 'Android', networkName: 'unityAds', revenue: 0.4 },
			{ date: '2026-11-19', appName: 'Pétanque Game', platform: 'Android', networkName: 'ironSource', revenue: 0.6 },
			{ date: '2026-11-18', appName: 'Pétanque Game', platform: 'iOS', networkName: 'ironSourceExchange', revenue: 0.1 },
			// 31 October: in the 30 days only.
			{ date: '2026-10-31', appName: "Dragon's Gems", platform: 'Android', networkName: 'unityAds', revenue: 0.3 },
			{ date: '2026-11-05', appName: "Dragon's Gems", platform: 'Android', networkName: 'meta', revenue: 0.2 },
		];
		const r = revenueSummary(rows, NOW);
		expect(r.total.networks).toEqual([
			{ network: 'unityAds', name: 'Unity Ads', month: 0.4, last30: 0.7 },
			{ network: 'ironSource', name: 'ironSource Ads', month: 0.6, last30: 0.6 },
			{ network: 'meta', name: 'meta', month: 0.2, last30: 0.2 },
			{ network: 'ironSourceExchange', name: 'ironSource Ads', month: 0.1, last30: 0.1 },
		]);
		const dg = r.apps.find((a) => a.name === "Dragon's Gems")!;
		expect(dg.networks?.find((n) => n.network === 'unityAds')).toEqual({ network: 'unityAds', name: 'Unity Ads', month: 0, last30: 0.3 });
		expect([dg.month, dg.last30]).toEqual([0.2, 0.5]);
	});

	it('keeps one app whatever the accents, apostrophes or case of its name on each platform', () => {
		const rows = [
			{ date: '2026-11-20', appName: 'Pétanque Game (Android)', platform: 'Android', revenue: 1 },
			{ date: '2026-11-20', appName: 'Petanque game', platform: 'iOS', revenue: 2 },
			{ date: '2026-11-20', appName: "Dragon's Gems", platform: 'Android', revenue: 1 },
			{ date: '2026-11-20', appName: 'Dragons Gems', platform: 'iOS', revenue: 1 },
		];
		const r = revenueSummary(rows, NOW);
		expect(r.apps.map((a) => [a.name, a.month])).toEqual([['Pétanque Game', 3], ["Dragon's Gems", 2]]);
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
		expect([q.get('startDate'), q.get('endDate'), q.get('breakdowns'), q.get('metrics')]).toEqual(['2026-10-22', '2026-11-20', 'date,app,platform,adNetwork', 'revenue,impressions']);
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

describe('the purchases action', () => {
	it('reads a purchase that went through, of any kind, and nothing else', () => {
		const ok = { item: 'coins_s', result: 'ok', store: 'play', asked: 'yes' };
		expect(readPurchase(iap('2026-11-19T10:00:00Z', ok), 'Pétanque Game')).toMatchObject({ at: '2026-11-19T10:00:00.000Z', app: 'Pétanque Game', item: 'coins_s', store: 'play', later: false, kind: 'real' });
		expect(readPurchase(iap('2026-11-19T10:00:00Z', { ...ok, result: 'fail' }), 'x')).toBeNull();
		expect(readPurchase(iap('2026-11-19T10:00:00Z', ok, 'iap_tap'), 'x')).toBeNull();
		expect(readPurchase(iap('not a date', ok), 'x')).toBeNull();
		expect(readPurchase(null, 'x')).toBeNull();
		expect(readPurchase({ eventProperties: 'nope' }, 'x')).toBeNull();
		const odd = readPurchase(iap('2026-11-19T10:00:00Z', { result: 'OK', item: 'k'.repeat(99), asked: 'no' }), 'x');
		expect(odd).toMatchObject({ item: 'k'.repeat(40), store: '', later: true, kind: 'unchecked' });
	});

	it('tells real purchases from testers, promos, dev and beta builds', () => {
		const kind = (props: Record<string, string>, host?: string) => purchaseKind(new Map(Object.entries(props)), host);
		expect(kind({ store: 'play', test: 'no' })).toBe('real');
		expect(kind({ store: 'play' })).toBe('real');
		expect(kind({ store: 'appstore' })).toBe('unchecked');
		expect(kind({ store: 'appstore', test: 'unknown' })).toBe('unchecked');
		expect(kind({ store: 'play', test: 'yes' })).toBe('tester');
		expect(kind({ store: 'play', test: 'promo' })).toBe('promo');
		expect(kind({ store: 'play', test: 'dev' })).toBe('dev');
		expect(kind({ store: 'dev' })).toBe('dev');
		expect(kind({ store: 'play', test: 'no', build: 'dev' })).toBe('dev');
		expect(kind({ store: 'play', test: 'no' }, 'com.ludivenstudio.petanquegame.dev')).toBe('dev');
		// Raphaël's rule: « beta » in the version, whatever the case, is never a real purchase.
		expect(kind({ store: 'play', test: 'no', app_version: '1.0.15-BETA' })).toBe('beta');
		expect(kind({ store: 'appstore', app_version: '1.2.0 beta 4' })).toBe('beta');
		expect(kind({ store: 'play', test: 'no' }, 'com.ludivenstudio.petanquegame.beta')).toBe('beta');
		expect(kind({ store: 'play', test: 'yes', app_version: '1.1.8-beta2' })).toBe('beta');
	});

	it("lists every app's purchases of 30 days, newest first, and caches them 10 minutes", async () => {
		const { fetchFn, calls } = fakeUmami(3);
		const cache = fakeCache();
		let now = NOW;
		const handle = statsHandler({ env: ENV, isAdmin, cache, fetch: fetchFn, now: () => now });
		const body = await (await handle(post({ action: 'purchases' }))).json() as Purchases;
		// The counted purchases' buyers are numbered first: 1 and 2, then the others' 3 to 6.
		expect(body.purchases).toEqual([
			{ at: '2026-11-20T08:00:00.000Z', app: 'Pétanque Meet', item: 'hearts', store: 'dev', later: false, kind: 'dev', buyer: 3 },
			{ at: '2026-11-19T12:00:00.000Z', app: 'Pétanque Meet', item: 'wardrobe', store: 'play', later: false, kind: 'beta', buyer: 4 },
			{ at: '2026-11-19T10:00:00.000Z', app: 'Pétanque Game', item: 'coins_s', store: 'play', later: false, kind: 'real', buyer: 1 },
			{ at: '2026-11-18T12:00:00.000Z', app: 'Pétanque Meet', item: 'full', store: 'play', later: false, kind: 'real', buyer: 2 },
			{ at: '2026-11-17T09:00:00.000Z', app: 'Pétanque Game', item: 'coins_l', store: 'play', later: false, kind: 'tester', buyer: 5 },
			{ at: '2026-11-16T09:00:00.000Z', app: 'Pétanque Game', item: 'no_ads', store: 'appstore', later: true, kind: 'unchecked', buyer: 1 },
			{ at: '2026-11-14T09:00:00.000Z', app: 'Pétanque Game', item: 'coins_m', store: 'play', later: false, kind: 'beta', buyer: 6 },
		]);
		expect(body).toMatchObject({ from: '2026-10-21T12:00:00.000Z', counted: 3, buyers: 2, errors: [], cached: false });
		expect(JSON.stringify(body)).not.toMatch(/eventId|session|s-a|v-s|e-2026|country|mobile|props|app_version|hostname|ludivenstudio/);
		expect(JSON.stringify(cache.rows.get(PURCHASES_KEY))).not.toMatch(/session|s-a/);
		const asked = calls.filter((c) => c.includes('/event-data?'));
		expect(asked).toHaveLength(2);
		expect(asked[0]).toContain('event=iap_result');
		expect(calls.filter((c) => c.includes('/events?'))).toHaveLength(2);
		expect(cache.rows.has(PURCHASES_KEY)).toBe(true);
		now = new Date(NOW.getTime() + 9 * 60_000);
		expect((await (await handle(post({ action: 'purchases' }))).json()).cached).toBe(true);
		expect((await (await handle(post({ action: 'purchases', refresh: true }))).json()).cached).toBe(false);
	});

	it('reads the pages it needs, and says when it stopped before the oldest', async () => {
		const many = (n: number) => Array.from({ length: n }, (_, i) => iap(new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(), { item: 'coins_s', result: 'ok', store: 'play' }));
		const { fetchFn, calls } = fakeUmami(3, { iapEvents: { 'w-pg': many(250), 'w-meet': many(700) } });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'purchases' }))).json() as Purchases;
		expect(calls.filter((c) => c.includes('w-pg/event-data?'))).toHaveLength(3);
		expect(calls.filter((c) => c.includes('w-meet/event-data?'))).toHaveLength(5);
		expect(body.purchases).toHaveLength(750);
		expect(body.buyers).toBe(2);
		expect(calls.filter((c) => c.includes('w-pg/events?'))).toHaveLength(3);
		expect(body.errors).toEqual(["Pétanque Meet : plus de 500 issues d'achat, seules les plus récentes sont lues"]);
	});

	it('names an app it could not read and keeps the others; an Umami without the list says so', async () => {
		const { fetchFn } = fakeUmami(3, { fail: /w-meet\/event-data\?/ });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'purchases' }))).json() as Purchases;
		expect(body.purchases.map((p) => p.app)).toEqual(['Pétanque Game', 'Pétanque Game', 'Pétanque Game', 'Pétanque Game']);
		expect(body.errors).toEqual(['Pétanque Meet : Umami GET /websites/w-meet/event-data: 500']);
		const v2 = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fakeUmami(2).fetchFn, now: () => NOW })(post({ action: 'purchases' }))).json() as Purchases;
		expect(v2.purchases).toEqual([]);
		expect(v2.errors).toHaveLength(2);
	});

	it('keeps the purchases without a buyer when the events list fails, and asks it nothing without a purchase', async () => {
		const { fetchFn } = fakeUmami(3, { fail: /w-pg\/events\?/ });
		const body = await (await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'purchases' }))).json() as Purchases;
		// Without the events list, PG's beta known by its hostname only reads as real: a declared limit.
		expect(body.purchases.map((p) => [p.app, p.kind, p.buyer])).toEqual([
			['Pétanque Meet', 'dev', 2], ['Pétanque Meet', 'beta', 3], ['Pétanque Game', 'real', null], ['Pétanque Meet', 'real', 1],
			['Pétanque Game', 'tester', null], ['Pétanque Game', 'unchecked', null], ['Pétanque Game', 'real', null],
		]);
		expect(body).toMatchObject({ counted: 4, buyers: 1 });
		expect(body.errors).toEqual(['Pétanque Game : acheteurs non lus (Umami GET /websites/w-pg/events: 500)']);
		const none = fakeUmami(3, { iapEvents: { 'w-pg': [iap('2026-11-19T10:00:00Z', { item: 'coins_s', result: 'cancel' })] } });
		await statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: none.fetchFn, now: () => NOW })(post({ action: 'purchases' }));
		expect(none.calls.filter((c) => c.includes('/events?'))).toHaveLength(0);
	});

	it('lets Raphaël only, and says 502 when Umami refuses the login', async () => {
		const { fetchFn } = fakeUmami(3, { loginFails: true });
		const handle = statsHandler({ env: ENV, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW });
		expect((await handle(post({ action: 'purchases' }, 'someone'))).status).toBe(403);
		const res = await handle(post({ action: 'purchases' }));
		expect(res.status).toBe(502);
		expect(JSON.stringify(await res.json())).not.toContain('pw');
	});
});
