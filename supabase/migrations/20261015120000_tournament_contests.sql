-- A tournament day often runs several contests: doublette and triplette side by
-- side, one in the morning and one in the afternoon. Each has its own start,
-- format, category and fee; `contests` holds them, sorted by start.
-- starts_at / format / category / entry_fee_cents stay as a copy of the first
-- contest, so older app builds keep reading one. last_starts_at is the latest
-- start: a tournament leaves the map half a day after it.

alter table public.meetup_tournaments
	add column if not exists contests jsonb,
	add column if not exists last_starts_at timestamptz;

-- Older writers (an app or a function from before contests) only know the single
-- columns. On insert they give the one contest. On update, a null list or new
-- single values with the list untouched replace the first contest only, so the
-- others survive an edit from an older app.
create or replace function public.meetup_tournaments_contests() returns trigger
language plpgsql set search_path = public as $$
declare
	single jsonb := jsonb_build_object(
		'starts_at', to_jsonb(new.starts_at), 'format', new.format,
		'category', new.category, 'entry_fee_cents', new.entry_fee_cents);
begin
	if tg_op = 'INSERT' then
		if new.contests is null or jsonb_typeof(new.contests) <> 'array' or jsonb_array_length(new.contests) = 0 then
			new.contests := jsonb_build_array(single);
		end if;
	elsif new.contests is null
		or (new.contests is not distinct from old.contests
			and (new.starts_at, new.format, new.category, new.entry_fee_cents)
				is distinct from (old.starts_at, old.format, old.category, old.entry_fee_cents)) then
		new.contests := jsonb_set(coalesce(old.contests, '[{}]'::jsonb), '{0}', single);
	end if;
	select jsonb_agg(c order by (c->>'starts_at')::timestamptz) into new.contests
		from jsonb_array_elements(new.contests) c;
	new.starts_at := (new.contests->0->>'starts_at')::timestamptz;
	new.format := new.contests->0->>'format';
	new.category := new.contests->0->>'category';
	new.entry_fee_cents := (new.contests->0->>'entry_fee_cents')::integer;
	select max((c->>'starts_at')::timestamptz) into new.last_starts_at
		from jsonb_array_elements(new.contests) c;
	return new;
end $$;

revoke all on function public.meetup_tournaments_contests() from public, anon, authenticated;

drop trigger if exists meetup_tournaments_contests on public.meetup_tournaments;
create trigger meetup_tournaments_contests before insert or update on public.meetup_tournaments
	for each row execute function public.meetup_tournaments_contests();

-- Fires the trigger on every existing row.
update public.meetup_tournaments set contests = null where contests is null;

alter table public.meetup_tournaments
	alter column contests set not null,
	alter column last_starts_at set not null,
	drop constraint if exists meetup_tournaments_contests_len,
	add constraint meetup_tournaments_contests_len
		check (jsonb_array_length(contests) between 1 and 6);

create index if not exists meetup_tournaments_last_idx on public.meetup_tournaments (last_starts_at)
	where status = 'open' and not hidden;
