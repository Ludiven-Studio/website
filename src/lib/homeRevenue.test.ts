import { describe, expect, it } from 'vitest';
import { revenueTile } from './homeRevenue';
import type { Purchase, Purchases, Rates, Revenue } from './statsAdmin';

const NOW = new Date('2026-11-24T10:30:00Z');
const RATES: Rates = { generatedAt: '', date: '2026-11-21', perEur: { EUR: 1, USD: 1.03 } };
const MONEY = {
	generatedAt: '', currency: 'USD', monthStart: '2026-11-01', from: '2026-10-26', to: '2026-11-24', apps: [],
	total: { month: 2.06, last30: 2.06, days: [], networks: [{ network: 'unityAds', name: 'Unity Ads', month: 2.06, last30: 2.06 }] },
} as unknown as Revenue;
const buy = (at: string, item: string, kind: Purchase['kind'] = 'real'): Purchase =>
	({ at, app: 'Pétanque Game', item, store: 'play', later: false, kind, buyer: null });
// Raphaël's three real purchases of November, a tester's, and one from October.
const SEEN: Purchases = {
	generatedAt: '', from: '', counted: 4, buyers: 4, errors: [],
	purchases: [
		buy('2026-11-23T12:03:00Z', 'coins_l'), buy('2026-11-22T21:33:00Z', 'premium'), buy('2026-11-19T12:37:00Z', 'coins_m'),
		buy('2026-11-21T10:00:00Z', 'coins_l', 'tester'), buy('2026-10-30T10:00:00Z', 'coins3'),
	],
};

describe('the Revenus tile on the admin home', () => {
	it('adds the ads in euros and the month’s real in-app purchases, net: 2 € + 12,37 € = 14,37 €', () => {
		const t = revenueTile({ money: MONEY, rates: RATES, seen: SEEN, now: NOW });
		expect(t.figure).toMatch(/^14,37\s€$/);
		expect(t.sub).toMatch(/^net ce mois · pub 2,06\s\$US dont Unity Ads 2,06\s\$US · achats ≈ 12,37\s€$/);
	});

	it('names what is missing and adds the rest', () => {
		const noRate = revenueTile({ money: MONEY, rates: null, seen: SEEN, now: NOW });
		expect(noRate.figure).toMatch(/^12,37\s€$/);
		expect(noRate.sub).toContain('(non convertie)');
		const noBuys = revenueTile({ money: MONEY, rates: RATES, seen: null, now: NOW });
		expect(noBuys.figure).toMatch(/^2,00\s€$/);
		expect(noBuys.sub).toContain('achats non relevés');
		expect(revenueTile({ money: null, rates: null, seen: null, now: NOW })).toEqual({});
		expect(revenueTile({ money: MONEY, rates: null, seen: null, now: NOW }).figure).toBeUndefined();
	});
});
