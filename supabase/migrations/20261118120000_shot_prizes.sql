-- Pétanque Game's shooting challenge: the paid places of each finished day and week ranking (Unity
-- Leaderboards), kept by Unity player id, no name, for 30 days, so the game can pay each prize once.
-- Written and read by the shot-prizes function only (service role); nobody else reads or writes it.

create table if not exists public.shot_prizes (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null, -- the period's first day (UTC)
	player_id text not null, -- Unity Authentication's player id
	rank smallint not null check (rank >= 1),
	score smallint not null check (score >= 0),
	coins integer not null check (coins > 0),
	created_at timestamptz not null default now(),
	primary key (board, period, player_id)
);
create index if not exists shot_prizes_player on public.shot_prizes (player_id);

alter table public.shot_prizes enable row level security;
revoke all on table public.shot_prizes from public, anon, authenticated;

-- pg_cron and pg_net: enable them only where they are missing.
do $$
begin
	if not exists (select 1 from pg_namespace where nspname = 'cron') then
		create extension pg_cron with schema pg_catalog;
	end if;
end;
$$;
create extension if not exists pg_net with schema extensions;

-- A minute before each reset (00:00 UTC; Unity resets « shots_week » on Mondays): the function closes the
-- day, and the week on Sundays. Its key lives in the vault (« shot_prizes_cron_key »), set at deploy time,
-- never in git. Scheduling under the same name again replaces the job.
select cron.schedule('shot-prizes-snapshot', '59 23 * * *', $job$
	select net.http_post(
		url := 'https://mzrdfahmzllgbpudpsdi.supabase.co/functions/v1/shot-prizes',
		headers := jsonb_build_object(
			'Content-Type', 'application/json',
			'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'shot_prizes_cron_key')
		),
		body := '{"action":"snapshot"}'::jsonb,
		timeout_milliseconds := 30000
	);
$job$);
