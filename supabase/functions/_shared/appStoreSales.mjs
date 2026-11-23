// The App Store's in-app sales per app and day, from App Store Connect's Sales and Trends reports (DAILY, SALES,
// SUMMARY, a gzipped TSV per day), read with a team API key that has the Sales or Finance role. Plain JavaScript
// on fetch and WebCrypto, so vitest runs it against a fake Apple and Deno serves it (stats-admin).
// Also the euro's reference rates of the European Central Bank, to show the studio's income in one currency.

export const APPSTORE_KEY = 'appstore';
export const APPSTORE_CACHE_MINUTES = 60;
export const RATES_KEY = 'rates';
export const RATES_CACHE_MINUTES = 12 * 60;
export const ASC_API = 'https://api.appstoreconnect.apple.com/v1/salesReports';
export const ECB_RATES = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const DAY = 86_400_000;
const PARALLEL = 6;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64url = (s) => b64url(new TextEncoder().encode(s));
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/** A short-lived App Store Connect token: an ES256 JWT signed with the .p8 key (WebCrypto signs ECDSA in the raw
 *  r||s form JWT wants). */
export async function ascToken(env, now) {
	const pem = String(env.ASC_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
	const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
	const signer = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	const iat = Math.floor(now.getTime() / 1000);
	const unsigned = `${text64url(JSON.stringify({ alg: 'ES256', kid: String(env.ASC_KEY_ID).trim(), typ: 'JWT' }))}.${text64url(JSON.stringify({ iss: String(env.ASC_ISSUER_ID).trim(), iat, exp: iat + 1200, aud: 'appstoreconnect-v1' }))}`;
	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, new TextEncoder().encode(unsigned));
	return `${unsigned}.${b64url(sig)}`;
}

/** A gzip body as text. */
export async function gunzip(buf) {
	return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

const num = (s) => {
	const n = Number(String(s ?? '').trim());
	return Number.isFinite(n) ? n : 0;
};
const cell = (s, max = 80) => String(s ?? '').trim().slice(0, max);

/** A Sales SUMMARY report's rows: per unit amounts multiplied by the units (negative for a refund). */
export function readSalesTsv(text) {
	const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim());
	if (!lines.length) return [];
	const head = lines[0].split('\t').map((h) => h.trim().toLowerCase());
	const col = (name) => head.indexOf(name);
	const at = { sku: col('sku'), title: col('title'), type: col('product type identifier'), units: col('units'), proceeds: col('developer proceeds'), begin: col('begin date'), proceedsCurrency: col('currency of proceeds'), price: col('customer price'), customerCurrency: col('customer currency'), parent: col('parent identifier') };
	return lines.slice(1).map((line) => {
		const r = line.split('\t');
		const units = num(r[at.units]);
		// MM/DD/YYYY in the report.
		const [m, d, y] = cell(r[at.begin], 10).split('/');
		return {
			date: y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '',
			sku: cell(r[at.sku]),
			title: cell(r[at.title]),
			type: cell(r[at.type], 10).toUpperCase(),
			parent: cell(r[at.parent]),
			units,
			proceeds: Math.round(num(r[at.proceeds]) * units * 100) / 100,
			currency: cell(r[at.proceedsCurrency], 3).toUpperCase(),
			gross: Math.round(num(r[at.price]) * units * 100) / 100,
			grossCurrency: cell(r[at.customerCurrency], 3).toUpperCase(),
		};
	});
}

/** An in-app purchase row (IA…, FI…, or any row with a parent app), not an app download. */
export const isInApp = (row) => /^(IA|FI)/.test(row.type) || !!row.parent;

/** The report's days: from the earlier of the month's first day and 29 days ago, to yesterday (today has none yet). */
export function appStoreDays(now) {
	const today = isoDay(now);
	const monthStart = `${today.slice(0, 8)}01`;
	const from30 = isoDay(now.getTime() - 29 * DAY);
	const days = [];
	for (let t = Date.parse(`${from30 < monthStart ? from30 : monthStart}T00:00:00Z`); isoDay(t) < today; t += DAY) days.push(isoDay(t));
	return days;
}

/** The in-app sales of the reports' rows, per day, app and currency; the app's name comes from its own download
 *  rows when the report has some, else from its SKU. */
export function appStoreSummary(rows, now) {
	const names = new Map(rows.filter((r) => !isInApp(r) && r.sku && r.title).map((r) => [r.sku, r.title]));
	const sales = new Map();
	for (const r of rows.filter(isInApp)) {
		if (!r.date) continue;
		const app = names.get(r.parent) ?? (r.parent || r.title);
		const key = `${r.date}|${app}|${r.currency}|${r.grossCurrency}`;
		const s = sales.get(key) ?? { date: r.date, app, units: 0, proceeds: 0, currency: r.currency, gross: 0, grossCurrency: r.grossCurrency };
		s.units += r.units;
		s.proceeds = Math.round((s.proceeds + r.proceeds) * 100) / 100;
		s.gross = Math.round((s.gross + r.gross) * 100) / 100;
		sales.set(key, s);
	}
	return { generatedAt: now.toISOString(), sales: [...sales.values()].sort((a, b) => a.date.localeCompare(b.date) || a.app.localeCompare(b.app)) };
}

/** Every day's report, a few at a time; a day with no sale answers 404. */
export async function appStoreSales(env, fetchFn, now) {
	const token = await ascToken(env, now);
	const days = appStoreDays(now);
	const rows = [];
	const errors = [];
	for (let i = 0; i < days.length; i += PARALLEL) {
		await Promise.all(days.slice(i, i + PARALLEL).map(async (day) => {
			const q = new URLSearchParams({
				'filter[frequency]': 'DAILY', 'filter[reportDate]': day, 'filter[reportSubType]': 'SUMMARY',
				'filter[reportType]': 'SALES', 'filter[vendorNumber]': String(env.ASC_VENDOR_NUMBER).trim(), 'filter[version]': '1_0',
			});
			const res = await fetchFn(`${ASC_API}?${q}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' } });
			if (res.status === 404) return;
			if (res.status === 401 || res.status === 403) throw new Error(`App Store Connect: ${res.status}`);
			if (!res.ok) {
				errors.push(`${day} : ${res.status}`);
				return;
			}
			try {
				rows.push(...readSalesTsv(await gunzip(await res.arrayBuffer())));
			} catch (e) {
				errors.push(`${day} : ${String(e?.message ?? e).slice(0, 120)}`);
			}
		}));
	}
	return { ...appStoreSummary(rows, now), from: days[0], to: days[days.length - 1], errors };
}

/** The ECB's reference rates: how much of each currency one euro buys, on the day they give. */
export function readEcbRates(xml) {
	const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1] ?? '';
	const perEur = { EUR: 1 };
	for (const m of String(xml).matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEur[m[1]] = Number(m[2]);
	return { date, perEur };
}

export async function ecbRates(fetchFn, now) {
	const res = await fetchFn(ECB_RATES);
	if (!res.ok) throw new Error(`ECB: ${res.status}`);
	const rates = readEcbRates(await res.text());
	if (!rates.date || !rates.perEur.USD) throw new Error('ECB: no rates in the answer');
	return { generatedAt: now.toISOString(), ...rates };
}
