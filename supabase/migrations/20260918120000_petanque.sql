-- Pétanque. Two rows: the base id carries the levels progression (submit-level), 'petanque-t'
-- the daily shooting-course leaderboard whose score packs (60 - points, centiseconds).
--
-- The base row is NOT optional: submit-level answers "unknown game" and drops the write without
-- it, which is what Circuit did silently for months. Levels shipped before this row existed.
--
-- 'petanque-t' deliberately sets no value_units_per_second: the metric is 'time' only because the
-- packed value is already ascending-is-better, and dividing a packed value by 100 would yield a
-- meaningless "duration". Same reason golf-t and bulles-t leave it null.

insert into public.games (id, name, metric, max_score) values
	('petanque', 'Pétanque', 'score', 13),
	('petanque-t', 'Pétanque', 'time', null)
on conflict (id) do nothing;
