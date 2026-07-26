-- Tectonique. Two rows: the base id carries the levels progression, 'tectonique-t' the
-- daily leaderboard whose score packs (moves, centiseconds). Both ride the 'time' metric
-- because both values are already ascending-is-better. No ceiling: the packed value has
-- no meaningful upper bound, and a bad one would reject honest slow runs.

insert into public.games (id, name, metric) values
	('tectonique', 'Tectonique', 'time'),
	('tectonique-t', 'Tectonique', 'time')
on conflict (id) do nothing;
