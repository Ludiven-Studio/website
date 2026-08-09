-- Bulles. Two rows: the base id carries the levels progression, 'bulles-t' the daily
-- leaderboard whose score packs (shots, centiseconds). Both ride the 'time' metric
-- because both values are already ascending-is-better.

insert into public.games (id, name, metric) values
	('bulles', 'Bulles', 'time'),
	('bulles-t', 'Bulles', 'time')
on conflict (id) do nothing;
