-- The Copa Coruñesa challenge board: one 10-boule course for the whole run-up to the tournament.
-- Rows go in as free play (no challenge date), so the board spans every day until the event; the
-- client keeps each player's best. Same packed value as 'petanque-t': (50 - points, centiseconds),
-- ascending-is-better, hence metric 'time' and no value_units_per_second.
insert into public.games (id, name, metric, max_score) values
	('petanque-coruna-2026-t', 'Pétanque · Copa Coruñesa 2026', 'time', null)
on conflict (id) do nothing;
