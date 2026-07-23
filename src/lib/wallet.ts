// Local "cocottes" currency: a balance, an escalating daily-return reward, and
// cosmetic blasons you can buy + equip. All device-local (localStorage), no signup —
// casually cheatable, but it only buys vanity, so that's fine. See [[currency-cocottes]].

import { activityStreak } from './streak';

const KEY = 'ludiven-cocottes';

export interface Blason {
	id: string;
	emoji: string;
	label: string;
	price: number; // in cocottes
}

// Shop catalog (prices escalate). 'cocotte' is the free starter, owned by default.
export const BLASONS: Blason[] = [
	{ id: 'cocotte', emoji: '🐔', label: 'Cocotte', price: 0 },
	{ id: 'trefle', emoji: '🍀', label: 'Trèfle', price: 15 },
	{ id: 'etoile', emoji: '⭐', label: 'Étoile', price: 25 },
	{ id: 'flamme', emoji: '🔥', label: 'Flamme', price: 40 },
	{ id: 'eclair', emoji: '⚡', label: 'Éclair', price: 55 },
	{ id: 'fusee', emoji: '🚀', label: 'Fusée', price: 70 },
	{ id: 'arc', emoji: '🌈', label: 'Arc-en-ciel', price: 90 },
	{ id: 'diamant', emoji: '💎', label: 'Diamant', price: 120 },
	{ id: 'trophee', emoji: '🏆', label: 'Trophée', price: 160 },
	{ id: 'couronne', emoji: '👑', label: 'Couronne', price: 220 },
];

interface WalletData {
	balance: number;
	owned: string[];
	equipped: string | null;
	lastReward: string; // UTC day of the last claimed daily reward
}

const empty = (): WalletData => ({ balance: 0, owned: ['cocotte'], equipped: null, lastReward: '' });

const utcDay = (): string => new Date().toISOString().slice(0, 10);

function read(): WalletData {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return empty();
		const w = JSON.parse(raw) as Partial<WalletData>;
		const owned = Array.isArray(w.owned) && w.owned.length ? w.owned : ['cocotte'];
		return {
			balance: Number(w.balance) || 0,
			owned,
			equipped: typeof w.equipped === 'string' && owned.includes(w.equipped) ? w.equipped : null,
			lastReward: String(w.lastReward || ''),
		};
	} catch {
		return empty();
	}
}

function write(w: WalletData): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(w));
	} catch {
		/* storage unavailable */
	}
}

export const balance = (): number => read().balance;

/** Add cocottes (level clears, daily challenges, rewards). Returns the new balance. */
export function earn(amount: number): number {
	if (amount <= 0) return balance();
	const w = read();
	w.balance += Math.round(amount);
	write(w);
	return w.balance;
}

export const owns = (id: string): boolean => read().owned.includes(id);
export const ownedBlasons = (): Blason[] => { const o = read().owned; return BLASONS.filter((b) => o.includes(b.id)); };
export const equippedBlason = (): Blason | null => { const e = read().equipped; return BLASONS.find((b) => b.id === e) ?? null; };

/** Buy a blason if affordable and not already owned. Returns true on success. */
export function buyBlason(id: string): boolean {
	const b = BLASONS.find((x) => x.id === id);
	if (!b) return false;
	const w = read();
	if (w.owned.includes(id)) return true;
	if (w.balance < b.price) return false;
	w.balance -= b.price;
	w.owned.push(id);
	write(w);
	return true;
}

/** Equip an owned blason (or null to clear). */
export function equipBlason(id: string | null): void {
	const w = read();
	if (id === null || w.owned.includes(id)) {
		w.equipped = id;
		write(w);
	}
}

/** Escalating daily-return reward: grows with the activity streak, capped at 25. */
export const dailyRewardAmount = (streakDay: number): number => Math.min(25, 5 + Math.max(0, streakDay - 1) * 3);

export interface RewardState {
	playedToday: boolean;
	canClaim: boolean;
	amount: number; // cocottes for claiming today
}

/** Today's reward status. Requires having played a game today; one claim per day. */
export function rewardState(): RewardState {
	const s = activityStreak();
	const nextDay = s.playedToday ? s.count : s.atRisk ? s.count + 1 : 1; // streak-day today's play counts as
	const claimedToday = read().lastReward === utcDay();
	return { playedToday: s.playedToday, canClaim: s.playedToday && !claimedToday, amount: dailyRewardAmount(nextDay) };
}

/** Claim today's reward if eligible. Returns the amount earned (0 if not eligible). */
export function claimDailyReward(): number {
	const st = rewardState();
	if (!st.canClaim) return 0;
	const w = read();
	w.balance += st.amount;
	w.lastReward = utcDay();
	write(w);
	return st.amount;
}
