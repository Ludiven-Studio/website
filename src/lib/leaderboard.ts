// Daily leaderboard via Supabase REST (no SDK — keeps the bundle small).
// Inactive until SUPABASE_URL + SUPABASE_ANON_KEY are set in src/data/site.ts.

import { dateSeed } from '../games/prng';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';

export type Metric = 'time' | 'score';
export interface ScoreRow {
	name: string;
	value: number;
	created_at?: string;
}

export const leaderboardEnabled = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Local date as YYYY-MM-DD (the puzzle "day", shared by everyone). */
export const todayKey = (d: Date = new Date()): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hashStr = (s: string): number => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
};

/** Deterministic seed: same date + game → same grid for everyone. */
export const dailySeed = (gameId: string, d: Date = new Date()): number =>
	(Math.imul(dateSeed(d), 2654435761) ^ hashStr(gameId)) >>> 0;

const NAME_KEY = 'ludiven-player';
export const playerName = (): string => {
	try {
		return localStorage.getItem(NAME_KEY) || '';
	} catch {
		return '';
	}
};
export const setPlayerName = (name: string): void => {
	try {
		localStorage.setItem(NAME_KEY, name.trim().slice(0, 20));
	} catch {
		/* ignore */
	}
};

const headers = (): Record<string, string> => ({
	apikey: SUPABASE_ANON_KEY,
	Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
	'Content-Type': 'application/json',
});

async function submitScore(game: string, value: number, metric: Metric): Promise<boolean> {
	if (!leaderboardEnabled()) return false;
	const name = playerName().trim();
	if (!name) return false;
	try {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
			method: 'POST',
			headers: { ...headers(), Prefer: 'return=minimal' },
			body: JSON.stringify({ game, day: todayKey(), name, value, metric }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

const bestKey = (game: string): string => `ludiven-dailybest-${game}-${todayKey()}`;

/** Submit only when it beats the player's own best of the day (fewer rows). */
export async function submitDaily(game: string, value: number, metric: Metric): Promise<boolean> {
	let prev: number | null = null;
	try {
		const v = localStorage.getItem(bestKey(game));
		prev = v == null ? null : Number(v);
	} catch {
		/* ignore */
	}
	const better = prev == null || (metric === 'time' ? value < prev : value > prev);
	if (!better) return false;
	const ok = await submitScore(game, value, metric);
	if (ok) {
		try {
			localStorage.setItem(bestKey(game), String(value));
		} catch {
			/* ignore */
		}
	}
	return ok;
}

/** Top-N for a game on a day. Dedupes to each player's best entry. */
export async function fetchLeaderboard(
	game: string,
	metric: Metric,
	day: string = todayKey(),
	limit = 50,
): Promise<ScoreRow[]> {
	if (!leaderboardEnabled()) return [];
	const order = metric === 'time' ? 'value.asc' : 'value.desc';
	try {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/scores?game=eq.${encodeURIComponent(game)}&day=eq.${day}&select=name,value,created_at&order=${order},created_at.asc&limit=${limit}`,
			{ headers: headers() },
		);
		if (!res.ok) return [];
		const rows: ScoreRow[] = await res.json();
		// Keep each player's best (rows already ordered best-first).
		const seen = new Set<string>();
		const out: ScoreRow[] = [];
		for (const r of rows) {
			const key = r.name.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(r);
		}
		return out;
	} catch {
		return [];
	}
}
