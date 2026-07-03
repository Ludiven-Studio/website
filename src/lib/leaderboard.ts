// Daily leaderboard via Supabase REST (no SDK — keeps the bundle small).
// Inactive until SUPABASE_URL + SUPABASE_ANON_KEY are set in src/data/site.ts.

import { dateSeed } from '../games/prng';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { trackGame } from './analytics';

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

/** Deterministic seed (client fallback): same date + game → same grid. */
export const dailySeed = (gameId: string, d: Date = new Date()): number =>
	(Math.imul(dateSeed(d), 2654435761) ^ hashStr(gameId)) >>> 0;

const WEEKDAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const dailyWeekdayLabel = (d: Date = new Date()): string => WEEKDAYS_FR[d.getDay()];

/** Difficulty tier 0..2, easier early week → harder weekend (client fallback). */
export const dailyDifficultyIndex = (d: Date = new Date()): number => {
	const dow = d.getDay(); // 0=Sun..6=Sat
	if (dow === 1 || dow === 2) return 0; // Mon/Tue → facile
	if (dow >= 3 && dow <= 5) return 1; // Wed/Thu/Fri → moyen
	return 2; // Sat/Sun → difficile
};

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

/** Snapshot of today's daily attempt (one try per device, resumable). */
export interface DailyRun {
	startedAt: number;
	done: boolean;
	finalTime?: number;
	seed?: number;
	diffIndex?: number;
	state?: unknown; // game-specific (e.g. Sudoku entries)
}

const runKey = (game: string): string => `ludiven-dailyrun-${game}-${todayKey()}`;

export function loadDailyRun(game: string): DailyRun | null {
	try {
		const raw = localStorage.getItem(runKey(game));
		return raw ? (JSON.parse(raw) as DailyRun) : null;
	} catch {
		return null;
	}
}

export function saveDailyRun(game: string, run: DailyRun): void {
	try {
		// One-shot Umami events (first save of the day = daily played; first save with done = daily finished).
		const prevRaw = localStorage.getItem(runKey(game));
		localStorage.setItem(runKey(game), JSON.stringify(run));
		if (prevRaw === null) trackGame(game, 'daily_played');
		if (run.done) {
			const prevDone = prevRaw ? (JSON.parse(prevRaw) as DailyRun).done === true : false;
			if (!prevDone) trackGame(game, 'daily_done');
		}
	} catch {
		/* ignore */
	}
}

const headers = (): Record<string, string> => ({
	apikey: SUPABASE_ANON_KEY,
	Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
	'Content-Type': 'application/json',
});

/** Daily seed + difficulty from the server (authoritative, unpredictable).
 *  Falls back to a date-derived seed when Supabase is off or unreachable. */
export async function getDaily(gameId: string): Promise<{ seed: number; diffIndex: number }> {
	const fallback = { seed: dailySeed(gameId), diffIndex: dailyDifficultyIndex() };
	if (!leaderboardEnabled()) return fallback;
	// Bound the fetch: a hung connection must not leave the daily stuck on loading.
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 4000);
	try {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_daily`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ p_game: gameId }),
			signal: ctrl.signal,
		});
		if (!res.ok) return fallback;
		const rows = await res.json();
		const row = Array.isArray(rows) ? rows[0] : rows;
		if (!row || row.seed == null) return fallback;
		return { seed: Number(row.seed) >>> 0, diffIndex: Number(row.diff_index) || 0 };
	} catch {
		return fallback;
	} finally {
		clearTimeout(timer);
	}
}

async function submitScore(game: string, value: number, metric: Metric): Promise<boolean> {
	if (!leaderboardEnabled()) return false;
	value = Math.round(value); // p_value is a bigint: a fractional value (e.g. Drift lap ms) would 404 the RPC
	const name = playerName().trim();
	if (!name) return false;
	const day = todayKey();
	try {
		// Preferred: RPC that keeps a single best row per (game, day, player) and purges past days.
		const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ p_game: game, p_day: day, p_name: name, p_value: value, p_metric: metric }),
		});
		if (res.ok) return true;
		// Fallback when the RPC isn't deployed yet (e.g. 404): plain insert so scores still save.
		const ins = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
			method: 'POST',
			headers: { ...headers(), Prefer: 'return=minimal' },
			body: JSON.stringify({ game, day, name, value, metric }),
		});
		return ins.ok;
	} catch {
		return false;
	}
}

const bestKey = (game: string): string => `ludiven-dailybest-${game}-${todayKey()}`;

/** Submit only when it beats the player's own best of the day (fewer rows). */
export async function submitDaily(game: string, value: number, metric: Metric): Promise<boolean> {
	value = Math.round(value); // the RPC's p_value is bigint — never send a fractional value (e.g. Drift lap ms)
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
