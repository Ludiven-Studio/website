-- Pétanque Game's shooting prizes are paid from one reading only, on a scratch database (never production):
--   psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/shot_prizes_settle_test.sql
-- The first migration needs pg_net, so its two tables stand in here; everything is rolled back.

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

\ir ../migrations/20261119100000_shot_prizes_settle.sql

do $$
declare
	n integer;
begin
	-- No reading kept: nothing closes.
	if shot_prizes_settle('shots_day', '2026-11-18') <> -2 then raise exception 'closed with no reading'; end if;
	if exists (select 1 from shot_prizes_closed) then raise exception 'a period closed empty'; end if;

	-- Two snapshots read different first places: the first to close pays its reading, the other pays nothing.
	if not shot_prizes_draft_save('shots_day', '2026-11-18', 12,
		'[{"player_id":"a","rank":1,"score":46,"coins":500},{"player_id":"b","rank":2,"score":45,"coins":300}]') then
		raise exception 'first reading refused';
	end if;
	n := shot_prizes_settle('shots_day', '2026-11-18');
	if n <> 2 then raise exception 'first close paid % rows', n; end if;
	if shot_prizes_draft_save('shots_day', '2026-11-18', 13,
		'[{"player_id":"c","rank":1,"score":48,"coins":500},{"player_id":"a","rank":2,"score":46,"coins":300}]') then
		raise exception 'a reading kept after the close';
	end if;
	if shot_prizes_settle('shots_day', '2026-11-18') <> -1 then raise exception 'closed twice'; end if;
	if (select count(*) from shot_prizes where rank = 1) <> 1 or (select sum(coins) from shot_prizes) <> 800 then
		raise exception 'paid twice: %', (select string_agg(player_id || ':' || coins, ',') from shot_prizes);
	end if;
	if exists (select 1 from shot_prizes_draft) or exists (select 1 from shot_prizes_draft_head) then
		raise exception 'the draft stayed after the close';
	end if;

	-- A reading of fewer lines (taken after Unity's reset) never replaces the draft.
	perform shot_prizes_draft_save('shots_week', '2026-11-16', 40, '[{"player_id":"w","rank":1,"score":50,"coins":2000}]');
	if shot_prizes_draft_save('shots_week', '2026-11-16', 1, '[{"player_id":"z","rank":1,"score":3,"coins":2000}]') then
		raise exception 'a reset ranking replaced the draft';
	end if;
	if not shot_prizes_draft_save('shots_week', '2026-11-16', 41, '[{"player_id":"v","rank":1,"score":50,"coins":2000}]') then
		raise exception 'a later reading was refused';
	end if;
	if shot_prizes_settle('shots_week', '2026-11-16') <> 1 then raise exception 'week not closed'; end if;
	if (select player_id from shot_prizes where board = 'shots_week') <> 'v' then raise exception 'not the latest reading'; end if;

	-- An empty ranking closes with nothing paid.
	perform shot_prizes_draft_save('shots_day', '2026-11-19', 0, '[]');
	if shot_prizes_settle('shots_day', '2026-11-19') <> 0 then raise exception 'empty day not closed'; end if;

	if has_function_privilege('anon', 'public.shot_prizes_settle(text, date)', 'execute')
		or has_function_privilege('authenticated', 'public.shot_prizes_draft_save(text, date, integer, jsonb)', 'execute') then
		raise exception 'a client may settle or write a draft';
	end if;
end;
$$;

\echo shot_prizes_settle_test: ok
rollback;
