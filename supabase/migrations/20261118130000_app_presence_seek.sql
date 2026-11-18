-- Who looks for an opponent right now (Pétanque Game 1.0.14): a phone searching for an online game says so
-- in its beats, with the name it plays under, the format and the Unity session to join; the phones in the
-- menus are told the newest search, so a player waiting gets an opponent. Only while it searches: a beat
-- without it clears the row's search, and rows still go a few minutes after the last beat.

alter table public.app_presence add column if not exists seek_nick text;
alter table public.app_presence add column if not exists seek_players smallint;
alter table public.app_presence add column if not exists seek_game text;
alter table public.app_presence add column if not exists seek_since timestamptz;

-- One beat, the search with it or none: the app's count and the newest search heard in the last 45 s
-- (a searching phone beats every 15 s), the caller's own left out. presence_beat stays for the 1.0.13 phones.
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
	delete from public.app_presence where seen < now() - interval '3 minutes';
	select count(*) into n from public.app_presence
	where app = p_app and seen > now() - interval '2 minutes' and (beats >= 2 or session = p_session);
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
