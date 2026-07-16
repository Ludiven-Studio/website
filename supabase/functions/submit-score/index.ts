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
	min_duration_seconds: number | null;
	max_score: number | null;
	max_score_per_second: number | null;
	max_attempts_per_day: number | null;
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
	const { game_id, player_id, score, duration_seconds } = payload;
	if (typeof game_id !== 'string' || !game_id) return bad('game_id is required');
	if (typeof player_id !== 'string' || !UUID_RE.test(player_id)) return bad('player_id must be a UUID');
	if (!Number.isInteger(score) || score < 0) return bad('score must be a non-negative integer');
	if (typeof duration_seconds !== 'number' || !Number.isFinite(duration_seconds) || duration_seconds <= 0)
		return bad('duration_seconds must be a positive number');
	const playerName = String(payload.player_name ?? '').trim().slice(0, 20);
	const isDaily = payload.is_daily_challenge === true;

	const supabase = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
	);

	// ---- Load the game's rules ----
	const { data: game, error: gameErr } = await supabase
		.from('games')
		.select('id, min_duration_seconds, max_score, max_score_per_second, max_attempts_per_day')
		.eq('id', game_id)
		.maybeSingle<GameRules>();
	if (gameErr) return json({ error: 'rules lookup failed' }, 500);
	if (!game) return bad(`unknown game '${game_id}'`);

	// ---- Generic validations (a NULL rule = not enforced) ----
	if (game.min_duration_seconds != null && duration_seconds < game.min_duration_seconds)
		return bad(`run too short (${duration_seconds}s < ${game.min_duration_seconds}s)`);
	if (game.max_score != null && score > game.max_score)
		return bad(`score above ceiling (${score} > ${game.max_score})`);
	if (game.max_score_per_second != null && score / duration_seconds > game.max_score_per_second)
		return bad(`score rate too high (${(score / duration_seconds).toFixed(1)}/s > ${game.max_score_per_second}/s)`);

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

	const retained = !existing || score > existing.score;
	const bestScore = Math.max(score, existing?.score ?? 0);
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
			p_game: game_id, p_day: challengeDate, p_name: playerName, p_value: bestScore, p_metric: 'score',
		}).then(() => {}, () => {}); // best-effort: never fail the submission over the bridge
	}

	// Rank among today's entries (1 = best).
	const { count } = await supabase
		.from('game_scores')
		.select('id', { count: 'exact', head: true })
		.eq('game_id', game_id)
		.eq('challenge_date', challengeDate)
		.gt('score', bestScore);

	return json({
		retained,
		best_score: bestScore,
		attempts_left: game.max_attempts_per_day != null ? game.max_attempts_per_day - (attemptsUsed + 1) : null,
		rank: (count ?? 0) + 1,
	});
});
