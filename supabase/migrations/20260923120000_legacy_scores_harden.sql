-- Harden the legacy `scores` table (read by the "record du jour" cards and /jeux/defi).
--
-- submit_score used to purge `day < p_day` with the CALLER's p_day: one anon call with
-- p_day = '9999-12-31' wiped the whole table. It also let anon write any game, so a forged
-- row could sit on top of a secured game's card.
--
-- Now:
--  * the day comes from the server (Europe/Paris, like submit-score and src/lib/day.ts);
--    p_day may only be today or yesterday (a run that ends across midnight);
--  * anon may only write the games that have not moved to submit-score yet; every other
--    game is fed by the submit-score bridge, which calls as service_role;
--  * direct table writes are gone: the RPC is the only door.
-- Idempotent.

create or replace function public.submit_score(
  p_game text, p_day text, p_name text, p_value bigint, p_metric text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_day date;
  v_role text := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
begin
  begin
    v_day := p_day::date;
  exception when others then
    raise exception 'bad day';
  end;
  if v_day not between v_today - 1 and v_today then raise exception 'bad day'; end if;
  if p_metric not in ('time', 'score') then raise exception 'bad metric'; end if;
  if p_value is null or p_value < 0 then raise exception 'bad value'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 then raise exception 'bad name'; end if;
  if p_game is null or p_game !~ '^[a-z0-9-]{1,40}$' then raise exception 'bad game'; end if;
  -- Keep in sync with the games that are NOT in src/data/securedGames.ts.
  if v_role <> 'service_role' and p_game not in ('alchimie-t', 'bolides', 'pong', 'foot') then
    raise exception 'game goes through submit-score';
  end if;

  delete from public.scores where day < v_today - 1;

  insert into public.scores (game, day, name, value, metric)
  values (p_game, v_day, btrim(p_name), p_value, p_metric)
  on conflict (game, day, lower(name)) do update
    set value = excluded.value, created_at = now()
    where (p_metric = 'time'  and excluded.value < scores.value)
       or (p_metric = 'score' and excluded.value > scores.value);
end;
$$;

revoke all on function public.submit_score(text, text, text, bigint, text) from public;
grant execute on function public.submit_score(text, text, text, bigint, text) to anon, authenticated, service_role;

drop policy if exists "Public insert guarded" on public.scores;
revoke insert, update, delete, truncate, references, trigger on table public.scores from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.game_scores from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.game_progress from anon, authenticated;
