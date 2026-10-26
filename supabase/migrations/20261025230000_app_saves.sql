-- The studio apps' cloud saves: one JSON copy of a signed-in player's progress per
-- (account, app). The account is the Supabase Auth user (Google or Apple), the same one
-- Pétanque Meet and the site sign in with. `version` moves on every write, so a phone
-- writes only over the copy it last read (compare-and-set in the function).
-- RLS on with NO policies: every access goes through the `app-save` Edge Function
-- (service_role, bypasses RLS).

create table if not exists public.app_saves (
	user_id uuid not null references auth.users(id) on delete cascade,
	app text not null check (app ~ '^[a-z0-9-]{1,32}$'),
	data jsonb not null,
	version integer not null check (version >= 1),
	updated_at timestamptz not null default now(),
	primary key (user_id, app)
);

alter table public.app_saves enable row level security;
revoke all on public.app_saves from anon, authenticated;
