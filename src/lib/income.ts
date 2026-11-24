// The studio's income in euros, the one count behind /admin/revenus/ and the admin home's tiles: ads (LevelPlay, in
// US dollars), Google Play's and the App Store's in-app sales, each converted at the ECB's rate of the day.
// Net is what reaches the studio: LevelPlay's figure as it is (paid business to business, no VAT), Apple's proceeds,
// and for Google Play an estimate, the price before tax less Google's 15 %. Each store's own report is used when it
// answers; without it, the purchases its apps saw, at the catalogue price (`inAppFrom` says which).
import { APP_NAMES, appKey } from './appColors';
import { COUNTED_KINDS, type AppStoreSales, type PlayOrders, type Purchases, type Rates, type Revenue } from './statsAdmin';
import { NET_SHARE, cataloguePrice } from './inAppWeek';

export const PLAY_CUT = 0.15;
export const SOURCES = ['ads', 'play', 'appstore'] as const;
export type Source = (typeof SOURCES)[number];
/** `gross`: what was paid, in euros. For the ads, what LevelPlay pays, so the same as net. */
export interface Amount { net: number; gross: number }
export type InAppFrom = 'report' | 'apps' | null;
export interface IncomeApp { key: string; name: string; ads: number; play: number; appstore: number; total: number }
export interface Income {
	days: string[];
	monthStart: string;
	byDay: Record<Source, Map<string, number>>;
	month: Record<Source, Amount>;
	last30: Record<Source, Amount>;
	/** The last 7 of the 30 days, today included. */
	last7: Record<Source, Amount>;
	/** Net over 30 days, largest first. */
	apps: IncomeApp[];
	/** Currencies met without a rate: their amounts are left out. */
	unconverted: string[];
	/** The ads in their own currency, as LevelPlay gives them. */
	adsPaid: { currency: string; month: number; last30: number; last7: number } | null;
	/** Where each store's figures come from: its own report, the purchases its apps saw, or nowhere. */
	inAppFrom: { play: InAppFrom; appstore: InAppFrom };
}

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function appOf(...names: (string | undefined)[]): { key: string; name: string } {
	const key = appKey(...names);
	if (key) return { key, name: APP_NAMES[key] };
	const name = names.find(Boolean) ?? '?';
	return { key: plain(name) || '?', name };
}

/** The euros an amount in a currency is worth at the ECB's rate; null without a rate. */
export function toEur(amount: number, currency: string, rates: Pick<Rates, 'perEur'> | null): number | null {
	if (currency === 'EUR') return amount;
	const rate = rates?.perEur[currency];
	return rate ? amount / rate : null;
}

export function income({ revenue, orders, apple, seen = null, rates, now }: {
	revenue: Revenue | null; orders: PlayOrders | null; apple: AppStoreSales | null; seen?: Purchases | null; rates: Rates | null; now: Date;
}): Income {
	const to = revenue?.to ?? isoDay(now.getTime());
	const from = revenue?.from ?? isoDay(Date.parse(`${to}T00:00:00Z`) - 29 * DAY);
	const monthStart = `${to.slice(0, 8)}01`;
	const days: string[] = [];
	for (let t = Date.parse(`${from}T00:00:00Z`); isoDay(t) <= to; t += DAY) days.push(isoDay(t));
	const in30 = new Set(days);
	const in7 = new Set(days.slice(-7));
	const zero = (): Amount => ({ net: 0, gross: 0 });
	const out: Income = {
		days, monthStart,
		byDay: { ads: new Map(), play: new Map(), appstore: new Map() },
		month: { ads: zero(), play: zero(), appstore: zero() },
		last30: { ads: zero(), play: zero(), appstore: zero() },
		last7: { ads: zero(), play: zero(), appstore: zero() },
		apps: [],
		unconverted: [],
		adsPaid: null,
		inAppFrom: { play: orders ? 'report' : seen ? 'apps' : null, appstore: apple ? 'report' : seen ? 'apps' : null },
	};
	const apps = new Map<string, IncomeApp>();
	const missing = new Set<string>();

	function add(source: Source, date: string, app: { key: string; name: string }, net: number, netCurrency: string, gross: number, grossCurrency: string) {
		const n = toEur(net, netCurrency, rates);
		const g = toEur(gross, grossCurrency, rates);
		if (n === null) missing.add(netCurrency);
		if (g === null) missing.add(grossCurrency);
		if (n === null || g === null) return;
		if (date >= monthStart && date <= to) {
			out.month[source].net += n;
			out.month[source].gross += g;
		}
		if (!in30.has(date)) return;
		out.last30[source].net += n;
		out.last30[source].gross += g;
		if (in7.has(date)) {
			out.last7[source].net += n;
			out.last7[source].gross += g;
		}
		out.byDay[source].set(date, (out.byDay[source].get(date) ?? 0) + n);
		const a = apps.get(app.key) ?? { ...app, ads: 0, play: 0, appstore: 0, total: 0 };
		a[source] += n;
		a.total += n;
		apps.set(app.key, a);
	}

	for (const a of revenue?.apps ?? []) {
		const app = appOf(a.name);
		for (const d of a.days) if (d.revenue) add('ads', d.date, app, d.revenue, revenue!.currency, d.revenue, revenue!.currency);
	}
	// A store without its report: the purchases its apps saw, real ones, at the catalogue price in euros.
	for (const b of seen?.purchases ?? []) {
		const store = b.store === 'appstore' ? 'appstore' : 'play';
		if (out.inAppFrom[store] !== 'apps' || !COUNTED_KINDS.includes(b.kind)) continue;
		const price = cataloguePrice(b.item);
		if (price !== null) add(store, b.at.slice(0, 10), appOf(b.app), round(price * NET_SHARE), 'EUR', price, 'EUR');
	}
	for (const o of orders?.orders ?? []) {
		if (!/^charged/.test(o.status) || !o.currency) continue;
		add('play', o.at.slice(0, 10), appOf(o.app, o.package), o.price * (1 - PLAY_CUT), o.currency, o.charged, o.currency);
	}
	for (const s of apple?.sales ?? []) add('appstore', s.date, appOf(s.app), s.proceeds, s.currency, s.gross, s.grossCurrency);

	for (const src of SOURCES) {
		for (const period of [out.month, out.last30, out.last7]) period[src] = { net: round(period[src].net), gross: round(period[src].gross) };
		for (const [d, v] of out.byDay[src]) out.byDay[src].set(d, round(v));
	}
	out.apps = [...apps.values()]
		.map((a) => ({ ...a, ads: round(a.ads), play: round(a.play), appstore: round(a.appstore), total: round(a.total) }))
		.sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
	out.unconverted = [...missing].sort();
	/* The periods' ads from LevelPlay's own totals, as the Publicité block shows them: each app's days are rounded
	   to the cent, and their sum drifted a few cents from it. The days still draw the bars and the apps. */
	if (revenue) {
		const last7 = round(revenue.total.days.filter((d) => in7.has(d.date)).reduce((n, d) => n + d.revenue, 0));
		out.adsPaid = { currency: revenue.currency, month: revenue.total.month, last30: revenue.total.last30, last7 };
		for (const [period, usd] of [['month', revenue.total.month], ['last30', revenue.total.last30], ['last7', last7]] as const) {
			const e = toEur(usd, revenue.currency, rates);
			if (e !== null) out[period].ads = { net: round(e), gross: round(e) };
		}
	}
	return out;
}

/** A period's total, net, and what it is made of, in the words each part needs: « Pubs 1,88 € net (2,06 $US) ·
 *  Achats 12,37 € net (17,47 € payés, vus par les applis) ». The home and /admin/revenus/ both show it. */
export function periodLine(r: Income, period: 'month' | 'last30' | 'last7'): { total: number; parts: string } {
	const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
	const p = r[period];
	const buyNet = round(p.play.net + p.appstore.net), buyPaid = round(p.play.gross + p.appstore.gross);
	const paid = r.adsPaid;
	const ads = paid
		? `Pubs ${eur(p.ads.net)} net (${paid[period].toLocaleString('fr-FR', { style: 'currency', currency: paid.currency })})`
		: 'Pubs non relevées';
	const { play, appstore } = r.inAppFrom;
	const word = (f: InAppFrom) => (f === 'report' ? 'relevé du store' : f === 'apps' ? 'vus par les applis' : 'non relevé');
	const how = play === appstore ? (play === 'report' ? 'relevés des stores' : word(play)) : `Google Play ${word(play)}, App Store ${word(appstore)}`;
	const buys = !play && !appstore ? 'Achats non relevés' : `Achats ${eur(buyNet)} net (${eur(buyPaid)} payés, ${how})`;
	return { total: round(p.ads.net + buyNet), parts: `${ads} · ${buys}` };
}
