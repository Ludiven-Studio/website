-- Cocotte Mineuse: score = max depth (1 pt/m) + collected ore values + jewel craft
-- bonuses. Generic-first bounds: real runs are lamp-limited (well over 10s) and accrue
-- score far below 150 pts/s; 50000 blocks console-forged values without capping play.
insert into public.games (id, name, metric, min_duration_seconds, max_score, max_score_per_second, max_attempts_per_day) values
	('cocotte-mineuse', 'Cocotte Mineuse', 'score', 10, 50000, 150, 10)
on conflict (id) do nothing;
