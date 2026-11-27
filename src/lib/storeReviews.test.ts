import { describe, it, expect, beforeAll } from 'vitest';
import { appStoreRatings, combine, decodeReport, readPlayOverview, readPlayReviews, storeReviews, REVIEWS_KEY, type Reviews } from '../../supabase/functions/_shared/storeReviews.mjs';
import { parseCsv } from '../../supabase/functions/_shared/playSales.mjs';
import { statsHandler } from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-27T12:00:00Z');
const REVIEW_HEAD = 'Package Name,App Version Code,App Version Name,Reviewer Language,Device,Review Submit Date and Time,Review Submit Millis Since Epoch,Review Last Update Date and Time,Review Last Update Millis Since Epoch,Star Rating,Review Title,Review Text,Developer Reply Date and Time,Developer Reply Millis Since Epoch,Developer Reply Text,Review Link';
const ms = (iso: string) => String(Date.parse(iso));
const review = (pkg: string, iso: string, stars: number, text = '', reply = '') =>
	`${pkg},100024,1.0.24,fr,a54x,${iso},${ms(iso)},${iso},${ms(iso)},${stars},,"${text}",${reply ? `${iso},${ms(iso)}` : ','},"${reply}",https://play.google.com/apps/publish?account=1&reviewid=abc`;
/** Google's exports are UTF-16LE with a BOM. */
const utf16 = (s: string) => {
	const out = new Uint8Array(2 + s.length * 2);
	out[0] = 0xff; out[1] = 0xfe;
	for (let i = 0; i < s.length; i++) { out[2 + i * 2] = s.charCodeAt(i) & 0xff; out[3 + i * 2] = s.charCodeAt(i) >> 8; }
	return out;
};

let keyJson = '';
beforeAll(async () => {
	const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
	const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
	const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----\n`;
	keyJson = JSON.stringify({ client_email: 'play-reports@ludiven.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
});
const env = () => ({ PLAY_REPORTS_KEY: keyJson, PLAY_REPORTS_BUCKET: 'gs://pubsite_prod_rev_0123/' });

/** Apple's lookup: each country answers for the apps sold there. */
const APPLE: Record<string, { bundleId: string; averageUserRating: number; userRatingCount: number; version: string; trackViewUrl: string }[]> = {
	fr: [
		{ bundleId: 'com.ludivenstudio.ninorush', averageUserRating: 4.5, userRatingCount: 4, version: '1.0.24', trackViewUrl: 'https://apps.apple.com/fr/app/nino-rush/id1?uo=4' },
		{ bundleId: 'com.raphbenpro.petanquear', averageUserRating: 5, userRatingCount: 1, version: '1.2.19', trackViewUrl: 'https://apps.apple.com/fr/app/scan/id2?uo=4' },
	],
	be: [{ bundleId: 'com.ludivenstudio.ninorush', averageUserRating: 3, userRatingCount: 2, version: '1.0.24', trackViewUrl: 'https://apps.apple.com/be/app/nino-rush/id1?uo=4' }],
};

function fakeStores(files: Record<string, Uint8Array>, opts: { closed?: boolean; appleDown?: boolean } = {}) {
	const calls: string[] = [];
	const fetchFn = (async (input: RequestInfo | URL) => {
		const u = new URL(String(input));
		calls.push(`${u.host}${u.pathname}${u.search}`);
		if (u.host === 'itunes.apple.com') {
			if (opts.appleDown) return new Response('down', { status: 503 });
			const bundles = (u.searchParams.get('bundleId') ?? '').split(',');
			const results = (APPLE[u.searchParams.get('country') ?? ''] ?? []).filter((r) => bundles.includes(r.bundleId));
			return Response.json({ resultCount: results.length, results });
		}
		if (u.host === 'oauth2.googleapis.com') return Response.json({ access_token: 'gtok' });
		if (u.host === 'storage.googleapis.com') {
			if (opts.closed) return new Response('forbidden', { status: 403 });
			const m = /^\/storage\/v1\/b\/pubsite_prod_rev_0123\/o\/?(.*)$/.exec(u.pathname);
			if (!m) return new Response('no', { status: 404 });
			if (!m[1]) {
				const prefix = u.searchParams.get('prefix') ?? '';
				return Response.json({ items: Object.keys(files).filter((n) => n.startsWith(prefix)).map((name) => ({ name })) });
			}
			const body = files[decodeURIComponent(m[1])];
			return body ? new Response(body as Uint8Array<ArrayBuffer>) : new Response('none', { status: 404 });
		}
		return new Response('unexpected', { status: 500 });
	}) as typeof fetch;
	return { fetchFn, calls };
}

const NINO = 'com.ludivenstudio.ninorush';
const FILES = () => ({
	[`reviews/reviews_${NINO}_202611.csv`]: utf16([REVIEW_HEAD, review(NINO, '2026-11-26T09:00:00Z', 5, 'Trop bien, ma fille adore', 'Merci !'), review(NINO, '2026-11-25T18:00:00Z', 2)].join('\n')),
	[`reviews/reviews_${NINO}_202610.csv`]: utf16([REVIEW_HEAD, review(NINO, '2026-10-02T09:00:00Z', 4, 'Joli, un peu dur')].join('\n')),
	[`stats/ratings/ratings_${NINO}_202611_overview.csv`]: utf16(['Date,Package Name,Daily Average Rating,Total Average Rating', `2026-11-25,${NINO},2.00,3.50`, `2026-11-26,${NINO},5.00,3.67`].join('\n')),
	// Another studio's package in the same bucket stays out.
	'reviews/reviews_com.other.app_202611.csv': utf16([REVIEW_HEAD, review('com.other.app', '2026-11-26T09:00:00Z', 1)].join('\n')),
});

describe('the stores ratings and reviews', () => {
	it('combines countries by their number of ratings', () => {
		expect(combine([{ average: 4.5, count: 4 }, { average: 3, count: 2 }])).toEqual({ average: 4, count: 6 });
		expect(combine([])).toEqual({ average: null, count: 0 });
	});

	it('reads the App Store per country with one lookup per country for every app', async () => {
		const { fetchFn, calls } = fakeStores({});
		const r = await appStoreRatings(fetchFn, undefined, ['fr', 'be', 'us']);
		expect(calls).toHaveLength(3);
		const nino = r.apps.find((a) => a.app === 'nino-rush')!;
		expect(nino).toMatchObject({ live: true, average: 4, count: 6, version: '1.0.24', url: 'https://apps.apple.com/app/nino-rush/id1' });
		expect(nino.countries).toEqual([{ country: 'fr', average: 4.5, count: 4 }, { country: 'be', average: 3, count: 2 }]);
		expect(r.apps.find((a) => a.app === 'petanque-meet')).toMatchObject({ live: false, average: null, count: 0 });
	});

	it('reads Google exports in UTF-16: stars, text, our reply, no device', () => {
		const rows = readPlayReviews(parseCsv(decodeReport(FILES()[`reviews/reviews_${NINO}_202611.csv`])), 'nino-rush');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			app: 'nino-rush', store: 'play', stars: 5, at: '2026-11-26T09:00:00.000Z', title: '', text: 'Trop bien, ma fille adore', lang: 'fr', version: '1.0.24',
			reply: 'Merci !', replyAt: '2026-11-26T09:00:00.000Z', link: 'https://play.google.com/apps/publish?account=1&reviewid=abc',
		});
		expect(rows[1]).toMatchObject({ stars: 2, text: '', reply: null, replyAt: null });
		expect(JSON.stringify(rows)).not.toContain('a54x');
		expect(readPlayOverview(parseCsv(decodeReport(FILES()[`stats/ratings/ratings_${NINO}_202611_overview.csv`])))).toEqual({ date: '2026-11-26', average: 3.67 });
	});

	it('puts both stores together: Google average, every review since launch, the last 30 days', async () => {
		const { fetchFn } = fakeStores(FILES());
		const r = await storeReviews(env(), fetchFn, NOW);
		expect(r.play).toBe('ok');
		const nino = r.apps.find((a) => a.app === 'nino-rush')!;
		expect(nino.stores.find((s) => s.store === 'play')).toMatchObject({ live: true, average: 3.67, count: 3, url: `https://play.google.com/store/apps/details?id=${NINO}` });
		expect(nino.last30).toEqual({ average: 3.5, count: 2 });
		expect(r.reviews.map((x) => [x.app, x.stars, x.at.slice(0, 10)])).toEqual([['nino-rush', 5, '2026-11-26'], ['nino-rush', 2, '2026-11-25'], ['nino-rush', 4, '2026-10-02']]);
		expect(r.apps.find((a) => a.app === 'petanque-game')!.stores.find((s) => s.store === 'play')).toMatchObject({ live: false, count: 0 });
	});

	it('says Google is closed on a 403, and still gives the App Store', async () => {
		const { fetchFn } = fakeStores(FILES(), { closed: true });
		const r = await storeReviews(env(), fetchFn, NOW);
		expect(r.play).toBe('closed');
		expect(r.reviews).toEqual([]);
		expect(r.apps.find((a) => a.app === 'nino-rush')!.stores).toMatchObject([{ store: 'appstore', count: 6 }]);
		const unset = await storeReviews({}, fakeStores({}).fetchFn, NOW);
		expect(unset.play).toBe('unset');
	});

	it('names each App Store country that did not answer', async () => {
		const { fetchFn } = fakeStores({}, { appleDown: true });
		const r = await storeReviews({}, fetchFn, NOW);
		expect(r.errors[0]).toBe('App Store (fr) : 503');
		expect(r.apps.every((a) => a.stores.every((s) => !s.live))).toBe(true);
	});

	it('answers the reviews action for the admin only, then from its cache', async () => {
		const store = new Map<string, { body: unknown; fetchedAt: string }>();
		const cache = { get: (k: string) => store.get(k) ?? null, put: (k: string, body: unknown) => void store.set(k, { body, fetchedAt: NOW.toISOString() }) };
		const { fetchFn, calls } = fakeStores(FILES());
		const handler = statsHandler({ env: { ...env(), PROMO_ADMIN_USER_ID: 'raph' }, isAdmin: async (req) => req.headers.get('Authorization') === 'Bearer raph-jwt', cache, fetch: fetchFn, now: () => NOW });
		const post = (token: string) => new Request('https://fn.example/stats-admin', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'reviews' }) });
		expect((await handler(post('other'))).status).toBe(403);
		const first = (await (await handler(post('raph-jwt'))).json()) as Reviews;
		expect([first.cached, first.play, store.has(REVIEWS_KEY)]).toEqual([false, 'ok', true]);
		const n = calls.length;
		const second = (await (await handler(post('raph-jwt'))).json()) as Reviews;
		expect([second.cached, calls.length]).toEqual([true, n]);
	});
});
