-- A small copy of the poster for the map cards, stored next to it as <name>_t.jpg.
-- Posters sent before thumbnails have none: the cards fall back to the full image.
alter table public.meetup_tournaments
	add column if not exists poster_has_thumb boolean not null default false;
