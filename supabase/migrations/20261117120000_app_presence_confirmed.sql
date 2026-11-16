-- A session counts once it has beaten twice (a real phone beats once a minute while the app is in front), so
-- a forged id posted once adds nothing: a forger must keep every id beating, which the function's per-IP
-- limits bound. The phone asking always counts itself. Rows still go a few minutes after the last beat.

alter table public.app_presence add column if not exists beats smallint not null default 1;

create or replace function public.presence_beat(p_app text, p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	n integer;
begin
	insert into public.app_presence (app, session, seen, beats)
	values (p_app, p_session, now(), 1)
	on conflict (app, session) do update set seen = excluded.seen, beats = least(public.app_presence.beats + 1, 2);
	delete from public.app_presence where seen < now() - interval '3 minutes';
	select count(*) into n from public.app_presence
	where app = p_app and seen > now() - interval '2 minutes' and (beats >= 2 or session = p_session);
	return n;
end;
$$;

revoke all on function public.presence_beat(text, uuid) from public, anon, authenticated;
