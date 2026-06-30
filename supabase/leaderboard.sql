-- Ludiven Studio — leaderboard storage hardening.
-- Goal: keep ONE row per (game, day, player) — always the player's BEST — and reset daily
-- (past days are purged on every submit) so the table never bloats.
--
-- Apply once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Assumes a `public.scores` table with columns: game text, day text, name text,
-- value (int/bigint), metric text, created_at timestamptz default now()
-- (plus the existing `get_daily` RPC, untouched here).

-- 1) Collapse existing duplicates: keep each player's best row per (game, day, lower(name)).
--    'time'  → lowest value wins (fewest strokes then least time, via the encoded score).
--    'score' → highest value wins. Ties broken by ctid (stable, arbitrary).
delete from public.scores a
using public.scores b
where a.ctid <> b.ctid
  and a.game = b.game
  and a.day = b.day
  and lower(a.name) = lower(b.name)
  and (
        (a.metric = 'time'  and (b.value < a.value or (b.value = a.value and b.ctid < a.ctid)))
     or (a.metric = 'score' and (b.value > a.value or (b.value = a.value and b.ctid < a.ctid)))
  );

-- 2) Enforce one row per player per game per day (case-insensitive, matching the client dedupe).
create unique index if not exists scores_game_day_name_uniq
  on public.scores (game, day, lower(name));

-- 3) Conditional upsert: insert, or update only when the new value is actually better.
--    Also purges past days so storage stays minimal ("reset every day").
create or replace function public.submit_score(
  p_game text, p_day text, p_name text, p_value bigint, p_metric text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scores where day < p_day; -- daily reset: drop yesterday and older

  insert into public.scores (game, day, name, value, metric)
  values (p_game, p_day, p_name, p_value, p_metric)
  on conflict (game, day, lower(name)) do update
    set value = excluded.value, created_at = now()
    where (p_metric = 'time'  and excluded.value < scores.value)   -- keep the min (time / strokes)
       or (p_metric = 'score' and excluded.value > scores.value);  -- keep the max (points)
end;
$$;

-- 4) Let the anon key call it (same as get_daily). The function is SECURITY DEFINER,
--    so it writes regardless of row-level-security on the table.
grant execute on function public.submit_score(text, text, text, bigint, text) to anon;
