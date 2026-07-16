-- Migrate the last two families onto the secure path. Both ride the 'time' metric:
-- their encoded value is already ascending-is-better, so ordering + best-retained work
-- on the raw integer with no decode. No run-length can be derived from the value, so no
-- min-time rule (existence + quota + best-retained + the RLS write-lock still apply —
-- the write-lock alone kills the "insert any row from the console" cheat). Tightening to
-- per-game seed-replay validation is a later step (validateGameSpecific).

-- Packed count+time (logged under `<id>-t`): golf/angry/billard/flechettes/reussite.
insert into public.games (id, name, metric) values
	('golf-t', 'Mini Golf', 'time'),
	('angry-t', 'Angry Cocotte', 'time'),
	('billard-t', 'Billard', 'time'),
	('flechettes-t', 'Fléchettes', 'time'),
	('reussite-t', 'Réussite', 'time')
on conflict (id) do nothing;

-- Threshold win/loss bands: demineur/codecolor/mot-secret.
insert into public.games (id, name, metric) values
	('demineur', 'Démineur', 'time'),
	('codecolor', 'CodeColor', 'time'),
	('mot-secret', 'Mot Secret', 'time')
on conflict (id) do nothing;
