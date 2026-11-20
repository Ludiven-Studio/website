import { describe, it, expect } from 'vitest';
import {
	CACHE_KEY, num, readCounts, readHosts, readRetention, readStats, statsHandler, tapRates,
	type Overview,
} from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-20T12:00:00Z');
const BASE = 'https://stats.example';
const ENV = { UMAMI_URL: BASE, UMAMI_USER: 'dashboard', UMAMI_PASSWORD: 'pw', PROMO_ADMIN_USER_ID: 'raph' };

/** A fake Umami: two websites, v2 or v3 answer shapes, and the calls it got. */
function fakeUmami(version: 2 | 3, opts: { fail?: RegExp; loginFails?: boolean; inTeam?: boolean } = {}) {
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
			if (!b.websiteId || !(b.dateRange?.startDate || b.parameters?.startDate)) return new Response('{}', { status: 400 });
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
	const rows = new Map<string, { body: Overview; fetchedAt: string }>();
	return {
		rows,
		get: async (key: string) => {
			if (broken) throw new Error('db down');
			return rows.get(key) ?? null;
		},
		put: async (key: string, body: Overview) => {
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
