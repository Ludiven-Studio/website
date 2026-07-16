-- Add value_units_per_second (time games: value ÷ this = seconds → server derives the
-- run length from the value itself, which the client can't forge) and seed the full
-- batch of simple score/time games onto the secure path.
--
-- Rules kept deliberately loose ("generic first"): score games get a generous ceiling
-- (blocks console-forged values, never a real run); time games get a min solve time
-- derived from the value (blocks instant-solve). Attempts left null (unlimited) — the
-- server always keeps the player's best, so replays can't inflate a score.

alter table public.games
	add column if not exists value_units_per_second numeric; -- 100 = centiseconds, 1000 = ms, null = not a duration

-- Backfill the pilot: sudoku stores centiseconds.
update public.games set value_units_per_second = 100 where id = 'sudoku' and value_units_per_second is null;

-- Score games (higher is better). Generous ceilings.
insert into public.games (id, name, metric, max_score) values
	('snake', 'Snake', 'score', 100000),
	('flappy', 'Flappy Cocotte', 'score', 100000),
	('tempo', 'Tempo', 'score', 2000000),
	('spectro', 'Spectro', 'score', 2000000),
	('cocottes-renards', 'Cocottes vs Renards', 'score', 500000),
	('meli-melo', 'Méli-Mélo', 'score', 100000),
	('esquive', 'Esquive', 'score', 500000)
on conflict (id) do nothing;

-- Time games storing CENTISECONDS (value ÷ 100 = seconds). min 3s blocks instant-solve.
insert into public.games (id, name, metric, min_duration_seconds, value_units_per_second) values
	('mots-tournes', 'Mots Tournés', 'time', 3, 100),
	('mots-meles', 'Mots Mêlés', 'time', 3, 100),
	('lettres-croisees', 'Lettres Croisées', 'time', 3, 100),
	('suite', 'Suite', 'time', 3, 100),
	('calcudoku', 'Calcudoku', 'time', 3, 100),
	('tubes', 'Tubes', 'time', 3, 100),
	('suguru', 'Suguru', 'time', 3, 100),
	('somme-toute', 'Somme Toute', 'time', 3, 100),
	('colorgramme', 'Colorgramme', 'time', 3, 100),
	('solitaire', 'Solitaire', 'time', 3, 100),
	('rond-carre', 'Rond Carré', 'time', 3, 100),
	('motifs', 'Motifs', 'time', 3, 100),
	('aquarium', 'Aquarium', 'time', 3, 100),
	('pavage', 'Pavage', 'time', 3, 100),
	('chemin', 'Chemin', 'time', 3, 100),
	('fruits', 'Fruits', 'time', 3, 100),
	('tente', 'Tente', 'time', 3, 100),
	('matrices', 'Matrices', 'time', 3, 100),
	('symboles', 'Symboles', 'time', 3, 100),
	('reines', 'Reines', 'time', 3, 100)
on conflict (id) do nothing;

-- Drift: lap time in MILLISECONDS (value ÷ 1000 = seconds).
insert into public.games (id, name, metric, min_duration_seconds, value_units_per_second) values
	('drift', 'Drift', 'time', 3, 1000)
on conflict (id) do nothing;

-- Bataille: value = number of shots (a count, not a duration). Lower is better, but no
-- time can be derived → no min check; existence + best-retained + ordering still apply.
insert into public.games (id, name, metric) values
	('bataille', 'Bataille navale', 'time')
on conflict (id) do nothing;
