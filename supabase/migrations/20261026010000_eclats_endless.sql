-- Dragon's Gems Swipe: endless play's all-time leaderboard, in points (the app's « Mode infini », the
-- website's free play in the Moyen tier). Free-play rows: challenge_date null, appended by submit-score.
-- The daily keeps its own row, 'eclats-t'.

insert into public.games (id, name, metric, max_score, min_duration_seconds) values
	('eclats-inf', 'Dragon''s Gems Swipe', 'score', 10000000, 5)
on conflict (id) do nothing;
