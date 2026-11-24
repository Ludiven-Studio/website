import { describe, expect, it } from 'vitest';
import { whyMissing } from './AdminHome';
import { StatsError } from '../../lib/statsAdmin';

describe('why the purchases did not come', () => {
	it('says it in words', () => {
		expect(whyMissing(new StatsError(503, 'not configured'))).toBe('statistiques non branchées');
		expect(whyMissing(new StatsError(400, 'unknown action'))).toBe('attend le redéploiement');
		expect(whyMissing(new Error('network'))).toBe("n'ont pas répondu");
	});
});
