-- La Mine aux Cocottes (match-3). Score metric (higher is better). Seed the games
-- row so the submit-score / submit-level Edge Functions accept its daily leaderboard
-- and levels-progression writes. Generous ceilings — they only block console-forged
-- values (a big cascade run scores in the low tens of thousands).

insert into public.games (id, name, metric, max_score, max_attempts_per_day)
values ('mine', 'La Mine aux Cocottes', 'score', 2000000, 1)
on conflict (id) do nothing;
