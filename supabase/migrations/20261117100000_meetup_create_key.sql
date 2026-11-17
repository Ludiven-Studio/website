-- The app sends a fresh key with each new game, and the same key when it sends again after a
-- lost answer. A second game with the same key fails here, and the `meetups` function answers
-- with the first one (_shared/createOnce.ts). Games made before, or by older apps, have none.
alter table public.meetup_events add column if not exists create_key uuid;
create unique index if not exists meetup_events_create_key_idx
	on public.meetup_events (organizer_id, create_key) where create_key is not null;
