-- Cordes and Circuit allow unlimited daily attempts, so a player who has memorised
-- the day's board really can tie every rope in under 3 s. The old floor could not
-- tell that run from a forged instant-solve and silently dropped it. Lower it to 1 s:
-- still blocks a 0.01 s value, no longer blocks a human. Real protection would be a
-- seed replay in validateGameSpecific (still empty).

update public.games set min_duration_seconds = 1 where id in ('cordes', 'circuit');
