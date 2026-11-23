import { describe, expect, it } from 'vitest';
import {
	APPSTORE_KEY, appStoreDays, appStoreSummary, ascToken, gunzip, isInApp, readEcbRates, readSalesTsv,
	type AppStoreSales, type Rates,
} from '../../supabase/functions/_shared/appStoreSales.mjs';
import { statsHandler } from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-23T15:00:00Z');
const HEAD = ['Provider', 'Provider Country', 'SKU', 'Developer', 'Title', 'Version', 'Product Type Identifier', 'Units', 'Developer Proceeds', 'Begin Date', 'End Date', 'Customer Currency', 'Country Code', 'Currency of Proceeds', 'Apple Identifier', 'Customer Price', 'Promo Code', 'Parent Identifier'];
const line = (o: Record<string, string>) => HEAD.map((h) => o[h] ?? '').join('\t');
const day = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
function report(date: string): string {
	return [
		HEAD.join('\t'),
		line({ SKU: 'petanquegame', Title: 'Pétanque Game', 'Product Type Identifier': '1F', Units: '12', 'Developer Proceeds': '0', 'Begin Date': day(date), 'Currency of Proceeds': 'EUR', 'Customer Price': '0', 'Customer Currency': 'EUR' }),
		line({ SKU: 'pg.coins2', Title: '6 000 pièces', 'Product Type Identifier': 'IA1', Units: '2', 'Developer Proceeds': '3.5', 'Begin Date': day(date), 'Currency of Proceeds': 'EUR', 'Customer Price': '4.99', 'Customer Currency': 'EUR', 'Parent Identifier': 'petanquegame' }),
		line({ SKU: 'pg.noads', Title: 'Sans publicité', 'Product Type Identifier': 'IA1', Units: '1', 'Developer Proceeds': '2.1', 'Begin Date': day(date), 'Currency of Proceeds': 'USD', 'Customer Price': '2.99', 'Customer Currency': 'USD', 'Parent Identifier': 'petanquegame' }),
		// A refund: negative units.
		line({ SKU: 'pg.coins2', Title: '6 000 pièces', 'Product Type Identifier': 'IA1', Units: '-1', 'Developer Proceeds': '3.5', 'Begin Date': day(date), 'Currency of Proceeds': 'EUR', 'Customer Price': '4.99', 'Customer Currency': 'EUR', 'Parent Identifier': 'petanquegame' }),
	].join('\n');
}

async function gzip(text: string): Promise<ArrayBuffer> {
	return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

async function p8(): Promise<{ pem: string; publicKey: CryptoKey }> {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
	return { pem: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey };
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

function fakeCache() {
	const rows = new Map<string, { body: unknown; fetchedAt: string }>();
	return { rows, get: async (k: string) => rows.get(k) ?? null, put: async (k: string, body: unknown) => void rows.set(k, { body, fetchedAt: NOW.toISOString() }) };
}

const post = (body: unknown) => new Request('https://x/', { method: 'POST', body: JSON.stringify(body) });
const isAdmin = async () => true;

describe('the App Store in-app sales', () => {
	it('reads a summary report: per unit amounts times units, refunds negative, the date from MM/DD/YYYY', () => {
		const rows = readSalesTsv(report('2026-11-20'));
		expect(rows).toHaveLength(4);
		expect(rows[1]).toMatchObject({ date: '2026-11-20', type: 'IA1', parent: 'petanquegame', units: 2, proceeds: 7, currency: 'EUR', gross: 9.98, grossCurrency: 'EUR' });
		expect(rows[3]).toMatchObject({ units: -1, proceeds: -3.5, gross: -4.99 });
		expect(rows.map(isInApp)).toEqual([false, true, true, true]);
		expect(readSalesTsv('')).toEqual([]);
	});

	it('sums in-app sales per day, app and currency, named after the app\'s own download row', () => {
		const { sales } = appStoreSummary(readSalesTsv(report('2026-11-20')), NOW);
		expect(sales).toEqual([
			{ date: '2026-11-20', app: 'Pétanque Game', units: 1, proceeds: 3.5, currency: 'EUR', gross: 4.99, grossCurrency: 'EUR' },
			{ date: '2026-11-20', app: 'Pétanque Game', units: 1, proceeds: 2.1, currency: 'USD', gross: 2.99, grossCurrency: 'USD' },
		]);
	});

	it('asks for every day from the earlier of the month start and 29 days ago, up to yesterday', () => {
		const days = appStoreDays(NOW);
		expect([days[0], days[days.length - 1], days.length]).toEqual(['2026-10-25', '2026-11-22', 29]);
		expect(appStoreDays(new Date('2026-12-31T10:00:00Z'))[0]).toBe('2026-12-01');
	});

	it('signs an ES256 token Apple can check with the key\'s public half', async () => {
		const { pem, publicKey } = await p8();
		const jwt = await ascToken({ ASC_PRIVATE_KEY: pem, ASC_KEY_ID: 'KEY1', ASC_ISSUER_ID: 'issuer-1' }, NOW);
		const [h, p, s] = jwt.split('.');
		expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'ES256', kid: 'KEY1', typ: 'JWT' });
		expect(JSON.parse(new TextDecoder().decode(fromB64url(p)))).toMatchObject({ iss: 'issuer-1', aud: 'appstoreconnect-v1' });
		expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
	});

	it('unzips a gzipped report', async () => {
		expect(await gunzip(await gzip('a\tb'))).toBe('a\tb');
	});

	it('serves the action: 503 without its key, then every day read once, a day without sale skipped, then the cache', async () => {
		const cache = fakeCache();
		expect((await statsHandler({ env: { PROMO_ADMIN_USER_ID: 'raph' }, isAdmin, cache, now: () => NOW })(post({ action: 'appstore' }))).status).toBe(503);
		const { pem } = await p8();
		const asked: string[] = [];
		const fetchFn = (async (url: string, init: RequestInit) => {
			const u = new URL(url);
			expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer .+\..+\..+$/);
			expect(u.searchParams.get('filter[vendorNumber]')).toBe('8800');
			const date = u.searchParams.get('filter[reportDate]')!;
			asked.push(date);
			if (date !== '2026-11-20') return new Response('no sales', { status: 404 });
			return new Response(await gzip(report(date)), { status: 200 });
		}) as unknown as typeof fetch;
		const env = { PROMO_ADMIN_USER_ID: 'raph', ASC_ISSUER_ID: 'i', ASC_KEY_ID: 'k', ASC_PRIVATE_KEY: pem, ASC_VENDOR_NUMBER: '8800' };
		const handle = statsHandler({ env, isAdmin, cache, fetch: fetchFn, now: () => NOW });
		const body = (await (await handle(post({ action: 'appstore' }))).json()) as AppStoreSales;
		expect(asked).toHaveLength(29);
		expect([body.from, body.to, body.cached, body.sales.length, body.errors]).toEqual(['2026-10-25', '2026-11-22', false, 2, []]);
		expect(cache.rows.has(APPSTORE_KEY)).toBe(true);
		expect(((await (await handle(post({ action: 'appstore' }))).json()) as AppStoreSales).cached).toBe(true);
		expect(asked).toHaveLength(29);
	});

	it('says the key is refused rather than showing no sales', async () => {
		const { pem } = await p8();
		const env = { PROMO_ADMIN_USER_ID: 'raph', ASC_ISSUER_ID: 'i', ASC_KEY_ID: 'k', ASC_PRIVATE_KEY: pem, ASC_VENDOR_NUMBER: '1' };
		const fetchFn = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
		const res = await statsHandler({ env, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'appstore' }));
		expect(res.status).toBe(502);
	});
});

describe('the ECB rates', () => {
	const XML = `<gesmes:Envelope><Cube><Cube time='2026-11-20'><Cube currency='USD' rate='1.0512'/><Cube currency='CHF' rate='0.9381'/></Cube></Cube></gesmes:Envelope>`;

	it('reads how much of each currency a euro buys', () => {
		expect(readEcbRates(XML)).toEqual({ date: '2026-11-20', perEur: { EUR: 1, USD: 1.0512, CHF: 0.9381 } });
	});

	it('serves them through the action, kept half a day', async () => {
		let calls = 0;
		const fetchFn = (async () => (calls++, new Response(XML, { status: 200 }))) as unknown as typeof fetch;
		const handle = statsHandler({ env: { PROMO_ADMIN_USER_ID: 'raph' }, isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW });
		const first = (await (await handle(post({ action: 'rates' }))).json()) as Rates;
		expect([first.date, first.perEur.USD, first.cached]).toEqual(['2026-11-20', 1.0512, false]);
		expect(((await (await handle(post({ action: 'rates' }))).json()) as Rates).cached).toBe(true);
		expect(calls).toBe(1);
	});
});
