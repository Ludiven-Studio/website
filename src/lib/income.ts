// The studio's income on /admin/revenus/, in euros: ads (LevelPlay, in US dollars), Google Play's in-app sales (its
// sales report, in the buyers' currencies) and the App Store's (Apple's Sales reports), each converted at the ECB's
// rate of the day. Net is what reaches the studio: LevelPlay's figure as it is, Apple's proceeds, and for Google
// Play an estimate, the price before tax less Google's 15 %, since only its monthly earnings report has the real one.
import { APP_NAMES, appKey } from './appColors';
import type { AppStoreSales, PlayOrders, Rates, Revenue } from './statsAdmin';

export const PLAY_CUT = 0.15;
export const SOURCES = ['ads', 'play', 'appstore'] as const;
export type Source = (typeof SOURCES)[number];
export interface Amount { net: number; gross: number }
export interface IncomeApp { key: string; name: string; ads: number; play: number; appstore: number; total: number }
export interface Income {
	days: string[];
	monthStart: string;
	byDay: Record<Source, Map<string, number>>;
	month: Record<Source, Amount>;
	last30: Record<Source, Amount>;
	/** Net over 30 days, largest first. */
	apps: IncomeApp[];
	/** Currencies met without a rate: their amounts are left out. */
	unconverted: string[];
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

export function income({ revenue, orders, apple, rates, now }: { revenue: Revenue | null; orders: PlayOrders | null; apple: AppStoreSales | null; rates: Rates | null; now: Date }): Income {
	const to = revenue?.to ?? isoDay(now.getTime());
	const from = revenue?.from ?? isoDay(Date.parse(`${to}T00:00:00Z`) - 29 * DAY);
	const monthStart = `${to.slice(0, 8)}01`;
	const days: string[] = [];
	for (let t = Date.parse(`${from}T00:00:00Z`); isoDay(t) <= to; t += DAY) days.push(isoDay(t));
	const in30 = new Set(days);
	const zero = (): Amount => ({ net: 0, gross: 0 });
	const out: Income = {
		days, monthStart,
		byDay: { ads: new Map(), play: new Map(), appstore: new Map() },
		month: { ads: zero(), play: zero(), appstore: zero() },
		last30: { ads: zero(), play: zero(), appstore: zero() },
		apps: [],
		unconverted: [],
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
	for (const o of orders?.orders ?? []) {
		if (!/^charged/.test(o.status) || !o.currency) continue;
		add('play', o.at.slice(0, 10), appOf(o.app, o.package), o.price * (1 - PLAY_CUT), o.currency, o.charged, o.currency);
	}
	for (const s of apple?.sales ?? []) add('appstore', s.date, appOf(s.app), s.proceeds, s.currency, s.gross, s.grossCurrency);

	for (const src of SOURCES) {
		for (const period of [out.month, out.last30]) period[src] = { net: round(period[src].net), gross: round(period[src].gross) };
		for (const [d, v] of out.byDay[src]) out.byDay[src].set(d, round(v));
	}
	out.apps = [...apps.values()]
		.map((a) => ({ ...a, ads: round(a.ads), play: round(a.play), appstore: round(a.appstore), total: round(a.total) }))
		.sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
	out.unconverted = [...missing].sort();
	return out;
}
