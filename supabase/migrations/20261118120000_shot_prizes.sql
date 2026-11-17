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
create index if not exists shot_prizes_created on public.shot_prizes (created_at);

-- A period closed by its first good snapshot: later calls (the cron's retry) change nothing.
create table if not exists public.shot_prizes_closed (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null,
	closed_at timestamptz not null default now(),
	primary key (board, period)
);

alter table public.shot_prizes enable row level security;
alter table public.shot_prizes_closed enable row level security;
revoke all on table public.shot_prizes from public, anon, authenticated;
revoke all on table public.shot_prizes_closed from public, anon, authenticated;

-- pg_cron and pg_net: enable them only where they are missing.
do $$
begin
	if not exists (select 1 from pg_namespace where nspname = 'cron') then
		create extension pg_cron with schema pg_catalog;
	end if;
end;
$$;
create extension if not exists pg_net with schema extensions;

-- The rows go after 30 days on their own, whatever Unity answers (the privacy policy's « 30 days at most »).
create or replace function public.shot_prizes_purge() returns integer
language plpgsql
set search_path = public
as $$
declare
	gone integer;
begin
	delete from shot_prizes where created_at < now() - interval '30 days';
	get diagnostics gone = row_count;
	delete from shot_prizes_closed where closed_at < now() - interval '30 days';
	return gone;
end;
$$;
revoke all on function public.shot_prizes_purge() from public, anon, authenticated;
grant execute on function public.shot_prizes_purge() to service_role;

-- The snapshot a minute before each reset (00:00 UTC; Unity resets « shots_week » on Mondays): the day closing
-- is computed here, so a call that comes late closes nothing rather than the next period. One call: pg_net sends
-- a transaction's requests only as it commits, so a second one in the same job would leave with the first; the
-- function tries Unity three times, and a period it closed ignores any later call. The function's key lives in
-- the vault (« shot_prizes_cron_key », set at deploy time before the first night), never in git. Scheduling under
-- the same name again replaces a job.
create or replace function public.shot_prizes_call() returns bigint
language sql
set search_path = public
as $fn$
	select net.http_post(
		url := 'https://mzrdfahmzllgbpudpsdi.supabase.co/functions/v1/shot-prizes',
		headers := jsonb_build_object(
			'Content-Type', 'application/json',
			'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'shot_prizes_cron_key')
		),
		body := jsonb_build_object('action', 'snapshot', 'day', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')),
		timeout_milliseconds := 60000
	);
$fn$;
revoke all on function public.shot_prizes_call() from public, anon, authenticated;

select cron.schedule('shot-prizes-snapshot', '59 23 * * *',
	'select public.shot_prizes_call()');
select cron.schedule('shot-prizes-purge', '17 3 * * *', 'select public.shot_prizes_purge()');
