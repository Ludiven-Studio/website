-- Éclats. Two rows: the base id carries the levels progression, 'eclats-t' the daily
-- leaderboard whose score packs (pieces, centiseconds). Both ride the 'time' metric
-- because both values are already ascending-is-better.

insert into public.games (id, name, metric) values
	('eclats', 'Éclats', 'time'),
	('eclats-t', 'Éclats', 'time')
on conflict (id) do nothing;
