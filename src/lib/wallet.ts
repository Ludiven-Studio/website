// Local "cocoin" currency: a balance, an escalating daily-return reward, cosmetic
// blasons, and per-game "Expert" packs (a 4th difficulty + levels 101-200). All
// device-local (localStorage), no signup — casually cheatable. See [[currency-cocottes]].
// The storage key and the analytics names still say "cocottes" — renaming them would
// wipe every player's balance.

import { activityStreak } from './streak';
import { challengeDay } from './day';

const KEY = 'ludiven-cocottes';

/** Fired on every wallet mutation so React islands on the page refresh together. */
export const WALLET_EVENT = 'ludiven:wallet';

/** Fired when the balance grows, with the gain in `detail.amount` — drives the toast. */
export const EARN_EVENT = 'ludiven:earn';

export interface Blason {
	id: string;
	emoji: string;
	label: string;
	price: number; // in cocoins
	tier?: 'commun' | 'legendaire';
}

// Shop catalog (prices escalate). 'cocotte' is the free starter, owned by default.
// The legendary tail is the long-term goal: months of play, not a week.
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
	{ id: 'meteore', emoji: '☄️', label: 'Météore', price: 350, tier: 'legendaire' },
	{ id: 'phenix', emoji: '🦅', label: 'Phénix', price: 500, tier: 'legendaire' },
	{ id: 'dragon', emoji: '🐉', label: 'Dragon', price: 750, tier: 'legendaire' },
	{ id: 'galaxie', emoji: '🌌', label: 'Galaxie', price: 1200, tier: 'legendaire' },
	{ id: 'cocotte-or', emoji: '🥇', label: "Cocotte d'or", price: 2000, tier: 'legendaire' },
];

/** One purchase per game: unlocks the Expert difficulty *and* levels 101-200. */
export const UNLOCK_PRICE = 200;

export interface GameTheme {
	id: string;
	emoji: string;
	label: string;
	desc: string;
	href: string; // the game the theme skins
	price: number;
}

// Cosmetic in-game themes, owned like blasons ('skin:' namespaced in the same array).
export const THEMES: GameTheme[] = [
	{ id: 'billard-tron', emoji: '🌌', label: 'Billard Néon', desc: 'feutre nuit, néons façon Tron', href: '/jeux/billard/', price: 150 },
	{ id: 'billard-western', emoji: '🤠', label: 'Billard Saloon', desc: 'feutre whisky, corde et laiton façon western', href: '/jeux/billard/', price: 150 },
];

export const themeId = (id: string): string => `skin:${id}`;

// Unlocks live in the same `owned` array as blasons, namespaced. No extra storage key,
// no migration — but every blason lookup must go through BLASONS, never through `owned`.
export const unlockId = (gameId: string): string => `expert:${gameId}`;

interface WalletData {
	balance: number;
	owned: string[];
	equipped: string | null;
	lastReward: string; // challenge day of the last claimed daily reward
}

const empty = (): WalletData => ({ balance: 0, owned: ['cocotte'], equipped: null, lastReward: '' });

function parse(): WalletData {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return empty();
		const w = JSON.parse(raw) as Partial<WalletData>;
		const owned = Array.isArray(w.owned) && w.owned.length ? w.owned : ['cocotte'];
		return {
			balance: Number(w.balance) || 0,
			owned,
			equipped: typeof w.equipped === 'string' && owned.includes(w.equipped)
				&& BLASONS.some((b) => b.id === w.equipped) ? w.equipped : null,
			lastReward: String(w.lastReward || ''),
		};
	} catch {
		return empty();
	}
}

// hasUnlock() sits in render loops (level grids, difficulty pills), so the parse is cached.
// Another tab writing the key is the only way the cache can go stale behind our back.
let cache: WalletData | null = null;
let watching = false;

function read(): WalletData {
	if (!cache) {
		cache = parse();
		if (!watching) {
			try {
				window.addEventListener('storage', () => { cache = null; });
				watching = true;
			} catch {
				/* no window */
			}
		}
	}
	return { ...cache, owned: cache.owned.slice() };
}

function write(w: WalletData): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(w));
	} catch {
		/* storage unavailable */
	}
	cache = { ...w, owned: w.owned.slice() };
	try {
		window.dispatchEvent(new Event(WALLET_EVENT));
	} catch {
		/* no window (tests run on node) */
	}
}

// Every gain goes through here, so a single listener can show it — no game has to call
// anything to get its "+N cocoins" toast.
function announceGain(amount: number): void {
	try {
		window.dispatchEvent(new CustomEvent(EARN_EVENT, { detail: { amount } }));
	} catch {
		/* no window (tests run on node) */
	}
}

/** Drop the cached parse — for tests that swap the localStorage stub. */
export const resetWalletCache = (): void => { cache = null; };

export const balance = (): number => read().balance;

/** Add cocoins (level clears, daily challenges, rewards). Returns the new balance. */
export function earn(amount: number): number {
	if (amount <= 0) return balance();
	const w = read();
	const gain = Math.round(amount);
	w.balance += gain;
	write(w);
	announceGain(gain);
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

/** Equip an owned blason (or null to clear). Namespaced unlock ids are not blasons. */
export function equipBlason(id: string | null): void {
	const w = read();
	if (id === null || (w.owned.includes(id) && BLASONS.some((b) => b.id === id))) {
		w.equipped = id;
		write(w);
	}
}

export const hasTheme = (id: string): boolean => read().owned.includes(themeId(id));

/** Buy a cosmetic theme. Returns true on success (or if already owned). */
export function buyTheme(id: string): boolean {
	const t = THEMES.find((x) => x.id === id);
	if (!t) return false;
	const w = read();
	const key = themeId(id);
	if (w.owned.includes(key)) return true;
	if (w.balance < t.price) return false;
	w.balance -= t.price;
	w.owned.push(key);
	write(w);
	return true;
}

export const hasUnlock = (gameId: string): boolean => read().owned.includes(unlockId(gameId));

/** Buy a game's Expert pack. Returns true on success (or if already owned). */
export function buyUnlock(gameId: string): boolean {
	const id = unlockId(gameId);
	const w = read();
	if (w.owned.includes(id)) return true;
	if (w.balance < UNLOCK_PRICE) return false;
	w.balance -= UNLOCK_PRICE;
	w.owned.push(id);
	write(w);
	return true;
}

export const unlockedGames = (): string[] =>
	read().owned.filter((id) => id.startsWith('expert:')).map((id) => id.slice(7));

/** Escalating daily-return reward: grows with the activity streak, capped at 25. */
export const dailyRewardAmount = (streakDay: number): number => Math.min(25, 5 + Math.max(0, streakDay - 1) * 3);

export interface RewardState {
	playedToday: boolean;
	canClaim: boolean;
	amount: number; // cocoins for claiming today
}

/** Today's reward status. Requires having played a game today; one claim per day. */
export function rewardState(): RewardState {
	const s = activityStreak();
	const nextDay = s.playedToday ? s.count : s.atRisk ? s.count + 1 : 1; // streak-day today's play counts as
	const claimedToday = read().lastReward === challengeDay();
	return { playedToday: s.playedToday, canClaim: s.playedToday && !claimedToday, amount: dailyRewardAmount(nextDay) };
}

/** Claim today's reward if eligible. Returns the amount earned (0 if not eligible). */
export function claimDailyReward(): number {
	const st = rewardState();
	if (!st.canClaim) return 0;
	const w = read();
	w.balance += st.amount;
	w.lastReward = challengeDay();
	write(w);
	announceGain(st.amount);
	return st.amount;
}
