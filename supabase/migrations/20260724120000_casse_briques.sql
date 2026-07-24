-- Casse-Briques (Breakout). Score metric (higher is better). Seed the games row so the
-- submit-score / submit-level Edge Functions accept its daily leaderboard and levels
-- progression writes. Attempts left null (unlimited) — the server keeps the player's
-- best, so the 5 daily tries can't inflate a score. Generous ceiling blocks only
-- console-forged values (a full clear scores in the low thousands).

insert into public.games (id, name, metric, max_score)
values ('casse-briques', 'Casse-Briques', 'score', 100000)
on conflict (id) do nothing;
