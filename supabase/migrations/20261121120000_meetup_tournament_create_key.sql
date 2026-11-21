-- As for games (20261117100000_meetup_create_key.sql): the app sends a fresh key with each new
-- tournament, and the same key when it sends again after a lost answer. A second tournament with
-- the same key fails here, and the `meetups` function answers with the first one. Older apps send none.
-- Apply before deploying the function that writes create_key on tournaments.
alter table public.meetup_tournaments add column if not exists create_key uuid;
create unique index if not exists meetup_tournaments_create_key_idx
	on public.meetup_tournaments (organizer_id, create_key) where create_key is not null;
