import { describe, expect, it } from 'vitest';
import { homeIncome, revenueTile, weekLine, type HomeMoney } from './homeRevenue';
import { income, periodLine } from './income';
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
		expect(nbsp(page.parts)).toBe('Pubs 1,88 € net (2,06 $US) · Achats 12,37 € net (17,47 € payés, vus par les applis)');
		expect(nbsp(home.sub)).toBe(`net ce mois · ${nbsp(page.parts)}`);
		expect(nbsp(weekLine(homeIncome(NOVEMBER), ''))).toBe('Achats intégrés · 7 j : 12,37 € net (17,47 € payés)');
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
		expect(nbsp(periodLine(r, 'month').parts)).toContain('Google Play relevé du store, App Store vus par les applis');
	});

	it('names what did not come', () => {
		const none = homeIncome({ ...NOVEMBER, seen: null });
		expect(revenueTile(none).sub).toContain('Achats non relevés');
		expect(weekLine(none, 'statistiques non branchées')).toBe('Achats intégrés : statistiques non branchées');
		expect(revenueTile(homeIncome({ money: null, orders: null, apple: null, seen: null, rates: null, now: NOW }))).toEqual({});
	});
});
