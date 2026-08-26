-- Souffle & Feuilles. Base ids carry the levels progression. 'souffle-t' holds the
-- daily leaderboard whose score packs (gusts, centiseconds) — ascending-is-better,
-- so it rides the 'time' metric with no derivable duration. 'feuilles' ranks the
-- daily chrono directly in centiseconds; the rain alone makes a run under ~15 s
-- impossible, so min 10 s blocks an instant-solve value.

insert into public.games (id, name, metric, min_duration_seconds, value_units_per_second) values
	('souffle', 'Souffle', 'time', null, null),
	('souffle-t', 'Souffle', 'time', null, null),
	('feuilles', 'Feuilles', 'time', 10, 100)
on conflict (id) do nothing;
