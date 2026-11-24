import { describe, expect, it } from 'vitest';
import { cataloguePrice, inAppWeek } from './inAppWeek';
import type { Purchase, Purchases } from './statsAdmin';

const buy = (at: string, app: string, item: string, kind: Purchase['kind'], store = 'play'): Purchase =>
	({ at, app, item, store, later: false, kind, buyer: null });

// Raphaël's stats page on 24 Nov 2026: three real Google Play purchases and six hidden ones.
const SEEN: Purchases = {
	generatedAt: '', from: '2026-10-25', counted: 3, buyers: 3, errors: [],
	purchases: [
		buy('2026-11-23T12:03:00Z', 'Pétanque Game', 'coins_l', 'real'),
		buy('2026-11-22T21:33:00Z', 'Pétanque Scan', 'premium', 'real'),
		buy('2026-11-21T10:00:00Z', 'Pétanque Game', 'coins_l', 'tester'),
		buy('2026-11-21T09:00:00Z', 'Pétanque Game', 'coins_m', 'promo'),
		buy('2026-11-20T18:00:00Z', "Dragon's Gems", 'hearts', 'dev'),
		buy('2026-11-20T17:00:00Z', "Dragon's Gems", 'hearts', 'beta'),
		buy('2026-11-20T16:00:00Z', 'Nino Rush', 'no_ads', 'tester'),
		buy('2026-11-20T15:00:00Z', 'Nino Rush', 'no_ads', 'dev'),
		buy('2026-11-19T12:37:00Z', 'Pétanque Game', 'coins_m', 'real'),
		// Before the 7 days: out.
		buy('2026-11-10T12:00:00Z', 'Pétanque Game', 'coins3', 'real'),
	],
};

describe('the in-app week on the home tile', () => {
	it('reads the catalogue price, the first one written', () => {
		expect(cataloguePrice('coins_l')).toBe(4.99);
		expect(cataloguePrice('full')).toBe(4.99);
		expect(cataloguePrice('nope')).toBeNull();
	});

	it('sums the real purchases of the last 7 days: 4,99 + 9,99 + 2,49 = 17,47 €', () => {
		const w = inAppWeek(SEEN, new Date('2026-11-24T10:30:00Z'));
		expect(w).toEqual({ count: 3, gross: 17.47, net: 12.37, unpriced: 0 });
	});

	it('counts the App Store ones the receipt cannot check, and says when a product has no price', () => {
		const w = inAppWeek({ ...SEEN, purchases: [buy('2026-11-23T08:00:00Z', 'Nino Rush', 'no_ads', 'unchecked', 'appstore'), buy('2026-11-23T09:00:00Z', 'Nino Rush', 'mystery', 'real')] },
			new Date('2026-11-24T10:30:00Z'));
		expect(w).toEqual({ count: 2, gross: 2.99, net: 2.12, unpriced: 1 });
	});
});
