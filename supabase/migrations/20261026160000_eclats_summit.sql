-- Dragon's Gems Swipe: the app's « Défi du sommet » (unlocked after level 250), endless play on one fixed board shared
-- by everyone, ranked all-time in points. Free-play rows: challenge_date null, appended by submit-score, like 'eclats-inf'.

insert into public.games (id, name, metric, max_score, min_duration_seconds) values
	('eclats-sommet', 'Dragon''s Gems Swipe', 'score', 10000000, 5)
on conflict (id) do nothing;
