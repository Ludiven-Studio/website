-- Pétanque Game's shooting prizes: a period the 23:59 snapshot did not close (a call lost, late or failed) is closed
-- at the next run from its last reading before Unity's reset. shot-prizes keeps a reading of the running rankings
-- every 15 minutes (« draft »); Unity cannot read a ranking once reset, so that reading is the fallback. What went
-- wrong is said in shot_prizes_alerts (one row per period and kind) and in an « ALERT shot-prizes » log line.

create table if not exists public.shot_prizes_alerts (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null,
	kind text not null check (kind in ('missed', 'caught_up', 'late_call', 'failed')),
	detail text not null default '',
	created_at timestamptz not null default now(),
	primary key (board, period, kind)
);
create index if not exists shot_prizes_alerts_created on public.shot_prizes_alerts (created_at);
alter table public.shot_prizes_alerts enable row level security;
revoke all on table public.shot_prizes_alerts from public, anon, authenticated;

-- One call per job (pg_net sends a transaction's requests only as it commits). The day is computed here, so a
-- snapshot that comes late closes nothing but the periods left behind.
drop function if exists public.shot_prizes_call();
create or replace function public.shot_prizes_call(p_action text) returns bigint
language sql
set search_path = public
as $fn$
	select net.http_post(
		url := 'https://mzrdfahmzllgbpudpsdi.supabase.co/functions/v1/shot-prizes',
		headers := jsonb_build_object(
			'Content-Type', 'application/json',
			'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'shot_prizes_cron_key')
		),
		body := jsonb_build_object('action', p_action, 'day', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')),
		timeout_milliseconds := 120000
	);
$fn$;
revoke all on function public.shot_prizes_call(text) from public, anon, authenticated;

-- Same names replace the jobs. The drafts stay clear of the first minutes after a reset and of the snapshot.
select cron.schedule('shot-prizes-snapshot', '59 23 * * *', $$select public.shot_prizes_call('snapshot')$$);
select cron.schedule('shot-prizes-draft', '7,22,37,52 * * * *', $$select public.shot_prizes_call('draft')$$);

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
	delete from shot_prizes_draft_head where taken_at < now() - interval '30 days';
	delete from shot_prizes_alerts where created_at < now() - interval '30 days';
	return gone;
end;
$$;
