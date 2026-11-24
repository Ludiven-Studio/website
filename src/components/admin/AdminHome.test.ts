import { describe, expect, it } from 'vitest';
import { inAppLine, whyMissing } from './AdminHome';
import { StatsError, type Purchase, type Purchases } from '../../lib/statsAdmin';

const buy = (at: string, item: string, kind: Purchase['kind']): Purchase =>
	({ at, app: 'Pétanque Game', item, store: 'play', later: false, kind, buyer: null });
const NOW = new Date('2026-11-24T10:30:00Z');

describe('the in-app line on the Statistiques tile', () => {
	it('says 17,47 € for the three real purchases Raphaël saw on 24 Nov, testers and simulated left out', () => {
		const seen: Purchases = {
			generatedAt: '', from: '', counted: 3, buyers: 3, errors: [],
			purchases: [
				buy('2026-11-23T12:03:00Z', 'coins_l', 'real'), buy('2026-11-22T21:33:00Z', 'premium', 'real'),
				buy('2026-11-21T10:00:00Z', 'coins_l', 'tester'), buy('2026-11-20T18:00:00Z', 'hearts', 'dev'),
				buy('2026-11-19T12:37:00Z', 'coins_m', 'real'),
			],
		};
		expect(inAppLine(seen, '', NOW)).toMatch(/^Achats intégrés · 7 j : 17,47\s€ TTC, ≈ 12,37\s€ net \(3 achats\)$/);
	});

	it('shows 0 € on a week without purchases, and the reason when they did not come', () => {
		expect(inAppLine({ generatedAt: '', from: '', counted: 0, buyers: 0, errors: [], purchases: [] }, '', NOW))
			.toMatch(/^Achats intégrés · 7 j : 0,00\s€ TTC, ≈ 0,00\s€ net \(0 achat\)$/);
		expect(whyMissing(new StatsError(503, 'not configured'))).toBe('statistiques non branchées');
		expect(whyMissing(new StatsError(400, 'unknown action'))).toBe('attend le redéploiement');
		expect(inAppLine(null, whyMissing(new Error('network')), NOW)).toBe("Achats intégrés : n'ont pas répondu");
	});
});
