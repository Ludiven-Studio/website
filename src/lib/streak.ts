// Daily-challenge streaks: a global "did any daily today" streak plus one per game.
// Stored in localStorage and keyed by UTC day (aligned with challengeDateUTC in
// lib/scores) so the day rolls over at the same instant for everyone.

export interface Streak {
	count: number;
	lastDate: string; // YYYY-MM-DD (UTC) of the last completed day
}

export interface StreakView {
	count: number; // 0 once the streak has lapsed (a full day was missed)
	playedToday: boolean;
	atRisk: boolean; // still alive, but not continued today yet
}

const GLOBAL_KEY = 'ludiven-streak-global';
const gameKey = (gameId: string): string => `ludiven-streak-${gameId}`;

/** UTC day, matching challengeDateUTC() in lib/scores. */
const utcDay = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

const dayBefore = (isoDay: string): string =>
	new Date(Date.parse(`${isoDay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

const read = (key: string): Streak => {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return { count: 0, lastDate: '' };
		const s = JSON.parse(raw) as Streak;
		return { count: Number(s.count) || 0, lastDate: String(s.lastDate || '') };
	} catch {
		return { count: 0, lastDate: '' };
	}
};

const write = (key: string, s: Streak): void => {
	try {
		localStorage.setItem(key, JSON.stringify(s));
	} catch {
		/* storage unavailable — stay in memory only */
	}
};

/** Advance one streak for "completed today". Idempotent within a UTC day. */
const bump = (key: string, today: string): void => {
	const s = read(key);
	if (s.lastDate === today) return; // already counted today
	const next = s.lastDate === dayBefore(today) ? s.count + 1 : 1;
	write(key, { count: next, lastDate: today });
};

/** Record that a daily challenge was completed — bumps the global streak and this game's. */
export function recordDailyDone(gameId: string): void {
	const today = utcDay();
	bump(GLOBAL_KEY, today);
	bump(gameKey(gameId), today);
}

const view = (s: Streak): StreakView => {
	const today = utcDay();
	if (s.lastDate === today) return { count: s.count, playedToday: true, atRisk: false };
	if (s.lastDate === dayBefore(today)) return { count: s.count, playedToday: false, atRisk: true };
	return { count: 0, playedToday: false, atRisk: false };
};

/** Current global streak (across all daily challenges). */
export const globalStreak = (): StreakView => view(read(GLOBAL_KEY));

/** Current streak for one game. */
export const gameStreak = (gameId: string): StreakView => view(read(gameKey(gameId)));
