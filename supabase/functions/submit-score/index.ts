// submit-score — the ONLY write path for game_scores (service_role, bypasses RLS).
// Validates every submission against the per-game rules stored in `games`, enforces
// the daily-challenge quota, and keeps the player's best score per challenge date.
//
// Deploy:  supabase functions deploy submit-score
// Local:   supabase functions serve submit-score

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
	// Open CORS: the games are also embedded in iframes on third-party portals (CrazyGames).
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitPayload {
	game_id: string;
	player_id: string;
	player_name?: string;
	score: number;
	duration_seconds: number;
	raw_data?: Record<string, unknown>;
	is_daily_challenge?: boolean;
}

interface GameRules {
	id: string;
	metric: 'time' | 'score'; // 'time' = lower is better, 'score' = higher
	min_duration_seconds: number | null;
	max_score: number | null;
	max_score_per_second: number | null;
	max_attempts_per_day: number | null;
	value_units_per_second: number | null; // time games: value ÷ this = seconds (100 = centis, 1000 = ms)
}

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const bad = (reason: string): Response => json({ error: reason }, 400);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Game-specific validation hook. Generic rules (duration, ceiling, rate, quota)
 * are already checked by the caller — add here anything that needs game knowledge.
 *
 * How to extend, e.g. for a sudoku game:
 *   case 'sudoku': {
 *     // raw_data would carry { seed, grid: number[81] }. Re-generate the puzzle
 *     // from the seed (same deterministic generator as the client), then verify
 *     // the submitted grid solves it. Return a reason string to reject.
 *     ...
 *   }
 */
function validateGameSpecific(payload: SubmitPayload, _rules: GameRules): string | null {
	switch (payload.game_id) {
		default:
			return null;
	}
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

	let payload: SubmitPayload;
	try {
		payload = await req.json();
	} catch {
		return bad('invalid JSON body');
	}

	// ---- Shape checks ----
	const { game_id, player_id, score } = payload;
	if (typeof game_id !== 'string' || !game_id) return bad('game_id is required');
	if (typeof player_id !== 'string' || !UUID_RE.test(player_id)) return bad('player_id must be a UUID');
	if (!Number.isInteger(score) || score < 0) return bad('score must be a non-negative integer');
	// Optional: score games may send a measured run length; time games omit it (value carries the time).
	const duration = typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds) && payload.duration_seconds > 0
		? payload.duration_seconds : null;
	const playerName = String(payload.player_name ?? '').trim().slice(0, 20);
	const isDaily = payload.is_daily_challenge === true;

	const supabase = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
	);

	// ---- Load the game's rules ----
	const { data: game, error: gameErr } = await supabase
		.from('games')
		.select('id, metric, min_duration_seconds, max_score, max_score_per_second, max_attempts_per_day, value_units_per_second')
		.eq('id', game_id)
		.maybeSingle<GameRules>();
	if (gameErr) return json({ error: 'rules lookup failed' }, 500);
	if (!game) return bad(`unknown game '${game_id}'`);

	// ---- Generic validations (a NULL rule = not enforced) ----
	if (game.max_score != null && score > game.max_score)
		return bad(`score above ceiling (${score} > ${game.max_score})`);

	// Minimum run length. For a time game the value itself IS the time (value ÷
	// value_units_per_second = seconds), so we can't be fooled by a forged duration.
	// For a score game we fall back to the client-measured duration when present.
	if (game.min_duration_seconds != null) {
		if (game.metric === 'time' && game.value_units_per_second) {
			const seconds = score / game.value_units_per_second;
			if (seconds < game.min_duration_seconds)
				return bad(`too fast (${seconds.toFixed(1)}s < ${game.min_duration_seconds}s)`);
		} else if (duration != null && duration < game.min_duration_seconds) {
			return bad(`run too short (${duration}s < ${game.min_duration_seconds}s)`);
		}
	}
	if (game.max_score_per_second != null && duration != null && score / duration > game.max_score_per_second)
		return bad(`score rate too high (${(score / duration).toFixed(1)}/s > ${game.max_score_per_second}/s)`);

	const specific = validateGameSpecific(payload, game);
	if (specific) return bad(specific);

	// ---- Free play: validated append-only row, no quota, no best-retained ----
	if (!isDaily) {
		const { error } = await supabase.from('game_scores').insert({
			game_id, player_id, player_name: playerName, score,
			raw_data: payload.raw_data ?? null, challenge_date: null,
		});
		if (error) return json({ error: 'insert failed' }, 500);
		return json({ retained: true, best_score: score, attempts_left: null });
	}

	// ---- Daily challenge: quota + best-score-retained upsert ----
	// The server (UTC) decides the challenge date — never trust a client-sent date.
	const challengeDate = new Date().toISOString().slice(0, 10);

	const { data: existing, error: exErr } = await supabase
		.from('game_scores')
		.select('id, score, attempts')
		.eq('game_id', game_id)
		.eq('player_id', player_id)
		.eq('challenge_date', challengeDate)
		.maybeSingle<{ id: string; score: number; attempts: number }>();
	if (exErr) return json({ error: 'quota lookup failed' }, 500);

	const attemptsUsed = existing?.attempts ?? 0;
	if (game.max_attempts_per_day != null && attemptsUsed >= game.max_attempts_per_day)
		return bad(`daily attempt quota reached (${attemptsUsed}/${game.max_attempts_per_day})`);

	// 'time' keeps the min (fastest), 'score' the max (highest).
	const isTime = game.metric === 'time';
	const retained = !existing || (isTime ? score < existing.score : score > existing.score);
	const bestScore = existing ? (isTime ? Math.min(score, existing.score) : Math.max(score, existing.score)) : score;
	if (existing) {
		const { error } = await supabase
			.from('game_scores')
			.update({
				attempts: attemptsUsed + 1,
				updated_at: new Date().toISOString(),
				...(retained ? { score, player_name: playerName, raw_data: payload.raw_data ?? null } : {}),
			})
			.eq('id', existing.id);
		if (error) return json({ error: 'update failed' }, 500);
	} else {
		const { error } = await supabase.from('game_scores').insert({
			game_id, player_id, player_name: playerName, score,
			raw_data: payload.raw_data ?? null, challenge_date: challengeDate,
		});
		if (error) return json({ error: 'insert failed' }, 500);
	}

	// TRANSITION BRIDGE — also feed the legacy `scores` table (via its RPC) so the
	// "record du jour" cards and /jeux/defi hub, which still read it, keep showing
	// this game. Remove once every reader has moved to game_scores.
	if (playerName) {
		await supabase.rpc('submit_score', {
			p_game: game_id, p_day: challengeDate, p_name: playerName, p_value: bestScore, p_metric: game.metric,
		}).then(() => {}, () => {}); // best-effort: never fail the submission over the bridge
	}

	// Rank among today's entries (1 = best): count strictly-better scores.
	const rankQuery = supabase
		.from('game_scores')
		.select('id', { count: 'exact', head: true })
		.eq('game_id', game_id)
		.eq('challenge_date', challengeDate);
	const { count } = await (isTime ? rankQuery.lt('score', bestScore) : rankQuery.gt('score', bestScore));

	return json({
		retained,
		best_score: bestScore,
		attempts_left: game.max_attempts_per_day != null ? game.max_attempts_per_day - (attemptsUsed + 1) : null,
		rank: (count ?? 0) + 1,
	});
});
