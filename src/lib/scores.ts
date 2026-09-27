// Secure score client — talks to the `submit-score` Edge Function (server-side
// validation, daily quota, best-retained) and reads the RLS-protected game_scores
// table. Legacy path (lib/leaderboard.ts direct RPC) remains for not-yet-migrated
// games; migrate a game by calling submitScore() and feeding <Leaderboard source>.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { SECURED_GAMES } from '../data/securedGames';
import { challengeDay } from './day';
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

/** The challenge day the server stamps rows with (Europe/Paris), mirrored here for reads. */
export const challengeDateKey = (): string => challengeDay();

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
			`${SUPABASE_URL}/rest/v1/game_scores?challenge_date=eq.${day}&select=game_id,player_name,score&limit=5000`,
			{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
		);
		if (!res.ok) return {};
		const rows: { game_id: string; player_name: string; score: number }[] = await res.json();
		const best: Record<string, { name: string; value: number; players: number }> = {};
		// A daily keeps one row per (game, player, day), so rows = players. player_id is not readable.
		const players: Record<string, number> = {};
		for (const r of rows) {
			players[r.game_id] = (players[r.game_id] ?? 0) + 1;
			const metric = SECURED_GAMES[r.game_id] ?? 'score';
			const cur = best[r.game_id];
			const better = !cur || (metric === 'time' ? r.score < cur.value : r.score > cur.value);
			if (better) best[r.game_id] = { name: r.player_name || 'Anonyme', value: r.score, players: 0 };
		}
		for (const g in best) best[g].players = players[g];
		return best;
	} catch {
		return {};
	}
}

/** Daily top-N from game_scores, shaped like the legacy ScoreRow so
    <Leaderboard source={...}> renders unchanged. 'time' → fastest first, 'score' → highest first. */
export async function getLeaderboard(gameId: string, metric: Metric = 'score', day: string = challengeDateKey(), limit = 50, offset = 0): Promise<ScoreRow[]> {
	if (!leaderboardEnabled()) return [];
	const order = metric === 'time' ? 'score.asc' : 'score.desc';
	// Throws on transport/HTTP failure so <Leaderboard> can distinguish empty from unreachable.
	const res = await fetch(
		`${SUPABASE_URL}/rest/v1/game_scores?game_id=eq.${encodeURIComponent(gameId)}&challenge_date=eq.${day}` +
			`&select=player_name,score,created_at&order=${order},created_at.asc&limit=${limit}&offset=${offset}`,
		{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
	);
	if (!res.ok) throw new Error(`leaderboard ${res.status}`);
	const rows: { player_name: string; score: number; created_at: string }[] = await res.json();
	return rows.map((r) => ({ name: r.player_name || 'Anonyme', value: r.score, created_at: r.created_at }));
}

/** How many played a day's board and, given a value, where it stands. One row per player per day
    (game_scores_daily_uniq), so a count of better rows is the rank: nothing is downloaded. */
export async function getDailyRank(gameId: string, metric: Metric, value: number | null, day: string = challengeDateKey()): Promise<{ rank: number | null; total: number } | null> {
	if (!leaderboardEnabled()) return null;
	const count = async (filter: string): Promise<number | null> => {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/game_scores?game_id=eq.${encodeURIComponent(gameId)}&challenge_date=eq.${day}${filter}&select=score&limit=1`,
			{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' } },
		);
		const total = res.ok ? Number(res.headers.get('content-range')?.split('/')[1]) : NaN;
		return Number.isFinite(total) ? total : null;
	};
	const [better, total] = await Promise.all([
		value == null ? Promise.resolve(null) : count(`&score=${metric === 'time' ? 'lt' : 'gt'}.${value}`),
		count(''),
	]);
	if (total == null) return null;
	return { rank: better == null ? null : better + 1, total };
}

/** An event's board: every free-play row of `gameId` (no challenge date), each player's best
    kept once. Rows are append-only there, so the dedupe happens here, on the pseudo.
    Read in chunks: the API hands out at most 1000 rows a request, whatever the limit asks. */
export async function getEventLeaderboard(gameId: string, metric: Metric = 'time', limit = 1000): Promise<ScoreRow[]> {
	if (!leaderboardEnabled()) return [];
	const order = metric === 'time' ? 'score.asc' : 'score.desc';
	const CHUNK = 1000, MAX_CHUNKS = 10;
	const seen = new Set<string>();
	const out: ScoreRow[] = [];
	for (let c = 0; c < MAX_CHUNKS && out.length < limit; c++) {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/game_scores?game_id=eq.${encodeURIComponent(gameId)}&challenge_date=is.null` +
				`&select=player_name,score,created_at&order=${order},created_at.asc&limit=${CHUNK}&offset=${c * CHUNK}`,
			{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
		);
		if (!res.ok) throw new Error(`leaderboard ${res.status}`);
		const rows: { player_name: string; score: number; created_at: string }[] = await res.json();
		for (const r of rows) {
			const name = r.player_name || 'Anonyme';
			if (seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			out.push({ name, value: r.score, created_at: r.created_at });
			if (out.length >= limit) break;
		}
		if (rows.length < CHUNK) break;
	}
	return out;
}
