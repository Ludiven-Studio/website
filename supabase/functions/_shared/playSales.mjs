// Google Play's orders with their real price, from the Play Console's sales reports: a zip per month,
// sales/salesreport_YYYYMM.zip in the developer's Cloud Storage bucket (pubsite_prod_…), updated every day.
// Read with a service account that has only « View financial data » in the Play Console. Plain JavaScript on
// fetch and WebCrypto, so vitest runs it against a fake Google and Deno serves it (stats-admin).
//
// The report also holds the order number, the buyer's city, postal code and device model: none of them leaves
// this module.

export const ORDERS_KEY = 'orders';
export const ORDERS_CACHE_MINUTES = 60;
export const ORDERS_DAYS = 30;
const DAY = 86_400_000;
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STORAGE = 'https://storage.googleapis.com/storage/v1';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64url = (s) => b64url(new TextEncoder().encode(s));

/** The service account key from its secret: the JSON file's text, or that text in base64 (easier to pass to the
 *  CLI from PowerShell). */
export function readKey(secret) {
	const raw = String(secret ?? '').trim();
	let key;
	try {
		key = JSON.parse(raw.startsWith('{') ? raw : new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))));
	} catch {
		throw new Error('PLAY_REPORTS_KEY is not a service account JSON key');
	}
	if (typeof key?.client_email !== 'string' || typeof key?.private_key !== 'string') throw new Error('PLAY_REPORTS_KEY lacks client_email or private_key');
	return { email: key.client_email, pem: key.private_key, tokenUrl: typeof key.token_uri === 'string' ? key.token_uri : TOKEN_URL };
}

/** The bucket's name from what the Play Console shows: gs://pubsite_prod_…/ or the bare name. */
export function readBucket(v) {
	const name = String(v ?? '').trim().replace(/^gs:\/\//, '').split('/')[0];
	if (!/^[a-z0-9][a-z0-9._-]{2,62}$/.test(name)) throw new Error('PLAY_REPORTS_BUCKET is not a bucket name');
	return name;
}

/** An OAuth access token for read-only Cloud Storage: a JWT signed with the service account's key. */
export async function googleToken(key, fetchFn, now) {
	const der = Uint8Array.from(atob(key.pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
	const signer = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
	const iat = Math.floor(now.getTime() / 1000);
	const unsigned = `${text64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${text64url(JSON.stringify({ iss: key.email, scope: SCOPE, aud: key.tokenUrl, iat, exp: iat + 3600 }))}`;
	const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(unsigned));
	const res = await fetchFn(key.tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }).toString(),
	});
	if (!res.ok) throw new Error(`Google token: ${res.status}`);
	const body = await res.json().catch(() => null);
	if (typeof body?.access_token !== 'string') throw new Error('Google token: none in the answer');
	return body.access_token;
}

/** The first .csv file of a zip, as text (stored or deflated; UTF-8 or UTF-16 with its BOM). */
export async function csvFromZip(buf) {
	const b = new Uint8Array(buf);
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	let end = -1;
	for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
	if (end < 0) throw new Error('report: not a zip');
	const count = v.getUint16(end + 10, true);
	let at = v.getUint32(end + 16, true);
	for (let n = 0; n < count && at + 46 <= b.length && v.getUint32(at, true) === 0x02014b50; n++) {
		const method = v.getUint16(at + 10, true);
		const size = v.getUint32(at + 20, true);
		const nameLen = v.getUint16(at + 28, true);
		const skip = nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
		const name = new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen));
		const local = v.getUint32(at + 42, true);
		at += 46 + skip;
		if (!/\.csv$/i.test(name)) continue;
		if (v.getUint32(local, true) !== 0x04034b50) throw new Error('report: broken zip');
		const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
		const data = b.subarray(start, start + size);
		let out;
		if (method === 0) out = data;
		else if (method === 8) out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
		else throw new Error(`report: zip method ${method}`);
		if (out[0] === 0xff && out[1] === 0xfe) return new TextDecoder('utf-16le').decode(out.subarray(2));
		return new TextDecoder().decode(out).replace(/^﻿/, '');
	}
	throw new Error('report: no csv in the zip');
}

/** RFC 4180 rows: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text) {
	const rows = [];
	let row = [], field = '', quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
			else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') { row.push(field); field = ''; }
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field); field = '';
			if (row.some((f) => f !== '')) rows.push(row);
			row = [];
		} else field += c;
	}
	row.push(field);
	if (row.some((f) => f !== '')) rows.push(row);
	return rows;
}

const amount = (s) => {
	const t = String(s ?? '').replace(/[\s ]/g, '');
	// « 4.99 » in the report; a decimal comma or a thousands comma, just in case.
	const n = Number(/^-?\d+,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, ''));
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const cell = (s, max = 80) => String(s ?? '').trim().slice(0, max);

/** The report's rows as orders, the buyer's data left out; rows without a readable date are dropped. */
export function readOrders(csvRows) {
	const [head, ...body] = csvRows;
	if (!head) return [];
	const col = new Map(head.map((h, i) => [h.trim().toLowerCase(), i]));
	const get = (r, name) => (col.has(name) ? r[col.get(name)] : undefined);
	const orders = [];
	for (const r of body) {
		const ts = Number(get(r, 'order charged timestamp'));
		const time = Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.parse(`${cell(get(r, 'order charged date'))}T12:00:00Z`);
		if (!Number.isFinite(time)) continue;
		orders.push({
			at: new Date(time).toISOString(),
			app: cell(get(r, 'product title')) || cell(get(r, 'product id')),
			package: cell(get(r, 'product id')),
			product: cell(get(r, 'sku id')),
			status: cell(get(r, 'financial status'), 40).toLowerCase(),
			currency: cell(get(r, 'currency of sale'), 3).toUpperCase(),
			price: amount(get(r, 'item price')),
			charged: amount(get(r, 'charged amount')),
			country: cell(get(r, 'country of buyer'), 2).toUpperCase(),
		});
	}
	return orders;
}

const month = (t) => new Date(t).toISOString().slice(0, 7).replace('-', '');

/** The last 30 days of orders, newest first, with the charged total per currency. */
export async function playOrders(env, fetchFn, now) {
	const key = readKey(env.PLAY_REPORTS_KEY);
	const bucket = readBucket(env.PLAY_REPORTS_BUCKET);
	const token = await googleToken(key, fetchFn, now);
	const from = now.getTime() - ORDERS_DAYS * DAY;
	const months = [...new Set([month(from), month(now.getTime())])];
	const errors = [];
	const all = [];
	for (const m of months) {
		const object = encodeURIComponent(`sales/salesreport_${m}.zip`);
		const res = await fetchFn(`${STORAGE}/b/${encodeURIComponent(bucket)}/o/${object}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
		// A month with no sale yet has no report.
		if (res.status === 404) continue;
		if (!res.ok) throw new Error(`Cloud Storage salesreport_${m}: ${res.status}`);
		try {
			all.push(...readOrders(parseCsv(await csvFromZip(await res.arrayBuffer()))));
		} catch (e) {
			errors.push(`salesreport_${m} : ${String(e?.message ?? e).slice(0, 160)}`);
		}
	}
	const orders = all.filter((o) => Date.parse(o.at) >= from).sort((a, b) => b.at.localeCompare(a.at));
	const totals = new Map();
	for (const o of orders) {
		if (!/^charged/.test(o.status) || !o.currency) continue;
		const t = totals.get(o.currency) ?? { currency: o.currency, orders: 0, charged: 0 };
		t.orders += 1;
		t.charged = Math.round((t.charged + o.charged) * 100) / 100;
		totals.set(o.currency, t);
	}
	return {
		generatedAt: now.toISOString(),
		from: new Date(from).toISOString(),
		orders,
		totals: [...totals.values()].sort((a, b) => b.charged - a.charged),
		errors,
	};
}
