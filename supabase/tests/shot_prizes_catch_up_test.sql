-- Pétanque Game's shooting prizes: the catch-up migration's cron jobs, call and purge, on a scratch database (never
-- production):
--   psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/shot_prizes_catch_up_test.sql
-- Stands in for what Supabase provides (pg_cron's schedule, pg_net, the vault) and the first migration's tables;
-- everything is rolled back.

begin;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
	if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

create table public.shot_prizes (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null,
	player_id text not null,
	rank smallint not null check (rank >= 1),
	score smallint not null check (score >= 0),
	coins integer not null check (coins > 0),
	created_at timestamptz not null default now(),
	primary key (board, period, player_id)
);
create table public.shot_prizes_closed (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null,
	closed_at timestamptz not null default now(),
	primary key (board, period)
);

create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
	insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
	on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
	returning jobid;
$$;
insert into cron.job (jobname, schedule, command) values ('shot-prizes-snapshot', '59 23 * * *', 'select public.shot_prizes_call()');

create schema net;
create table net.sent (url text, headers jsonb, body jsonb, timeout_milliseconds integer);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint
language sql as $$
	insert into net.sent values (url, headers, body, timeout_milliseconds);
	select 1::bigint;
$$;
create schema vault;
create view vault.decrypted_secrets as select 'shot_prizes_cron_key'::text as name, 'k'::text as decrypted_secret;

create function public.shot_prizes_call() returns bigint language sql as $$ select 0::bigint $$; -- the first migration's

\ir ../migrations/20261119100000_shot_prizes_settle.sql
\ir ../migrations/20261119100100_shot_prizes_last_read.sql
\ir ../migrations/20261119100200_shot_prizes_catch_up.sql

do $$
declare
	job cron.job;
begin
	if exists (select 1 from pg_proc where proname = 'shot_prizes_call' and pronargs = 0) then
		raise exception 'the call without an action is still there';
	end if;
	select * into strict job from cron.job where jobname = 'shot-prizes-snapshot';
	if job.schedule <> '59 23 * * *' then raise exception 'snapshot at %', job.schedule; end if;
	execute job.command;
	select * into strict job from cron.job where jobname = 'shot-prizes-draft';
	if job.schedule <> '7,22,37,52 * * * *' then raise exception 'drafts at %', job.schedule; end if;
	execute job.command;
	if (select array_agg(body->>'action' order by body->>'action') from net.sent) <> array['draft', 'snapshot']
		or exists (select 1 from net.sent where timeout_milliseconds <> 120000 or headers->>'x-cron-key' <> 'k'
			or body->>'day' <> to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')) then
		raise exception 'calls sent: %', (select json_agg(s) from net.sent s);
	end if;

	-- One alert row per period and kind; the purge takes them after 30 days with the drafts.
	insert into shot_prizes_alerts (board, period, kind, detail) values ('shots_day', '2026-11-18', 'missed', 'x')
		on conflict do nothing;
	insert into shot_prizes_alerts (board, period, kind, detail) values ('shots_day', '2026-11-18', 'missed', 'y')
		on conflict do nothing;
	if (select count(*) from shot_prizes_alerts) <> 1 then raise exception 'alert twice'; end if;
	perform shot_prizes_draft_save('shots_day', '2026-11-18', 1, '[{"player_id":"a","rank":1,"score":9,"coins":500}]');
	update shot_prizes_alerts set created_at = now() - interval '31 days';
	update shot_prizes_draft_head set taken_at = now() - interval '31 days';
	perform shot_prizes_purge();
	if exists (select 1 from shot_prizes_alerts) or exists (select 1 from shot_prizes_draft) then
		raise exception 'old alerts or drafts kept';
	end if;
	if has_table_privilege('anon', 'public.shot_prizes_alerts', 'select') then raise exception 'anon reads the alerts'; end if;
end;
$$;

\echo shot_prizes_catch_up_test: ok
rollback;
