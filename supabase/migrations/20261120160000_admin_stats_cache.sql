-- stats-admin's cache: the studio dashboard's figures read from Umami, kept 10 minutes so the page
-- does not ask Umami a hundred questions on every visit. One row per key ('overview').
-- RLS on with NO policies: only the stats-admin Edge Function reads and writes it (service_role).

create table if not exists public.admin_stats_cache (
	key text primary key check (key ~ '^[a-z0-9_-]{1,40}$'),
	body jsonb not null,
	fetched_at timestamptz not null default now()
);

alter table public.admin_stats_cache enable row level security;
revoke all on public.admin_stats_cache from anon, authenticated;
