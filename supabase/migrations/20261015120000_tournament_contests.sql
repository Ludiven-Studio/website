-- A tournament day often runs several contests: doublette and triplette side by
-- side, one in the morning and one in the afternoon. Each has its own start,
-- format, category and fee; `contests` holds them, sorted by start.
-- starts_at / format / category / entry_fee_cents stay as a copy of the first
-- contest, so older app builds keep reading one. last_starts_at is the latest
-- start: a tournament leaves the map half a day after it.

alter table public.meetup_tournaments
	add column if not exists contests jsonb,
	add column if not exists last_starts_at timestamptz;

-- A row written without contests (an older function) gets its single one; then
-- last_starts_at follows the list, whoever wrote it.
create or replace function public.meetup_tournaments_contests() returns trigger
language plpgsql set search_path = public as $$
begin
	if new.contests is null or jsonb_typeof(new.contests) <> 'array' or jsonb_array_length(new.contests) = 0 then
		new.contests := jsonb_build_array(jsonb_build_object(
			'starts_at', new.starts_at, 'format', new.format,
			'category', new.category, 'entry_fee_cents', new.entry_fee_cents));
	end if;
	select max((c->>'starts_at')::timestamptz) into new.last_starts_at
		from jsonb_array_elements(new.contests) c;
	new.last_starts_at := greatest(coalesce(new.last_starts_at, new.starts_at), new.starts_at);
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
	add constraint meetup_tournaments_contests_len
		check (jsonb_array_length(contests) between 1 and 6);

create index if not exists meetup_tournaments_last_idx on public.meetup_tournaments (last_starts_at)
	where status = 'open' and not hidden;
