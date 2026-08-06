-- Expert pack: levels 101-200. The original check was written inline, so its name is
-- whatever Postgres generated. Look it up instead of guessing, then widen the range.

do $$
declare
	c text;
begin
	select conname into c
	from pg_constraint
	where conrelid = 'public.game_progress'::regclass
		and contype = 'c'
		and pg_get_constraintdef(oid) ilike '%level%between 1 and 100%';
	if c is not null then
		execute format('alter table public.game_progress drop constraint %I', c);
	end if;
end $$;

alter table public.game_progress
	drop constraint if exists game_progress_level_check;

alter table public.game_progress
	add constraint game_progress_level_check check (level between 1 and 200);
