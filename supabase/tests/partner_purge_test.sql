-- The partner purge and its pg_cron job, on a scratch database (never production):
--   psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/partner_purge_test.sql
-- Stands in for what Supabase provides (the roles, a tournament table, pg_cron's schedule),
-- applies the partner migrations, checks, then rolls everything back.

begin;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
	if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

-- pg_cron's schedule: the same name replaces the job.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
	insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
	on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
	returning jobid;
$$;

create table public.meetup_tournaments (id uuid primary key default gen_random_uuid());

\ir ../migrations/20261106020000_partner_searches.sql
\ir ../migrations/20261117010000_partner_hardening.sql
\ir ../migrations/20261117090000_partner_purge_cron.sql
\ir ../migrations/20261117090000_partner_purge_cron.sql

insert into meetup_tournaments (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into meetup_partner_searches
	(id, tournament_id, player_id, first_name, poster, contest_starts_at, format, category, level, phone)
values
	('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
	 '00000000-0000-0000-0000-0000000000c1', 'Past', 'solo', now() - interval '1 minute',
	 'doublette', 'open', 'loisir', '+33612345678'),
	('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
	 '00000000-0000-0000-0000-0000000000c2', 'Ahead', 'solo', now() + interval '1 day',
	 'doublette', 'open', 'loisir', '+33612345679');
insert into meetup_partner_contacts (search_id, player_id) values
	('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c3'),
	('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3');
insert into meetup_partner_reports (search_id, reporter_id, reason) values
	('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c3', 'fake'),
	('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3', 'fake');
delete from meetup_partner_contact_quota;
insert into meetup_partner_contact_quota (player_id, created_at) values
	('00000000-0000-0000-0000-0000000000c3', now() - interval '3 days'),
	('00000000-0000-0000-0000-0000000000c3', now() - interval '1 hour');

do $$
declare
	job cron.job;
	gone integer;
begin
	select * into strict job from cron.job where jobname = 'meetup-partner-purge';
	if job.schedule <> '*/10 * * * *' then raise exception 'schedule is %', job.schedule; end if;

	-- What pg_cron runs every 10 minutes.
	execute job.command;

	if exists (select 1 from meetup_partner_searches where id = '00000000-0000-0000-0000-0000000000b1') then
		raise exception 'a started search is still there';
	end if;
	if (select count(*) from meetup_partner_contacts) <> 1 or (select count(*) from meetup_partner_reports) <> 1 then
		raise exception 'the started search left contacts or reports';
	end if;
	if not exists (select 1 from meetup_partner_searches where id = '00000000-0000-0000-0000-0000000000b2') then
		raise exception 'a search ahead went';
	end if;
	if (select count(*) from meetup_partner_contact_quota) <> 1 then
		raise exception 'the quota kept % rows, 1 expected', (select count(*) from meetup_partner_contact_quota);
	end if;

	gone := public.partner_searches_purge();
	if gone <> 0 then raise exception 'a second pass removed % searches', gone; end if;
	if has_function_privilege('anon', 'public.partner_searches_purge()', 'execute') then
		raise exception 'anon may run the purge';
	end if;
end;
$$;

\echo partner_purge_test: ok
rollback;
