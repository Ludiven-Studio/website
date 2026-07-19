// submit-level — the ONLY write path for game_progress (service_role, bypasses RLS).
// Validates a level result and keeps the player's BEST per (game, player, level):
// more stars wins; on a stars tie, the better score is kept (metric direction from
// the `games` row: 'time' = lower is better, 'score' = higher).
//
// Deploy:  supabase functions deploy submit-level
// Local:   supabase functions serve submit-level

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
	// Open CORS: the games are also embedded in iframes on third-party portals.
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitPayload {
	game_id: string;
	player_id: string;
	level: number;
	stars: number;
	score: number;
	raw_data?: Record<string, unknown>;
}

interface GameRules {
	id: string;
	metric: 'time' | 'score';
	max_score: number | null;
}

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const bad = (reason: string): Response => json({ error: reason }, 400);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	const { game_id, player_id, level, stars, score } = payload;
	if (typeof game_id !== 'string' || !game_id) return bad('game_id is required');
	if (typeof player_id !== 'string' || !UUID_RE.test(player_id)) return bad('player_id must be a UUID');
	if (!Number.isInteger(level) || level < 1 || level > 100) return bad('level must be 1..100');
	if (!Number.isInteger(stars) || stars < 1 || stars > 3) return bad('stars must be 1..3');
	if (!Number.isInteger(score) || score < 0) return bad('score must be a non-negative integer');

	const supabase = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
	);

	// ---- Load the game's rules (reuses the shared games table) ----
	const { data: game, error: gameErr } = await supabase
		.from('games')
		.select('id, metric, max_score')
		.eq('id', game_id)
		.maybeSingle<GameRules>();
	if (gameErr) return json({ error: 'rules lookup failed' }, 500);
	if (!game) return bad(`unknown game '${game_id}'`);

	// A score-metric game shares the same ceiling as the daily leaderboard.
	if (game.metric === 'score' && game.max_score != null && score > game.max_score)
		return bad(`score above ceiling (${score} > ${game.max_score})`);

	// NOTE (residual gap, v1): stars are computed client-side and trusted here. RLS
	// blocks direct writes and progression isn't a global ranking, so the bar is lower
	// than the daily challenge. Future hardening = re-generate the level from its seed
	// server-side and recompute stars from best_score.

	// ---- Best-retained upsert per (game, player, level) ----
	const { data: existing, error: exErr } = await supabase
		.from('game_progress')
		.select('stars, best_score')
		.eq('game_id', game_id)
		.eq('player_id', player_id)
		.eq('level', level)
		.maybeSingle<{ stars: number; best_score: number }>();
	if (exErr) return json({ error: 'lookup failed' }, 500);

	const isTime = game.metric === 'time';
	const betterScore = (a: number, b: number) => (isTime ? a < b : a > b);
	// Keep the row with more stars; on a stars tie, keep the better score.
	const improved = !existing
		|| stars > existing.stars
		|| (stars === existing.stars && betterScore(score, existing.best_score));

	const bestStars = existing ? Math.max(stars, existing.stars) : stars;
	const bestScore = existing ? (improved ? score : existing.best_score) : score;

	const row = {
		game_id, player_id, level,
		stars: bestStars,
		best_score: bestScore,
		raw_data: improved ? (payload.raw_data ?? null) : undefined,
		updated_at: new Date().toISOString(),
	};
	// Strip undefined so an unchanged raw_data is not overwritten with null.
	if (row.raw_data === undefined) delete (row as Record<string, unknown>).raw_data;

	const { error: upErr } = await supabase
		.from('game_progress')
		.upsert(row, { onConflict: 'game_id,player_id,level' });
	if (upErr) return json({ error: 'upsert failed' }, 500);

	return json({ stars: bestStars, best_score: bestScore, improved });
});
