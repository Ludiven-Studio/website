-- Progression / Levels mode: per-player, per-level best result (1-3 stars).
-- Like game_scores, clients can only READ; all writes go through the
-- `submit-level` Edge Function (service_role, bypasses RLS). Reuses the same
-- games rules table (metric direction) and the same anonymous player_id.

create table if not exists public.game_progress (
	game_id text not null references public.games(id),
	player_id uuid not null,               -- anonymous device id (localStorage), same as game_scores
	level smallint not null check (level between 1 and 100),
	stars smallint not null check (stars between 1 and 3), -- best retained
	best_score bigint not null check (best_score >= 0),    -- best time (centis) or score for the level
	raw_data jsonb,                        -- raw run stats for audit / offline re-validation
	updated_at timestamptz not null default now(),
	primary key (game_id, player_id, level)
);

-- Read path: a player's whole progression for a game.
create index if not exists game_progress_player_idx
	on public.game_progress (game_id, player_id);

-- RLS: public read, zero client writes. The Edge Function uses service_role.
alter table public.game_progress enable row level security;

drop policy if exists game_progress_public_read on public.game_progress;
create policy game_progress_public_read on public.game_progress
	for select using (true);
