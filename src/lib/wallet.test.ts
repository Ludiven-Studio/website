import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	balance, earn, buyBlason, owns, equipBlason, equippedBlason, ownedBlasons,
	dailyRewardAmount, rewardState, claimDailyReward,
	buyUnlock, hasUnlock, unlockedGames, unlockId, resetWalletCache,
	BLASONS, UNLOCK_PRICE,
} from './wallet';
import { recordDayActivity } from './streak';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

const setDay = (iso: string): void => {
	vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
};

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache(); // the module caches its parse — the stub above is a brand new store
	vi.useFakeTimers();
	setDay('2026-03-10');
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('wallet', () => {
	it('earns then spends on a blason', () => {
		earn(50);
		expect(balance()).toBe(50);
		expect(buyBlason('etoile')).toBe(true); // 25
		expect(balance()).toBe(25);
		expect(owns('etoile')).toBe(true);
	});

	it('refuses an unaffordable buy', () => {
		earn(10);
		expect(buyBlason('couronne')).toBe(false); // 220
		expect(balance()).toBe(10);
		expect(owns('couronne')).toBe(false);
	});

	it('only equips owned blasons', () => {
		equipBlason('etoile');
		expect(equippedBlason()).toBeNull();
		earn(25); buyBlason('etoile'); equipBlason('etoile');
		expect(equippedBlason()?.id).toBe('etoile');
	});

	it('escalates the daily reward, capped', () => {
		expect(dailyRewardAmount(1)).toBe(5);
		expect(dailyRewardAmount(2)).toBe(8);
		expect(dailyRewardAmount(3)).toBe(11);
		expect(dailyRewardAmount(20)).toBe(25);
	});

	it('needs playing today and claims once', () => {
		expect(rewardState().canClaim).toBe(false); // not played
		recordDayActivity();
		const st = rewardState();
		expect(st.canClaim).toBe(true);
		expect(st.amount).toBe(5);
		expect(claimDailyReward()).toBe(5);
		expect(balance()).toBe(5);
		expect(rewardState().canClaim).toBe(false); // already claimed today
		expect(claimDailyReward()).toBe(0);
	});

	it('grows the reward on consecutive days', () => {
		recordDayActivity();
		claimDailyReward(); // day 1 → +5
		setDay('2026-03-11');
		recordDayActivity();
		expect(rewardState().amount).toBe(8); // day 2
		expect(claimDailyReward()).toBe(8);
		expect(balance()).toBe(13);
	});
});

describe('expert packs', () => {
	it('charges the price once', () => {
		earn(UNLOCK_PRICE - 1);
		expect(buyUnlock('sudoku')).toBe(false);
		expect(hasUnlock('sudoku')).toBe(false);
		earn(1);
		expect(buyUnlock('sudoku')).toBe(true);
		expect(balance()).toBe(0);
		expect(buyUnlock('sudoku')).toBe(true); // already owned — free
		expect(balance()).toBe(0);
		expect(unlockedGames()).toEqual(['sudoku']);
	});

	it('keeps unlocks out of the blason catalogue', () => {
		earn(UNLOCK_PRICE);
		buyUnlock('sudoku');
		expect(ownedBlasons().map((b) => b.id)).toEqual(['cocotte']);
		equipBlason(unlockId('sudoku'));
		expect(equippedBlason()).toBeNull();
	});
});

describe('blason catalogue', () => {
	it('has unique ids and rising prices', () => {
		expect(new Set(BLASONS.map((b) => b.id)).size).toBe(BLASONS.length);
		for (let i = 1; i < BLASONS.length; i++) expect(BLASONS[i].price).toBeGreaterThan(BLASONS[i - 1].price);
	});

	it('offers a legendary tier well past the common one', () => {
		const legend = BLASONS.filter((b) => b.tier === 'legendaire');
		expect(legend.length).toBeGreaterThanOrEqual(5);
		const commonMax = Math.max(...BLASONS.filter((b) => b.tier !== 'legendaire').map((b) => b.price));
		expect(Math.min(...legend.map((b) => b.price))).toBeGreaterThan(commonMax);
	});
});
