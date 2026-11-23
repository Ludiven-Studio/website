import { describe, it, expect, beforeAll } from 'vitest';
import { csvFromZip, parseCsv, readBucket, readKey, readOrders, ORDERS_KEY, type PlayOrders } from '../../supabase/functions/_shared/playSales.mjs';
import { statsHandler } from '../../supabase/functions/_shared/statsAdmin.mjs';

const NOW = new Date('2026-11-20T12:00:00Z');
const HEAD = 'Order Number,Order Charged Date,Order Charged Timestamp,Financial Status,Device Model,Product Title,Product ID,Product Type,SKU ID,Currency of Sale,Item Price,Taxes Collected,Charged Amount,City of Buyer,State of Buyer,Postal Code of Buyer,Country of Buyer';
const ts = (iso: string) => String(Date.parse(iso) / 1000);
const line = (iso: string, status: string, sku: string, cur: string, price: string, charged: string, country: string, title = 'Pétanque Game') =>
	`GPA.3300-1111-2222-${sku},${iso.slice(0, 10)},${ts(iso)},${status},a54x,"${title}",com.ludivenstudio.petanquegame,inapp,${sku},${cur},${price},0.80,${charged},Lyon,Rhône,69001,${country}`;

/** A zip of the given files, each stored (0) or deflated (8). */
async function zip(files: { name: string; data: Uint8Array; method?: 0 | 8 }[]): Promise<Uint8Array> {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const f of files) {
		const method = f.method ?? 8;
		const body = method === 8 ? new Uint8Array(await new Response(new Blob([f.data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : f.data;
		const name = new TextEncoder().encode(f.name);
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(8, method, true);
		local.setUint32(18, body.length, true);
		local.setUint32(22, f.data.length, true);
		local.setUint16(26, name.length, true);
		const cd = new DataView(new ArrayBuffer(46));
		cd.setUint32(0, 0x02014b50, true);
		cd.setUint16(10, method, true);
		cd.setUint32(20, body.length, true);
		cd.setUint32(24, f.data.length, true);
		cd.setUint16(28, name.length, true);
		cd.setUint32(42, offset, true);
		parts.push(new Uint8Array(local.buffer), name, body);
		central.push(new Uint8Array(cd.buffer), name);
		offset += 30 + name.length + body.length;
	}
	const cdSize = central.reduce((n, p) => n + p.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, cdSize, true);
	end.setUint32(16, offset, true);
	const all = [...parts, ...central, new Uint8Array(end.buffer)];
	const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of all) { out.set(p, at); at += p.length; }
	return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);

let keyJson = '';
let publicKey: CryptoKey;
beforeAll(async () => {
	const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
	publicKey = pair.publicKey;
	const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
	const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----\n`;
	keyJson = JSON.stringify({ type: 'service_account', client_email: 'play-reports@ludiven.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
});

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** A fake Google: the token endpoint checks the JWT's signature and claims, Cloud Storage serves the reports. */
function fakeGoogle(reports: Record<string, Uint8Array>, opts: { refuseToken?: boolean; storageFails?: boolean } = {}) {
	const calls: string[] = [];
	const claims: Record<string, unknown>[] = [];
	const fetchFn = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
		const u = new URL(String(url));
		calls.push(`${init.method ?? 'GET'} ${u.host}${u.pathname}`);
		if (u.host === 'oauth2.googleapis.com') {
			const form = new URLSearchParams(String(init.body));
			const [h, p, sig] = String(form.get('assertion')).split('.');
			const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`));
			claims.push(JSON.parse(new TextDecoder().decode(fromB64url(p))));
			if (opts.refuseToken || !ok || form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') return new Response('{"error":"invalid_grant"}', { status: 400 });
			return Response.json({ access_token: 'gtok', expires_in: 3600 });
		}
		if (u.host === 'storage.googleapis.com') {
			if ((init.headers as Record<string, string>)?.Authorization !== 'Bearer gtok') return new Response('', { status: 401 });
			if (opts.storageFails) return new Response('', { status: 403 });
			const m = u.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
			const file = m && m[1] === 'pubsite_prod_rev_0123' && u.searchParams.get('alt') === 'media' ? reports[decodeURIComponent(m[2])] : undefined;
			return file ? new Response(file as Uint8Array<ArrayBuffer>) : new Response('', { status: 404 });
		}
		return new Response('', { status: 404 });
	};
	return { fetchFn: fetchFn as typeof fetch, calls, claims };
}

const ENV = () => ({ PROMO_ADMIN_USER_ID: 'raph', PLAY_REPORTS_KEY: keyJson, PLAY_REPORTS_BUCKET: 'gs://pubsite_prod_rev_0123/' });
const isAdmin = async (req: Request) => req.headers.get('Authorization') === 'Bearer raph-jwt';
const post = (body: unknown, token = 'raph-jwt') =>
	new Request('https://fn.example/stats-admin', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function fakeCache() {
	const rows = new Map<string, { body: unknown; fetchedAt: string }>();
	return { rows, get: async (k: string) => rows.get(k) ?? null, put: async (k: string, body: unknown) => { rows.set(k, { body, fetchedAt: NOW.toISOString() }); } };
}

async function reports() {
	return {
		'sales/salesreport_202610.zip': await zip([{ name: 'salesreport_202610.csv', data: utf8([HEAD,
			line('2026-10-15T09:00:00Z', 'Charged', 'coins500', 'EUR', '0.83', '0.99', 'FR'),
			line('2026-10-25T09:00:00Z', 'Charged', 'coins4000', 'EUR', '4.16', '4.99', 'FR'),
		].join('\r\n')) }]),
		'sales/salesreport_202611.zip': await zip([{ name: 'salesreport_202611.csv', data: utf8(['﻿' + HEAD,
			line('2026-11-15T10:00:00Z', 'Charged', 'coins4000', 'EUR', '4.16', '4.99', 'FR'),
			line('2026-11-15T10:05:00Z', 'Charged', 'coins1500', 'EUR', '2.08', '2.49', 'BE'),
			line('2026-11-16T10:00:00Z', 'Charged', 'noads', 'CHF', '2.80', '3.00', 'CH'),
			line('2026-11-17T10:00:00Z', 'Refund', 'coins1500', 'EUR', '2.08', '2.49', 'FR'),
		].join('\n') + '\n') }]),
	};
}

describe('reading the Play sales report', () => {
	it('parses quoted fields, doubled quotes, commas and line breaks inside quotes', () => {
		expect(parseCsv('a,"b, c","d ""e"""\r\n"f\ng",,h\n\n')).toEqual([['a', 'b, c', 'd "e"'], ['f\ng', '', 'h']]);
	});

	it('reads the csv out of a stored or deflated zip, in UTF-8 or UTF-16', async () => {
		expect(await csvFromZip(await zip([{ name: 'readme.txt', data: utf8('no') }, { name: 'r.csv', data: utf8('x,y'), method: 0 }]))).toBe('x,y');
		expect(await csvFromZip(await zip([{ name: 'r.csv', data: utf8('﻿é,ü') }]))).toBe('é,ü');
		const u16 = new Uint8Array([0xff, 0xfe, ...Array.from('é,1').flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
		expect(await csvFromZip(await zip([{ name: 'r.csv', data: u16 }]))).toBe('é,1');
		await expect(csvFromZip(utf8('not a zip at all, not even close'))).rejects.toThrow('not a zip');
		await expect(csvFromZip(await zip([{ name: 'r.txt', data: utf8('x') }]))).rejects.toThrow('no csv');
	});

	it('keeps the order and drops the buyer: no order number, city, postal code or device', () => {
		const orders = readOrders(parseCsv([HEAD, line('2026-11-15T10:00:00Z', 'Charged', 'coins4000', 'EUR', '4.16', '4.99', 'fr')].join('\n')));
		expect(orders).toEqual([{ at: '2026-11-15T10:00:00.000Z', app: 'Pétanque Game', package: 'com.ludivenstudio.petanquegame', product: 'coins4000', status: 'charged', currency: 'EUR', price: 4.16, charged: 4.99, country: 'FR' }]);
		expect(JSON.stringify(orders)).not.toMatch(/GPA|Lyon|69001|a54x|Rhône/);
		// The date column when there is no timestamp; rows without any date are dropped.
		const byDate = readOrders([['Order Charged Date', 'Charged Amount', 'Currency of Sale'], ['2026-11-02', '1,99', 'eur'], ['', '1', 'EUR']]);
		expect(byDate).toEqual([expect.objectContaining({ at: '2026-11-02T12:00:00.000Z', charged: 1.99, currency: 'EUR' })]);
		expect(readOrders([])).toEqual([]);
	});

	it('takes the key as JSON or base64, and the bucket as the console shows it', () => {
		const k = readKey(keyJson);
		expect(k.email).toBe('play-reports@ludiven.iam.gserviceaccount.com');
		expect(readKey(btoa(keyJson)).email).toBe(k.email);
		expect(() => readKey('nope')).toThrow('not a service account');
		expect(() => readKey('{"client_email":"x"}')).toThrow('lacks');
		expect(readBucket('gs://pubsite_prod_rev_0123/')).toBe('pubsite_prod_rev_0123');
		expect(readBucket('pubsite_prod_0123')).toBe('pubsite_prod_0123');
		expect(() => readBucket('gs://Bad Bucket/')).toThrow('not a bucket');
	});
});

describe('the orders action', () => {
	it('signs in as the service account, reads both months, keeps 30 days, totals per currency and caches an hour', async () => {
		const { fetchFn, calls, claims } = fakeGoogle(await reports());
		const cache = fakeCache();
		let now = NOW;
		const handle = statsHandler({ env: ENV(), isAdmin, cache, fetch: fetchFn, now: () => now });
		const res = await handle(post({ action: 'orders' }));
		expect(res.status).toBe(200);
		const body = await res.json() as PlayOrders;
		expect(claims[0]).toMatchObject({ iss: 'play-reports@ludiven.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: 'https://oauth2.googleapis.com/token' });
		expect(Number(claims[0].exp) - Number(claims[0].iat)).toBe(3600);
		expect(calls.filter((c) => c.includes('storage.googleapis.com'))).toEqual([
			'GET storage.googleapis.com/storage/v1/b/pubsite_prod_rev_0123/o/sales%2Fsalesreport_202610.zip',
			'GET storage.googleapis.com/storage/v1/b/pubsite_prod_rev_0123/o/sales%2Fsalesreport_202611.zip',
		]);
		expect(body.orders.map((o) => [o.at.slice(0, 10), o.product, o.status, o.charged])).toEqual([
			['2026-11-17', 'coins1500', 'refund', 2.49],
			['2026-11-16', 'noads', 'charged', 3],
			['2026-11-15', 'coins1500', 'charged', 2.49],
			['2026-11-15', 'coins4000', 'charged', 4.99],
			['2026-10-25', 'coins4000', 'charged', 4.99],
		]);
		expect(body.totals).toEqual([{ currency: 'EUR', orders: 3, charged: 12.47 }, { currency: 'CHF', orders: 1, charged: 3 }]);
		expect(body).toMatchObject({ from: '2026-10-21T12:00:00.000Z', errors: [], cached: false });
		const text = JSON.stringify(body) + JSON.stringify(cache.rows.get(ORDERS_KEY));
		expect(text).not.toMatch(/PRIVATE KEY|gtok|GPA|Lyon|69001|a54x/);
		now = new Date(NOW.getTime() + 59 * 60_000);
		expect((await (await handle(post({ action: 'orders' }))).json()).cached).toBe(true);
		expect((await (await handle(post({ action: 'orders', refresh: true }))).json()).cached).toBe(false);
	});

	it('skips a month with no report yet, and names a report it could not read', async () => {
		const r = await reports();
		const { fetchFn } = fakeGoogle({ 'sales/salesreport_202611.zip': r['sales/salesreport_202611.zip'] });
		const body = await (await statsHandler({ env: ENV(), isAdmin, cache: fakeCache(), fetch: fetchFn, now: () => NOW })(post({ action: 'orders' }))).json() as PlayOrders;
		expect(body.orders).toHaveLength(4);
		const broken = fakeGoogle({ ...r, 'sales/salesreport_202610.zip': utf8('garbage') });
		const b2 = await (await statsHandler({ env: ENV(), isAdmin, cache: fakeCache(), fetch: broken.fetchFn, now: () => NOW })(post({ action: 'orders' }))).json() as PlayOrders;
		expect(b2.orders).toHaveLength(4);
		expect(b2.errors).toEqual(['salesreport_202610 : report: not a zip']);
	});

	it('says what is missing or refused, sends no secret back, and lets Raphaël only', async () => {
		const { fetchFn } = fakeGoogle(await reports(), { refuseToken: true });
		const cache = fakeCache();
		const handle = (env: Record<string, string>, f = fetchFn) => statsHandler({ env, isAdmin, cache, fetch: f, now: () => NOW });
		expect((await handle(ENV())(post({ action: 'orders' }, 'someone'))).status).toBe(403);
		const missing = await handle({ PROMO_ADMIN_USER_ID: 'raph', PLAY_REPORTS_KEY: keyJson })(post({ action: 'orders' }));
		expect([missing.status, (await missing.json()).error]).toEqual([503, 'orders not configured']);
		const refused = await handle(ENV())(post({ action: 'orders' }));
		const body = await refused.json();
		expect([refused.status, body.error, body.detail]).toEqual([502, 'Google Play did not answer', 'Google token: 400']);
		expect(JSON.stringify(body)).not.toMatch(/PRIVATE KEY|invalid_grant/);
		const denied = fakeGoogle(await reports(), { storageFails: true });
		const d = await (await handle(ENV(), denied.fetchFn)(post({ action: 'orders' }))).json();
		expect(d.detail).toBe('Cloud Storage salesreport_202610: 403');
		const bad = await (await handle({ ...ENV(), PLAY_REPORTS_KEY: 'nope' })(post({ action: 'orders' }))).json();
		expect(bad.detail).toBe('PLAY_REPORTS_KEY is not a service account JSON key');
	});
});
