-- Add metric direction so time-based games (lower is better) share the generic
-- score system with score-based games. Seed the two pilot games (2048, sudoku).

alter table public.games
	add column if not exists metric text not null default 'score'
	check (metric in ('time', 'score'));

-- 2048: score (higher is better), single daily attempt, 10-minute cap.
--   Ceilings are generous — they only need to block console-forged values.
insert into public.games (id, name, metric, min_duration_seconds, max_score, max_score_per_second, max_attempts_per_day)
values ('2048', '2048', 'score', 3, 500000, 1000, 1)
on conflict (id) do nothing;

-- Sudoku: time (lower is better), value = centiseconds. min_duration rejects
--   impossibly fast "instant solve" cheats. Score-rate/ceiling don't apply → null.
insert into public.games (id, name, metric, min_duration_seconds, max_attempts_per_day)
values ('sudoku', 'Sudoku', 'time', 10, 1)
on conflict (id) do nothing;
