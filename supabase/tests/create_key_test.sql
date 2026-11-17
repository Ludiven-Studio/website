-- The create key's index, on a scratch database (never production):
--   psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/create_key_test.sql
-- A stand-in for meetup_events with the columns the index reads; everything is rolled back.

begin;

create table public.meetup_events (
	id uuid primary key default gen_random_uuid(),
	organizer_id uuid not null,
	secret text not null default gen_random_uuid()::text
);

\ir ../migrations/20261117100000_meetup_create_key.sql
\ir ../migrations/20261117100000_meetup_create_key.sql

do $$
declare
	me uuid := '00000000-0000-0000-0000-0000000000c1';
	other uuid := '00000000-0000-0000-0000-0000000000c2';
	k uuid := '00000000-0000-0000-0000-0000000000d1';
begin
	insert into meetup_events (organizer_id, create_key) values (me, k);

	-- The same key again: refused, under the name the function looks for (CREATE_KEY_INDEX).
	begin
		insert into meetup_events (organizer_id, create_key) values (me, k);
		raise exception 'a second game with the same key went in';
	exception when unique_violation then
		if sqlerrm not like '%meetup_events_create_key_idx%' then
			raise exception 'refused by another constraint: %', sqlerrm;
		end if;
	end;

	-- Another organizer's key, and games without a key, never clash.
	insert into meetup_events (organizer_id, create_key) values (other, k);
	insert into meetup_events (organizer_id) values (me), (me);

	if (select count(*) from meetup_events) <> 4 then
		raise exception '% games, 4 expected', (select count(*) from meetup_events);
	end if;
end;
$$;

\echo create_key_test: ok
rollback;
