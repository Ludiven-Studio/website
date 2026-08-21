-- Lumen: daily leaderboard + levels progression on the base id, centiseconds,
-- min 3 s to block an instant-solve value.

insert into public.games (id, name, metric, min_duration_seconds, value_units_per_second) values
	('lumen', 'Lumen', 'time', 3, 100)
on conflict (id) do nothing;
