import { describe, expect, it } from 'vitest';
import { income, toEur } from './income';
import type { AppStoreSales, PlayOrders, Rates, Revenue } from './statsAdmin';

const NOW = new Date('2026-11-23T15:00:00Z');
const RATES: Rates = { generatedAt: '', date: '2026-11-21', perEur: { EUR: 1, USD: 1.25, CHF: 0.5 } };

function revenue(): Revenue {
	const days = (pairs: [string, number][]) => {
		const out = [];
		for (let t = Date.parse('2026-10-25T00:00:00Z'); t <= Date.parse('2026-11-23T00:00:00Z'); t += 86_400_000) {
			const date = new Date(t).toISOString().slice(0, 10);
			out.push({ date, revenue: pairs.find(([d]) => d === date)?.[1] ?? 0 });
		}
		return out;
	};
	return {
		generatedAt: '', currency: 'USD', monthStart: '2026-11-01', from: '2026-10-25', to: '2026-11-23',
		total: { month: 0, last30: 0, days: [] },
		apps: [
			{ name: 'Pétanque Game', keys: [], platforms: [], month: 0, last30: 0, impressions30: 0, days: days([['2026-11-20', 2.5], ['2026-10-30', 1.25]]) },
			{ name: "Dragon's Gems", keys: [], platforms: [], month: 0, last30: 0, impressions30: 0, days: days([['2026-11-21', 1.25]]) },
		],
	};
}

const order = (at: string, app: string, price: number, charged: number, currency = 'EUR', status = 'charged') =>
	({ at: `${at}T10:00:00Z`, app, package: '', product: 'x', status, currency, price, charged, country: 'FR' });
const ORDERS: PlayOrders = {
	generatedAt: '', from: '', errors: [], totals: [],
	orders: [
		order('2026-11-20', 'Pétanque Game: boules', 10, 12),
		order('2026-11-19', 'Nino Rush', 4, 5, 'CHF'),
		order('2026-11-18', 'Pétanque Game: boules', 10, 12, 'EUR', 'refund'),
		// Before the 30 days: out of everything.
		order('2026-10-01', 'Pétanque Game: boules', 10, 12),
	],
};
const APPLE: AppStoreSales = {
	generatedAt: '', from: '2026-10-25', to: '2026-11-22', errors: [],
	sales: [
		{ date: '2026-11-22', app: 'Pétanque Scan', units: 1, proceeds: 7, currency: 'EUR', gross: 9.99, grossCurrency: 'EUR' },
		{ date: '2026-10-28', app: 'Pétanque Game', units: 1, proceeds: 2.5, currency: 'USD', gross: 3.75, grossCurrency: 'USD' },
		{ date: '2026-11-02', app: 'Dragon Gems', units: 1, proceeds: 1, currency: 'JPY', gross: 1, grossCurrency: 'JPY' },
	],
};

describe('the studio income in euros', () => {
	it('converts at the ECB rate, euros as they are, nothing without a rate', () => {
		expect(toEur(5, 'EUR', null)).toBe(5);
		expect(toEur(5, 'USD', RATES)).toBe(4);
		expect(toEur(5, 'JPY', RATES)).toBeNull();
		expect(toEur(5, 'USD', null)).toBeNull();
	});

	it('adds ads, Google Play (net estimated at 85 % of the price before tax) and the App Store per period', () => {
		const r = income({ revenue: revenue(), orders: ORDERS, apple: APPLE, rates: RATES, now: NOW });
		expect([r.days[0], r.days[r.days.length - 1], r.monthStart]).toEqual(['2026-10-25', '2026-11-23', '2026-11-01']);
		// Ads: 2.5 $ + 1.25 $ in November = 3 €, plus 1.25 $ in October = 4 € over 30 days.
		expect(r.month.ads).toEqual({ net: 3, gross: 3 });
		expect(r.last30.ads).toEqual({ net: 4, gross: 4 });
		// Play: 10 € × 0.85 and 4 CHF × 0.85 = 6.8 €; gross 12 € + 5 CHF = 22 €; the refund and the old order left out.
		expect(r.month.play).toEqual({ net: 15.3, gross: 22 });
		expect(r.last30.play).toEqual(r.month.play);
		// App Store: 7 € in November, 2.5 $ = 2 € in October; JPY has no rate.
		expect(r.month.appstore).toEqual({ net: 7, gross: 9.99 });
		expect(r.last30.appstore).toEqual({ net: 9, gross: 12.99 });
		expect(r.unconverted).toEqual(['JPY']);
	});

	it('sums the last 7 days, today included, for the home tile', () => {
		const r = income({ revenue: revenue(), orders: ORDERS, apple: APPLE, rates: RATES, now: NOW });
		// 17-23 Nov: every November item above, nothing from 2 Nov or October.
		expect(r.last7.ads).toEqual({ net: 3, gross: 3 });
		expect(r.last7.play).toEqual({ net: 15.3, gross: 22 });
		expect(r.last7.appstore).toEqual({ net: 7, gross: 9.99 });
	});

	it('gives each day its net per source and each app its 30 days, under one name per app', () => {
		const r = income({ revenue: revenue(), orders: ORDERS, apple: APPLE, rates: RATES, now: NOW });
		expect(r.byDay.ads.get('2026-11-20')).toBe(2);
		expect(r.byDay.play.get('2026-11-20')).toBe(8.5);
		expect(r.byDay.appstore.get('2026-11-22')).toBe(7);
		expect(r.apps.map((a) => [a.name, a.ads, a.play, a.appstore, a.total])).toEqual([
			['Pétanque Game', 3, 8.5, 2, 13.5],
			['Pétanque Scan', 0, 0, 7, 7],
			['Nino Rush', 0, 6.8, 0, 6.8],
			["Dragon's Gems", 1, 0, 0, 1],
		]);
	});

	it('works with only some sources, and on its own 30 days when the ads are missing', () => {
		const r = income({ revenue: null, orders: ORDERS, apple: null, rates: null, now: NOW });
		expect([r.days[0], r.days.length]).toEqual(['2026-10-25', 30]);
		expect(r.month.play).toEqual({ net: 8.5, gross: 12 });
		expect(r.month.ads).toEqual({ net: 0, gross: 0 });
		expect(r.unconverted).toEqual(['CHF']);
	});
});
