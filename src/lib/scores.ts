// Secure score client — talks to the `submit-score` Edge Function (server-side
// validation, daily quota, best-retained) and reads the RLS-protected game_scores
// table. Legacy path (lib/leaderboard.ts direct RPC) remains for not-yet-migrated
// games; migrate a game by calling submitScore() and feeding <Leaderboard source>.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { SECURED_GAMES } from '../data/securedGames';
import { playerName, leaderboardEnabled, type Metric, type ScoreRow } from './leaderboard';

const PLAYER_ID_KEY = 'ludiven-player-id';

/** Anonymous stable device id — quota identity, survives pseudo changes. */
export function playerId(): string {
	try {
		let id = localStorage.getItem(PLAYER_ID_KEY);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(PLAYER_ID_KEY, id);
		}
		return id;
	} catch {
		return crypto.randomUUID(); // storage unavailable → per-session id
	}
}

/** The new system's challenge day — server-decided UTC date, mirrored here for reads. */
export const challengeDateUTC = (): string => new Date().toISOString().slice(0, 10);

export interface SubmitScoreArgs {
	gameId: string;
	score: number;
	/** Client-measured run length (score games). Time games omit it — the server derives
	    the duration from the value itself (value_units_per_second), which can't be faked. */
	durationSeconds?: number;
	rawData?: Record<string, unknown>;
	isDailyChallenge?: boolean;
}

export interface SubmitScoreResult {
	ok: boolean;
	retained?: boolean; // true when this run became the player's best of the day
	bestScore?: number;
	attemptsLeft?: number | null;
	rank?: number;
	error?: string; // server rejection reason (400) or transport failure
}

export async function submitScore(args: SubmitScoreArgs): Promise<SubmitScoreResult> {
	if (!leaderboardEnabled()) return { ok: false, error: 'leaderboard disabled' };
	try {
		const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-score`, {
			method: 'POST',
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				game_id: args.gameId,
				player_id: playerId(),
				player_name: playerName().trim(),
				score: Math.round(args.score),
				duration_seconds: args.durationSeconds,
				raw_data: args.rawData ?? null,
				is_daily_challenge: args.isDailyChallenge === true,
			}),
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
		return {
			ok: true,
			retained: body.retained,
			bestScore: body.best_score,
			attemptsLeft: body.attempts_left,
			rank: body.rank,
		};
	} catch {
		return { ok: false, error: 'network error' };
	}
}

/** Best entry + unique-player count per game for a day, from game_scores (which keeps
    history, unlike the legacy `scores` table purged each day). Shaped like the legacy
    fetchDailyTops — powers the "record d'hier" fallback on cards. */
export async function fetchDailyTopsSecure(day: string): Promise<Record<string, { name: string; value: number; players: number }>> {
	if (!leaderboardEnabled()) return {};
	try {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/game_scores?challenge_date=eq.${day}&select=game_id,player_name,score,player_id&limit=5000`,
			{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
		);
		if (!res.ok) return {};
		const rows: { game_id: string; player_name: string; score: number; player_id: string }[] = await res.json();
		const best: Record<string, { name: string; value: number; players: number }> = {};
		const players: Record<string, Set<string>> = {};
		for (const r of rows) {
			(players[r.game_id] ??= new Set()).add(r.player_id);
			const metric = SECURED_GAMES[r.game_id] ?? 'score';
			const cur = best[r.game_id];
			const better = !cur || (metric === 'time' ? r.score < cur.value : r.score > cur.value);
			if (better) best[r.game_id] = { name: r.player_name || 'Anonyme', value: r.score, players: 0 };
		}
		for (const g in best) best[g].players = players[g].size;
		return best;
	} catch {
		return {};
	}
}

/** Daily top-N from game_scores, shaped like the legacy ScoreRow so
    <Leaderboard source={...}> renders unchanged. 'time' → fastest first, 'score' → highest first. */
export async function getLeaderboard(gameId: string, metric: Metric = 'score', day: string = challengeDateUTC(), limit = 50): Promise<ScoreRow[]> {
	if (!leaderboardEnabled()) return [];
	const order = metric === 'time' ? 'score.asc' : 'score.desc';
	// Throws on transport/HTTP failure so <Leaderboard> can distinguish empty from unreachable.
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/game_scores?game_id=eq.${encodeURIComponent(gameId)}&challenge_date=eq.${day}` +
			`&select=player_name,score,created_at&order=${order},created_at.asc&limit=${limit}`,
		{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
	);
	if (!res.ok) throw new Error(`leaderboard ${res.status}`);
	const rows: { player_name: string; score: number; created_at: string }[] = await res.json();
	return rows.map((r) => ({ name: r.player_name || 'Anonyme', value: r.score, created_at: r.created_at }));
}
