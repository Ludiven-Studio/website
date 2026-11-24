import { describe, expect, it } from 'vitest';
import { inAppLine, whyMissing } from './AdminHome';
import { StatsError, type PlayOrders } from '../../lib/statsAdmin';

const today = new Date().toISOString().slice(0, 10);
const ORDERS: PlayOrders = {
	generatedAt: '', from: '', errors: [], totals: [],
	orders: [{ at: `${today}T08:00:00Z`, app: 'Nino Rush', package: '', product: 'x', status: 'charged', currency: 'EUR', price: 10, charged: 12, country: 'FR' }],
};

describe('the in-app line on the Statistiques tile', () => {
	it('names each store that did not answer, and why, instead of vanishing', () => {
		expect(whyMissing(new StatsError(503, 'orders not configured'))).toBe('clé non posée');
		expect(whyMissing(new StatsError(400, 'unknown action'))).toBe('attend le redéploiement');
		expect(whyMissing(new Error('network'))).toBe("n'a pas répondu");
		expect(inAppLine({ orders: null, apple: null, rates: null, playWhy: 'clé non posée', appleWhy: 'clé non posée' }))
			.toBe('Achats intégrés : Google Play clé non posée · App Store clé non posée');
	});

	it('gives the total of the stores that answered, the other one named', () => {
		const line = inAppLine({ orders: ORDERS, apple: null, rates: null, playWhy: '', appleWhy: 'clé non posée' });
		expect(line).toMatch(/^Achats intégrés · 7 j : 8,50\s€ net \(12,00\s€ brut\) · App Store clé non posée$/);
	});

	it('shows 0 € rather than nothing on a week without sales', () => {
		const line = inAppLine({ orders: { ...ORDERS, orders: [] }, apple: { generatedAt: '', from: '', to: '', errors: [], sales: [] }, rates: null, playWhy: '', appleWhy: '' });
		expect(line).toMatch(/^Achats intégrés · 7 j : 0,00\s€ net \(0,00\s€ brut\)$/);
	});
});
