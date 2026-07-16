-- Secure score submission: generic per-game validation rules + server-written scores.
-- Clients can only READ; all writes go through the `submit-score` Edge Function
-- (service_role, bypasses RLS). The legacy `public.scores` table + `submit_score`
-- RPC stay untouched — games migrate one by one to this schema (luge first).

-- 1) Per-game validation rules. A NULL rule = not enforced.
create table if not exists public.games (
	id text primary key,                 -- game slug, e.g. 'luge'
	name text not null,
	min_duration_seconds numeric,        -- reject runs shorter than this
	max_score bigint,                    -- hard score ceiling
	max_score_per_second numeric,        -- reject score/duration above this rate
	max_attempts_per_day integer,        -- daily-challenge quota (null = unlimited)
	created_at timestamptz not null default now()
);

-- 2) Scores. challenge_date filled for daily-challenge entries (one best row per
--    player/day, updated in place), null for free-play entries (append-only).
create table if not exists public.game_scores (
	id uuid primary key default gen_random_uuid(),
	game_id text not null references public.games(id),
	player_id uuid not null,             -- anonymous device id (localStorage), stable across pseudo changes
	player_name text not null default '',-- display pseudo (free text, editable)
	score bigint not null check (score >= 0),
	raw_data jsonb,                      -- raw run stats for audit / offline re-validation
	attempts integer not null default 1, -- daily: submissions consumed so far (quota counter)
	challenge_date date,                 -- null = free play
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Daily rows are unique per (game, day, player) — the Edge Function upserts the best.
create unique index if not exists game_scores_daily_uniq
	on public.game_scores (game_id, challenge_date, player_id)
	where challenge_date is not null;

-- Leaderboard reads: top-N by score for a game+day.
create index if not exists game_scores_leaderboard_idx
	on public.game_scores (game_id, challenge_date, score desc);

-- 3) RLS: public read, zero client writes. The Edge Function uses service_role,
--    which bypasses RLS — no insert/update/delete policy is ever granted.
alter table public.games enable row level security;
alter table public.game_scores enable row level security;

drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games
	for select using (true);

drop policy if exists game_scores_public_read on public.game_scores;
create policy game_scores_public_read on public.game_scores
	for select using (true);

-- 4) Seed: luge. Score = meters × speed multiplier (capped at ×2.5) + pickup bonuses.
--    Max track speed ≈ 60 m/s → ≈150 pts/s at full multiplier; 200 leaves bonus headroom.
insert into public.games (id, name, min_duration_seconds, max_score, max_score_per_second, max_attempts_per_day)
values ('luge', 'Luge', 5, 100000, 200, 10)
on conflict (id) do nothing;
