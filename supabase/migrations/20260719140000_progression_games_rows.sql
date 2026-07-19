-- Levels/progression mode uses each game's BASE id (e.g. 'golf') as game_id in
-- game_progress, which references games(id). The packed games (golf/angry/billard/
-- flechettes/reussite) only had '<id>-t' rows for the daily leaderboard, and
-- accords/pong/foot/alchimie had no row at all. Seed the missing base-id rows so the
-- submit-level Edge Function accepts their progression writes. metric matches each
-- game's LevelPlan (time = lower is better, score = higher). No daily quota applies
-- to progression, so the other rule columns stay null.

insert into public.games (id, name, metric) values
	('golf', 'Mini Golf', 'time'),
	('angry', 'Angry Cocotte', 'score'),
	('billard', 'Billard', 'time'),
	('flechettes', 'Fléchettes', 'score'),
	('reussite', 'Réussite', 'time'),
	('accords', 'Accords & Gouffres', 'score'),
	('pong', 'Pong', 'score'),
	('foot', 'Foot', 'score'),
	('alchimie', 'Alchimie', 'time')
on conflict (id) do nothing;
