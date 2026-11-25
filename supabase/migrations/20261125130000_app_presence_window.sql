-- Pétanque Game 1.0.17 beats every 5 min while no online screen is open (15 s while searching, 5 s on an online
-- screen), not every minute: its beats were 91 % of the project's function calls and would use up the Free plan's
-- month (Raphaël, 2026-11-25). A phone is counted while heard in the last 6 minutes (was 2), rows go after 7 (was 3),
-- so a phone beating every 5 min stays counted. The search window stays 45 s: a searching phone still beats every 15 s.
-- The other apps' phones beating every minute are counted as before, a few minutes longer after they leave.

create or replace function public.presence_beat_seek(p_app text, p_session uuid, p_nick text, p_players smallint, p_game text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	n integer;
	s record;
	searching boolean := p_nick is not null and p_game is not null;
begin
	insert into public.app_presence (app, session, seen, beats, seek_nick, seek_players, seek_game, seek_since)
	values (p_app, p_session, now(), 1,
		case when searching then p_nick end, case when searching then p_players end,
		case when searching then p_game end, case when searching then now() end)
	on conflict (app, session) do update set
		seen = excluded.seen,
		beats = least(public.app_presence.beats + 1, 2),
		seek_nick = excluded.seek_nick,
		seek_players = excluded.seek_players,
		seek_game = excluded.seek_game,
		seek_since = case
			when excluded.seek_game is null then null
			when public.app_presence.seek_game is distinct from excluded.seek_game then now()
			else public.app_presence.seek_since end;
	delete from public.app_presence where seen < now() - interval '7 minutes';
	select count(*) into n from public.app_presence
	where app = p_app and seen > now() - interval '6 minutes' and (beats >= 2 or session = p_session);
	select seek_nick, seek_players, seek_game, seek_since into s from public.app_presence
	where app = p_app and session <> p_session and seek_game is not null and beats >= 2
		and seen > now() - interval '45 seconds'
	order by seek_since desc limit 1;
	return jsonb_build_object('online', n, 'seeker', case when s.seek_game is null then null else jsonb_build_object(
		'nick', s.seek_nick, 'players', s.seek_players, 'game', s.seek_game,
		'since', floor(extract(epoch from s.seek_since))::bigint) end);
end;
$$;

revoke all on function public.presence_beat_seek(text, uuid, text, smallint, text) from public, anon, authenticated;
