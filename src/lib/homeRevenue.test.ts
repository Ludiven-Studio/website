import { describe, expect, it } from 'vitest';
import { homeIncome, revenueTile, weekLine, type HomeMoney } from './homeRevenue';
import { income, periodLine, since } from './income';
import { NET_SHARE } from './inAppWeek';
import type { PlayOrders, Purchase, Purchases, Rates, Revenue } from './statsAdmin';

// Raphaël's November, 24 Nov 2026: 2,06 $ of ads (1,88 € on /admin/revenus/ at the ECB's 1,0957 $ for 1 €) and
// three real Google Play purchases the apps saw, with no store report answering.
const NOW = new Date('2026-11-24T10:30:00Z');
const RATES: Rates = { generatedAt: '', date: '2026-11-21', perEur: { EUR: 1, USD: 1.0957 } };
const days = () => {
	const out = [];
	for (let t = Date.parse('2026-10-26T00:00:00Z'); t <= Date.parse('2026-11-24T00:00:00Z'); t += 86_400_000) {
		const date = new Date(t).toISOString().slice(0, 10);
		out.push({ date, revenue: date === '2026-11-20' ? 1.5 : date === '2026-11-22' ? 0.56 : 0 });
	}
	return out;
};
const MONEY = {
	generatedAt: '', currency: 'USD', monthStart: '2026-11-01', from: '2026-10-26', to: '2026-11-24',
	total: { month: 2.06, last30: 2.06, days: [] },
	apps: [{ name: 'Pétanque Game', keys: [], platforms: [], month: 2.06, last30: 2.06, impressions30: 0, days: days() }],
} as unknown as Revenue;
const buy = (at: string, item: string, kind: Purchase['kind'] = 'real', store = 'play'): Purchase =>
	({ at, app: 'Pétanque Game', item, store, later: false, kind, buyer: null });
const SEEN: Purchases = {
	generatedAt: '', from: '', counted: 3, buyers: 3, errors: [],
	purchases: [
		buy('2026-11-23T12:03:00Z', 'coins_l'), buy('2026-11-22T21:33:00Z', 'premium'), buy('2026-11-19T12:37:00Z', 'coins_m'),
		buy('2026-11-21T10:00:00Z', 'coins_l', 'tester'), buy('2026-11-20T18:00:00Z', 'hearts', 'dev'),
	],
};
const NOVEMBER: HomeMoney = { money: MONEY, orders: null, apple: null, seen: SEEN, rates: RATES, now: NOW };
const nbsp = (s: string | undefined) => s?.replace(/\s/g, ' ');

describe('one count for the admin home and /admin/revenus/', () => {
	it('gives the same November on both: ads 1,88 € net (2,06 $), purchases 12,37 € net (17,47 € paid)', () => {
		const home = revenueTile(homeIncome(NOVEMBER));
		// The page calls the same function on the same answers.
		const page = periodLine(income({ revenue: MONEY, orders: null, apple: null, seen: SEEN, rates: RATES, now: NOW }), 'month');
		expect(page.total).toBe(14.25);
		expect(nbsp(home.figure)).toBe('14,25 €');
		expect(nbsp(page.sum)).toBe('Pubs 1,88 € + Achats 12,37 € = 14,25 € net');
		expect(page.paid.map(nbsp)).toEqual(['Pubs : 2,06 $US versés par LevelPlay', "Achats : 17,47 € payés, d'après les achats vus par les applis, pas les relevés Google/Apple"]);
		expect(nbsp(page.net)).toBe('net = payé − TVA (20 %) − commission du store (15 %) ; les pubs sont nettes telles quelles (ni TVA ni commission)');
		expect(home.lines.map(nbsp)).toEqual(['net depuis le 1er novembre', nbsp(page.sum), ...page.paid.map(nbsp), nbsp(page.net)]);
		expect(nbsp(weekLine(homeIncome(NOVEMBER), ''))).toBe('Achats intégrés des 7 derniers jours : 12,37 € net (17,47 € payés)');
	});

	it('counts net from the apps as paid less 20 % VAT then the store’s 15 %', () => {
		// The 7 days Raphaël saw on 26 Nov: 14,98 € paid, 10,61 € net.
		expect(Math.round(14.98 * NET_SHARE * 100) / 100).toBe(10.61);
		expect(Math.round(17.47 * NET_SHARE * 100) / 100).toBe(12.37);
	});

	it('writes the month it counts from', () => {
		expect(since('2026-11-01')).toBe('depuis le 1er novembre');
		expect(since('2027-02-01')).toBe('depuis le 1er février');
	});

	it('takes a store’s own report once it answers, and says so', () => {
		const orders: PlayOrders = {
			generatedAt: '', from: '', errors: [], totals: [],
			orders: [{ at: '2026-11-23T12:03:00Z', app: 'Pétanque Game', package: '', product: 'coins_l', status: 'charged', currency: 'EUR', price: 4.16, charged: 4.99, country: 'FR' }],
		};
		const r = homeIncome({ ...NOVEMBER, orders });
		expect(r.inAppFrom).toEqual({ play: 'report', appstore: 'apps' });
		// Play from its report only (4,16 € less 15 %), the App Store from the apps (none seen).
		expect(r.month.play).toEqual({ net: 3.54, gross: 4.99 });
		expect(nbsp(periodLine(r, 'month').paid.join(' '))).toContain("Google Play d'après son relevé, App Store d'après les achats vus par l'appli");
		const both = periodLine(homeIncome({ ...NOVEMBER, orders, apple: { generatedAt: '', from: '', errors: [], sales: [] } as never }), 'month');
		expect(nbsp(both.paid.join(' '))).toContain("d'après les relevés Google/Apple");
		expect(nbsp(both.net)).toContain("net = payé − TVA du pays de l'acheteur − commission du store");
	});

	it('names what did not come', () => {
		const none = homeIncome({ ...NOVEMBER, seen: null });
		expect(nbsp(periodLine(none, 'month').sum)).toBe('Pubs 1,88 € = 1,88 € net · achats non relevés');
		expect(revenueTile(none).lines).toContain('net = ce que LevelPlay verse (ni TVA ni commission)');
		expect(weekLine(none, 'statistiques non branchées')).toBe('Achats intégrés : statistiques non branchées');
		expect(revenueTile(homeIncome({ money: null, orders: null, apple: null, seen: null, rates: null, now: NOW }))).toEqual({ lines: [] });
	});
});
