import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	balance, earn, buyBlason, owns, equipBlason, equippedBlason,
	dailyRewardAmount, rewardState, claimDailyReward,
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
