import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	balance, earn, buyBlason, owns, equipBlason, equippedBlason, ownedBlasons,
	dailyRewardAmount, rewardState, claimDailyReward,
	buyUnlock, hasUnlock, unlockedGames, unlockId, resetWalletCache, earnOnce, spend, buyOwned, buyCar,
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

	it('earnOnce pays a keyed gift a single time, even after the cache is dropped (another tab)', () => {
		expect(earnOnce('atelier:morel-3', 10)).toBe(true);
		resetWalletCache();
		expect(earnOnce('atelier:morel-3', 10)).toBe(false);
		expect(balance()).toBe(10);
		expect(ownedBlasons().map((b) => b.id)).toEqual(['cocotte']); // the key is not a blason
	});

	it('spend refuses more than the balance', () => {
		earn(5);
		expect(spend(10)).toBe(false);
		expect(spend(5)).toBe(true);
		expect(balance()).toBe(0);
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

describe('items a game names', () => {
	it('charges the price once and keeps the key out of the blasons', () => {
		earn(40);
		expect(buyOwned('petanque:boule_cuivre', 50)).toBe(false);
		expect(owns('petanque:boule_cuivre')).toBe(false);
		expect(buyOwned('petanque:boule_cuivre', 40)).toBe(true);
		expect(balance()).toBe(0);
		expect(buyOwned('petanque:boule_cuivre', 40)).toBe(true); // already owned: free
		expect(balance()).toBe(0);
		expect(ownedBlasons().map((b) => b.id)).toEqual(['cocotte']);
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

/* Two tabs share one localStorage. The other tab's write lands before its storage event reaches
   this one, so this tab's cache is stale: a change must start from the stored copy. */
describe('another tab wrote a moment ago', () => {
	const otherTab = (change: (w: Record<string, unknown>) => void): void => {
		const w = JSON.parse(localStorage.getItem('ludiven-cocottes') ?? '{}') as Record<string, unknown>;
		change(w);
		localStorage.setItem('ludiven-cocottes', JSON.stringify(w));
	};

	it('keeps its gain when this tab earns too', () => {
		earn(100);
		expect(balance()).toBe(100); // cached here
		otherTab((w) => { w.balance = Number(w.balance) + 40; });
		expect(earn(10)).toBe(150);
	});

	it('keeps its purchase when this tab buys too', () => {
		earn(500);
		otherTab((w) => { w.owned = [...(w.owned as string[]), 'expert:sudoku']; w.balance = Number(w.balance) - 200; });
		expect(spend(50)).toBe(true);
		expect(balance()).toBe(250);
		expect(hasUnlock('sudoku')).toBe(true);
	});

	it('does not pay the daily reward twice', () => {
		recordDayActivity();
		expect(rewardState().canClaim).toBe(true); // read here before the other tab claims
		otherTab((w) => { w.lastReward = '2026-03-10'; w.balance = Number(w.balance ?? 0) + 5; });
		expect(claimDailyReward()).toBe(0);
		expect(balance()).toBe(5);
	});
});

/* Amounts a buggy game could pass. A NaN or an Infinity written into the wallet comes back from JSON as
   null, which reads as 0: the whole balance would be gone. */
describe('hostile amounts never touch the balance', () => {
	beforeEach(() => { earn(100); });

	it.each([NaN, Infinity, -Infinity, -5, 0])('earn(%s) adds nothing', (x) => {
		earn(x);
		resetWalletCache();
		expect(balance()).toBe(100);
	});

	it.each([NaN, Infinity, -5, 0])('spend(%s) is refused', (x) => {
		expect(spend(x)).toBe(false);
		resetWalletCache();
		expect(balance()).toBe(100);
	});

	it.each([NaN, Infinity, -5])('buyOwned at %s is refused', (x) => {
		expect(buyOwned('car:x', x)).toBe(false);
		resetWalletCache();
		expect(balance()).toBe(100);
	});

	it.each([NaN, Infinity, -5, 0])('earnOnce(%s) pays nothing and can still pay later', (x) => {
		expect(earnOnce('gift', x)).toBe(false);
		resetWalletCache();
		expect(balance()).toBe(100);
		expect(earnOnce('gift', 20)).toBe(true);
		expect(balance()).toBe(120);
	});
});

/* What a player, an old version or a full disk could leave in storage. */
describe('a tampered or broken wallet in storage', () => {
	const stored = (raw: string): void => { localStorage.setItem('ludiven-cocottes', raw); resetWalletCache(); };

	it.each(['{', 'null', '[]', '"cocoins"', '42', ''])('%j reads as an empty wallet', (raw) => {
		stored(raw);
		expect(balance()).toBe(0);
		expect(owns('cocotte')).toBe(true);
	});

	it.each([
		['"Infinity"', 0],
		['-500', 0],
		['"abc"', 0],
		['null', 0],
		['"250"', 250],
		['12.5', 12.5],
	])('a balance of %s reads as %s', (b, want) => {
		stored(`{"balance":${b},"owned":["cocotte"]}`);
		expect(balance()).toBe(want);
	});

	it('ignores an equipped blason the player does not own', () => {
		stored(JSON.stringify({ balance: 0, owned: ['cocotte'], equipped: BLASONS[BLASONS.length - 1].id }));
		expect(equippedBlason()).toBeNull();
	});

	it('survives an owned list that is not a list of names', () => {
		stored('{"balance":10,"owned":"expert:sudoku"}');
		expect(hasUnlock('sudoku')).toBe(false);
		expect(earn(5)).toBe(15);
		stored('{"balance":10,"owned":[1,null,{"a":1},"expert:sudoku"]}');
		expect(hasUnlock('sudoku')).toBe(true);
		expect(() => ownedBlasons()).not.toThrow();
	});
});

describe('a car at a broken price', () => {
	it.each([NaN, Infinity, -5])('buyCar at %s is refused and keeps the balance', (x) => {
		earn(100);
		expect(buyCar('bolide-x', x)).toBe(false);
		resetWalletCache();
		expect(balance()).toBe(100);
	});
});
