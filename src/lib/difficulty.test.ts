import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { diffKeys, withExpert } from './difficulty';
import { earn, buyUnlock, resetWalletCache } from './wallet';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

const DIFFS = { facile: 1, moyen: 2, difficile: 3, expert: 4 };
const ORDER = ['facile', 'moyen', 'difficile'] as const;

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('difficulty gating', () => {
	it('hides expert until the pack is bought', () => {
		expect(diffKeys(DIFFS, 'sudoku')).toEqual(['facile', 'moyen', 'difficile']);
		expect(withExpert(ORDER, 'sudoku')).toEqual(['facile', 'moyen', 'difficile']);
		earn(200);
		buyUnlock('sudoku');
		expect(diffKeys(DIFFS, 'sudoku')).toEqual(['facile', 'moyen', 'difficile', 'expert']);
		expect(withExpert(ORDER, 'sudoku')).toEqual(['facile', 'moyen', 'difficile', 'expert']);
	});

	it('gates per game', () => {
		earn(200);
		buyUnlock('sudoku');
		expect(diffKeys(DIFFS, 'tectonique')).toHaveLength(3);
	});
});
