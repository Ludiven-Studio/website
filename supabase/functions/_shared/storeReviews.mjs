// The stores' ratings and reviews of the studio's apps, for /admin/avis/ (stats-admin's « reviews » action).
// - App Store: the public iTunes lookup (no key), one call per app and country: the average and the count of
//   ratings in each country. The written reviews need an App Store Connect key with the Customer Support role:
//   not read yet.
// - Google Play: the Play Console's exports in the developer's Cloud Storage bucket (the same service account as
//   playSales.mjs), reviews/reviews_<package>_<YYYYMM>.csv (every rating, its text and our reply) and
//   stats/ratings/ratings_<package>_<YYYYMM>_overview.csv (the average of the day and overall). The account needs
//   « View app information and download bulk reports » besides « View financial data »: without it, a 403.
// Plain JavaScript on fetch, so vitest runs it against fake stores and Deno serves it.
//
// The reviews' device model and reviewer language stay here: only the language leaves this module.

import { googleToken, parseCsv, readBucket, readKey } from './playSales.mjs';

export const REVIEWS_KEY = 'reviews';
export const REVIEWS_CACHE_MINUTES = 360;
export const REVIEWS_MAX = 300;
const DAY = 86_400_000;
const STORAGE = 'https://storage.googleapis.com/storage/v1';
const LOOKUP = 'https://itunes.apple.com/lookup';

/** The studio's apps in the stores; `app` is the admin pages' key (src/lib/appColors.ts). */
export const STORE_APPS = [
	{ app: 'petanque-game', name: 'Pétanque Game', package: 'com.ludivenstudio.petanquegame', bundle: 'com.ludivenstudio.petanquegame' },
	{ app: 'petanque-scan', name: 'Pétanque Scan', package: 'com.raphbenpro.petanquear', bundle: 'com.raphbenpro.petanquear' },
	{ app: 'petanque-meet', name: 'Pétanque Meet', package: 'com.ludivenstudio.petanquemeet', bundle: 'com.ludivenstudio.petanquemeet' },
	{ app: 'dragon-gems', name: "Dragon's Gems", package: 'com.ludivenstudio.dragonsgems', bundle: 'com.ludivenstudio.dragonsgems' },
	{ app: 'nino-rush', name: 'Nino Rush', package: 'com.ludivenstudio.ninorush', bundle: 'com.ludivenstudio.ninorush' },
];

/** The App Store countries read: the store languages' main markets. */
export const COUNTRIES = ['fr', 'be', 'ch', 'lu', 'ca', 'us', 'gb', 'ie', 'au', 'de', 'at', 'es', 'it', 'pt', 'nl'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : null);
const round2 = (n) => Math.round(n * 100) / 100;
const cell = (s, max) => String(s ?? '').trim().slice(0, max);

/** The weighted average of { average, count } parts; null without any rating. */
export function combine(parts) {
	const count = parts.reduce((n, p) => n + p.count, 0);
	return { average: count ? round2(parts.reduce((n, p) => n + p.average * p.count, 0) / count) : null, count };
}

/** One app of an iTunes lookup answer as a country's ratings, or null when the app is not sold there. */
export function readLookup(body, bundle, country) {
	const r = Array.isArray(body?.results) ? body.results.find((x) => x?.bundleId === bundle) : null;
	if (!r) return null;
	return {
		country,
		average: num(r.averageUserRating) ?? 0,
		count: num(r.userRatingCount) ?? 0,
		version: typeof r.version === 'string' ? r.version : '',
		url: typeof r.trackViewUrl === 'string' ? r.trackViewUrl.replace(/\?.*$/, '') : '',
	};
}

/** Each app's App Store ratings: per country, then all of them together. One lookup per country holds every
 *  app, one after the other: Apple allows about 20 calls a minute. */
export async function appStoreRatings(fetchFn, apps = STORE_APPS, countries = COUNTRIES) {
	const errors = [];
	const answers = [];
	const bundles = apps.map((a) => a.bundle).join(',');
	for (const c of countries) {
		try {
			const res = await fetchFn(`${LOOKUP}?bundleId=${encodeURIComponent(bundles)}&country=${c}`);
			if (!res.ok) throw new Error(String(res.status));
			answers.push([c, await res.json()]);
		} catch (e) {
			errors.push(`App Store (${c}) : ${String(e?.message ?? e).slice(0, 80)}`);
		}
	}
	const out = apps.map((a) => {
		const live = answers.map(([c, body]) => readLookup(body, a.bundle, c)).filter(Boolean);
		if (!live.length) return { app: a.app, store: 'appstore', live: false, average: null, count: 0, countries: [], version: '', url: '' };
		const fr = live.find((c) => c.country === 'fr') ?? live[0];
		const rated = live.filter((c) => c.count > 0).sort((x, y) => y.count - x.count || x.country.localeCompare(y.country));
		return {
			app: a.app, store: 'appstore', live: true, ...combine(rated),
			countries: rated.map((c) => ({ country: c.country, average: round2(c.average), count: c.count })),
			version: fr.version, url: fr.url.replace(/\/[a-z]{2}\/app\//, '/app/'),
		};
	});
	return { apps: out, errors };
}

/** A report file's text: UTF-16 with its BOM (Google's exports), or UTF-8. */
export function decodeReport(buf) {
	const b = new Uint8Array(buf);
	if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
	const text = new TextDecoder().decode(b);
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function columns(head) {
	const col = new Map(head.map((h, i) => [h.trim().toLowerCase(), i]));
	return (r, name) => (col.has(name) ? r[col.get(name)] : undefined);
}

const millis = (v, fallback) => {
	const t = num(v);
	if (t && t > 0) return new Date(t).toISOString();
	const p = Date.parse(String(fallback ?? '').trim());
	return Number.isFinite(p) ? new Date(p).toISOString() : null;
};

/** A reviews export's rows as reviews: stars, text, language, version, dates, our reply; no device. */
export function readPlayReviews(csvRows, app) {
	const [head, ...body] = csvRows;
	if (!head) return [];
	const get = columns(head);
	const out = [];
	for (const r of body) {
		const stars = num(get(r, 'star rating'));
		const at = millis(get(r, 'review last update millis since epoch'), get(r, 'review last update date and time'))
			?? millis(get(r, 'review submit millis since epoch'), get(r, 'review submit date and time'));
		if (!stars || stars < 1 || stars > 5 || !at) continue;
		const reply = cell(get(r, 'developer reply text'), 2000);
		out.push({
			app, store: 'play', stars, at,
			title: cell(get(r, 'review title'), 200),
			text: cell(get(r, 'review text'), 4000),
			lang: cell(get(r, 'reviewer language'), 10),
			version: cell(get(r, 'app version name'), 20),
			reply: reply || null,
			replyAt: reply ? millis(get(r, 'developer reply millis since epoch'), get(r, 'developer reply date and time')) : null,
			link: /^https:\/\/play\.google\.com\//.test(cell(get(r, 'review link'), 400)) ? cell(get(r, 'review link'), 400) : '',
		});
	}
	return out;
}

/** A ratings overview export's last day: the overall average (« Total Average Rating »). */
export function readPlayOverview(csvRows) {
	const [head, ...body] = csvRows;
	if (!head) return null;
	const get = columns(head);
	let last = null;
	for (const r of body) {
		const date = cell(get(r, 'date'), 10);
		const total = num(get(r, 'total average rating'));
		if (/^\d{4}-\d{2}-\d{2}$/.test(date) && total && (!last || date >= last.date)) last = { date, average: round2(total) };
	}
	return last;
}

/** Google Play's ratings and reviews from the bucket. status: ok, closed (403: the permission is missing), or the
 *  error. Every month of reviews the bucket holds is read, newest first, so the count is every rating since launch. */
export async function playRatings(env, fetchFn, now, apps = STORE_APPS) {
	const key = readKey(env.PLAY_REPORTS_KEY);
	const bucket = encodeURIComponent(readBucket(env.PLAY_REPORTS_BUCKET));
	const token = await googleToken(key, fetchFn, now);
	const auth = { headers: { Authorization: `Bearer ${token}` } };
	const list = async (prefix) => {
		const names = [];
		let page = '';
		for (let n = 0; n < 10; n++) {
			const res = await fetchFn(`${STORAGE}/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&fields=items(name),nextPageToken${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, auth);
			if (res.status === 401 || res.status === 403) return { closed: true, names };
			if (!res.ok) throw new Error(`Cloud Storage ${prefix}: ${res.status}`);
			const body = await res.json().catch(() => ({}));
			for (const it of body.items ?? []) if (typeof it?.name === 'string') names.push(it.name);
			if (!body.nextPageToken) break;
			page = body.nextPageToken;
		}
		return { closed: false, names };
	};
	const read = async (name) => {
		const res = await fetchFn(`${STORAGE}/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, auth);
		if (res.status === 401 || res.status === 403) throw Object.assign(new Error('closed'), { closed: true });
		if (!res.ok) throw new Error(`${name}: ${res.status}`);
		return parseCsv(decodeReport(await res.arrayBuffer()));
	};
	const [reviewFiles, ratingFiles] = await Promise.all([list('reviews/'), list('stats/ratings/')]);
	if (reviewFiles.closed && ratingFiles.closed) return { status: 'closed', apps: [], reviews: [], errors: [] };
	const errors = [];
	const reviews = [];
	const out = [];
	for (const a of apps) {
		const re = new RegExp(`^reviews/reviews_${a.package.replace(/\./g, '\\.')}_(\\d{6})\\.csv$`);
		const months = reviewFiles.names.filter((n) => re.test(n)).sort().reverse().slice(0, 36);
		const mine = [];
		for (const name of months) {
			try {
				mine.push(...readPlayReviews(await read(name), a.app));
			} catch (e) {
				if (e?.closed) return { status: 'closed', apps: [], reviews: [], errors: [] };
				errors.push(`Google Play ${a.name} : ${String(e?.message ?? e).slice(0, 120)}`);
			}
		}
		const ov = new RegExp(`^stats/ratings/ratings_${a.package.replace(/\./g, '\\.')}_(\\d{6})_overview\\.csv$`);
		const lastOverview = ratingFiles.names.filter((n) => ov.test(n)).sort().pop();
		let overview = null;
		if (lastOverview) {
			try {
				overview = readPlayOverview(await read(lastOverview));
			} catch (e) {
				if (!e?.closed) errors.push(`Google Play ${a.name} : ${String(e?.message ?? e).slice(0, 120)}`);
			}
		}
		reviews.push(...mine);
		const counted = combine(mine.map((r) => ({ average: r.stars, count: 1 })));
		const live = months.length > 0 || !!lastOverview;
		out.push({
			app: a.app, store: 'play', live,
			// Google's own overall average when the export has it, else the reviews' own.
			average: overview?.average ?? counted.average,
			count: mine.length,
			countries: [], version: '',
			url: live ? `https://play.google.com/store/apps/details?id=${a.package}` : '',
		});
	}
	return { status: 'ok', apps: out, reviews, errors };
}

/** The average and count of the reviews dated in the last `days` days. */
export function recent(reviews, now, days = 30) {
	const from = now.getTime() - days * DAY;
	return combine(reviews.filter((r) => Date.parse(r.at) >= from).map((r) => ({ average: r.stars, count: 1 })));
}

/** Both stores: each app's ratings per store, the reviews newest first, and what could not be read. */
export async function storeReviews(env, fetchFn, now) {
	const [apple, play] = await Promise.all([
		appStoreRatings(fetchFn),
		!env.PLAY_REPORTS_KEY || !env.PLAY_REPORTS_BUCKET
			? Promise.resolve({ status: 'unset', apps: [], reviews: [], errors: [] })
			: playRatings(env, fetchFn, now).catch((e) => ({ status: 'error', apps: [], reviews: [], errors: [`Google Play : ${String(e?.message ?? e).slice(0, 160)}`] })),
	]);
	const reviews = play.reviews.sort((a, b) => b.at.localeCompare(a.at));
	const apps = STORE_APPS.map((a) => {
		const mine = reviews.filter((r) => r.app === a.app);
		return {
			app: a.app, name: a.name,
			stores: [apple.apps.find((x) => x.app === a.app), play.apps.find((x) => x.app === a.app)].filter(Boolean),
			last30: recent(mine, now),
		};
	});
	return {
		generatedAt: now.toISOString(),
		play: play.status,
		apps,
		reviews: reviews.slice(0, REVIEWS_MAX),
		errors: [...apple.errors, ...play.errors],
	};
}
