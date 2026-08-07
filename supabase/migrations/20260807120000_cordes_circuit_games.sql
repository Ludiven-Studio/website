-- Cordes, plus the row Circuit never got. Both store centiseconds on the base id: one row
-- serves the daily leaderboard and the levels progression, and min 3 s blocks an
-- instant-solve value. Without a row the Edge Functions answer "unknown game" and drop
-- the write, which is what Circuit has been doing silently since it shipped.

insert into public.games (id, name, metric, min_duration_seconds, value_units_per_second) values
	('cordes', 'Cordes', 'time', 3, 100),
	('circuit', 'Circuit', 'time', 3, 100)
on conflict (id) do nothing;
