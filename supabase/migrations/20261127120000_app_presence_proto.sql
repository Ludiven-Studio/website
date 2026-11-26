-- Pétanque Game 1.0.20 beats with its online protocol (OnlineService.Protocol): a phone is counted, and told a
-- search, only among the phones of its own protocol (Raphaël, 2026-11-26: « en 1.0.20, la liste des joueurs en
-- ligne ne montre que ceux qui ont une version compatible »). A 1.0.14 search (protocol 13) was told to 1.0.19
-- phones that could not join it. The phones before 1.0.20 beat without one, and nothing in their beats tells 1.0.14
-- (13) from 1.0.16-1.0.19 (14): they count with protocol 14, and their searches are told to a 1.0.20 phone without a
-- protocol, which offers one only once Unity lists its game among the protocol's open games (Presence.cs, 1.0.20).
-- A 1.0.20 phone is never offered a 1.0.14 search; it counts the few 1.0.14 phones left. Searches of its own
-- protocol come first.
-- The five-argument presence_beat_seek stays for the function deployed before this one: it beats with no protocol.

alter table public.app_presence add column if not exists proto text;

-- One beat, the search with it or none: the count and the newest search heard in the last 45 s, both among the
-- phones of the caller's protocol, those without one going with 14; the caller's own search left out.
create or replace function public.presence_beat_seek(p_app text, p_session uuid, p_nick text, p_players smallint, p_game text, p_proto text)
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
	insert into public.app_presence (app, session, seen, beats, seek_nick, seek_players, seek_game, seek_since, proto)
	values (p_app, p_session, now(), 1,
		case when searching then p_nick end, case when searching then p_players end,
		case when searching then p_game end, case when searching then now() end, p_proto)
	on conflict (app, session) do update set
		seen = excluded.seen,
		beats = least(public.app_presence.beats + 1, 2),
		seek_nick = excluded.seek_nick,
		seek_players = excluded.seek_players,
		seek_game = excluded.seek_game,
		seek_since = case
			when excluded.seek_game is null then null
			when public.app_presence.seek_game is distinct from excluded.seek_game then now()
			else public.app_presence.seek_since end,
		proto = excluded.proto;
	delete from public.app_presence where seen < now() - interval '7 minutes';
	select count(*) into n from public.app_presence
	where app = p_app and (proto is not distinct from p_proto or (proto is null and p_proto = '14') or (p_proto is null and proto = '14'))
		and seen > now() - interval '6 minutes' and (beats >= 2 or session = p_session);
	select seek_nick, seek_players, seek_game, seek_since, proto into s from public.app_presence
	where app = p_app and (proto is not distinct from p_proto or (proto is null and p_proto = '14') or (p_proto is null and proto = '14'))
		and session <> p_session and seek_game is not null and beats >= 2 and seen > now() - interval '45 seconds'
	order by proto is distinct from p_proto, seek_since desc limit 1;
	return jsonb_build_object('online', n, 'seeker', case when s.seek_game is null then null else jsonb_build_object(
		'nick', s.seek_nick, 'players', s.seek_players, 'game', s.seek_game, 'proto', s.proto,
		'since', floor(extract(epoch from s.seek_since))::bigint) end);
end;
$$;

revoke all on function public.presence_beat_seek(text, uuid, text, smallint, text, text) from public, anon, authenticated;

create or replace function public.presence_beat_seek(p_app text, p_session uuid, p_nick text, p_players smallint, p_game text)
returns jsonb
language sql
security definer
set search_path = public
as $$
	select public.presence_beat_seek(p_app, p_session, p_nick, p_players, p_game, null::text);
$$;

revoke all on function public.presence_beat_seek(text, uuid, text, smallint, text) from public, anon, authenticated;
