-- Presence by protocol (Pétanque Game 1.0.20), on a scratch database (never production):
--   psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/app_presence_proto_test.sql
-- Stands in for Supabase's roles, applies the app_presence migrations, checks, then rolls everything back.

begin;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end;
$$;

\ir ../migrations/20261114120000_app_presence.sql
\ir ../migrations/20261117120000_app_presence_confirmed.sql
\ir ../migrations/20261118130000_app_presence_seek.sql
\ir ../migrations/20261125130000_app_presence_window.sql
\ir ../migrations/20261127120000_app_presence_proto.sql

do $$
declare
	old_seeker uuid := '00000000-0000-4000-8000-0000000000a1'; -- 1.0.19, searching
	old_idle uuid := '00000000-0000-4000-8000-0000000000a2';   -- 1.0.19, in the menus
	new_seeker uuid := '00000000-0000-4000-8000-0000000000b1'; -- 1.0.20, searching
	new_idle uuid := '00000000-0000-4000-8000-0000000000b2';   -- 1.0.20, in the menus
	later uuid := '00000000-0000-4000-8000-0000000000c1';      -- a protocol to come
	r jsonb;
	i integer;
begin
	-- Every phone beats twice: a session counts from its second beat.
	for i in 1..2 loop
		perform presence_beat_seek('petanquegame', old_seeker, 'Marcel', 1::smallint, 'g13');
		perform presence_beat_seek('petanquegame', old_idle, null, null, null);
		perform presence_beat_seek('petanquegame', new_seeker, 'Bébert', 2::smallint, 'g14', '14');
	end loop;
	perform presence_beat_seek('petanquegame', new_idle, null, null, null, '14');

	-- A 1.0.20 phone counts and is told only the 1.0.20 phones.
	r := presence_beat_seek('petanquegame', new_idle, null, null, null, '14');
	if (r->>'online')::int <> 2 then raise exception '1.0.20 phone: % online, 2 expected (%)', r->>'online', r; end if;
	if r->'seeker'->>'game' is distinct from 'g14' then raise exception '1.0.20 phone told %', r->'seeker'; end if;
	if r->'seeker'->>'proto' is distinct from '14' then raise exception 'the search told without its protocol: %', r; end if;

	-- A phone before 1.0.20, through the function deployed today (five arguments) or the new one with no
	-- protocol: only its own group, never the 1.0.20 search.
	r := presence_beat_seek('petanquegame', old_idle, null, null, null);
	if (r->>'online')::int <> 2 then raise exception 'old phone: % online, 2 expected (%)', r->>'online', r; end if;
	if r->'seeker'->>'game' is distinct from 'g13' then raise exception 'old phone told %', r->'seeker'; end if;
	if r->'seeker' ? 'proto' and r->'seeker'->'proto' <> 'null'::jsonb then raise exception 'old search with a protocol: %', r; end if;
	r := presence_beat_seek('petanquegame', old_idle, null, null, null, null);
	if r->'seeker'->>'game' is distinct from 'g13' or (r->>'online')::int <> 2 then raise exception 'old phone, new path: %', r; end if;

	-- The 1.0.20 search stops: a 1.0.20 phone is told none, though an old phone still searches.
	perform presence_beat_seek('petanquegame', new_seeker, null, null, null, '14');
	r := presence_beat_seek('petanquegame', new_idle, null, null, null, '14');
	if r->'seeker' <> 'null'::jsonb then raise exception '1.0.20 phone told an old search: %', r; end if;

	-- The old search stops: an old phone is told none, though a 1.0.20 phone searches again.
	perform presence_beat_seek('petanquegame', new_seeker, 'Bébert', 2::smallint, 'g14b', '14');
	perform presence_beat_seek('petanquegame', old_seeker, null, null, null);
	r := presence_beat_seek('petanquegame', old_idle, null, null, null);
	if r->'seeker' <> 'null'::jsonb then raise exception 'old phone told a 1.0.20 search: %', r; end if;

	-- Another protocol is alone: it counts itself only.
	r := presence_beat_seek('petanquegame', later, null, null, null, '15');
	if (r->>'online')::int <> 1 or r->'seeker' <> 'null'::jsonb then raise exception 'protocol 15: %', r; end if;

	-- Rows keep their protocol; the silent ones still go after 7 minutes, whatever their group.
	if (select proto from app_presence where session = new_seeker) is distinct from '14' then raise exception 'protocol not kept'; end if;
	if (select proto from app_presence where session = old_idle) is not null then raise exception 'an old row got a protocol'; end if;
	update app_presence set seen = now() - interval '8 minutes' where session in (old_seeker, new_seeker);
	perform presence_beat_seek('petanquegame', later, null, null, null, '15');
	if exists (select 1 from app_presence where session in (old_seeker, new_seeker)) then raise exception 'silent rows kept'; end if;

	raise notice 'app_presence_proto_test: all checks passed';
end;
$$;

rollback;
