-- The studio's board for /admin/versions/: one row per app, its store, testers' and main versions and what
-- waits for Raphaël. Written by the studio's board.py after each store or testers' send (it merges its fields
-- into the row, so `waits` set by hand stays), read by stats-admin's `board` action for Raphaël's account only.
-- RLS on with NO policies: anon and signed-in users read nothing.

create table if not exists public.studio_board (
	app text primary key check (app ~ '^[a-z0-9-]{1,32}$'),
	data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384),
	updated_at timestamptz not null default now()
);

alter table public.studio_board enable row level security;
revoke all on public.studio_board from anon, authenticated;
