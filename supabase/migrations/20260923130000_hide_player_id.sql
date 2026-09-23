-- Stop publishing player_id.
--
-- player_id is the only proof of identity (daily quota, levels, meetup seats), and both
-- game_scores and game_progress let anon read it for every row: harvest an id, then spend
-- that player's daily attempts or kick them out of a meetup.
--
-- * game_scores: column-level read, without player_id and raw_data.
-- * game_progress: no table read at all; a player reads their own rows through
--   get_progress(). Filtering by player_id over REST needs SELECT on that column, so a
--   column grant cannot hide it there.
--
-- Apply AFTER the site deploy that stops selecting player_id (src/lib/scores.ts) and reads
-- progression through the RPC (src/lib/progression.ts). Old clients degrade gracefully:
-- progression falls back to localStorage, cards lose yesterday's record.
-- Idempotent.

revoke select on table public.game_scores from anon, authenticated;
grant select (id, game_id, player_name, score, attempts, challenge_date, created_at, updated_at)
	on table public.game_scores to anon, authenticated;

create or replace function public.get_progress(p_game text, p_player uuid)
returns table (level smallint, stars smallint, best_score bigint)
language sql
stable
security definer
set search_path = public
as $$
	select level, stars, best_score from public.game_progress
	where game_id = p_game and player_id = p_player;
$$;

revoke all on function public.get_progress(text, uuid) from public;
grant execute on function public.get_progress(text, uuid) to anon, authenticated, service_role;

revoke select on table public.game_progress from anon, authenticated;
