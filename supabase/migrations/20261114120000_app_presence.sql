-- How many play an app right now: each phone in the app says so once a minute (app-presence),
-- under a random id made at each launch, and is counted while it was heard in the last two minutes.
-- No player id, no IP: a row is gone a few minutes after the app is closed.
-- Only the function touches it (RLS on, no policy).

create table if not exists public.app_presence (
	app text not null,
	session uuid not null,
	seen timestamptz not null default now(),
	primary key (app, session)
);

alter table public.app_presence enable row level security;

-- One beat: this session seen now, the silent ones dropped, the app's count back.
create or replace function public.presence_beat(p_app text, p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	n integer;
begin
	insert into public.app_presence (app, session, seen)
	values (p_app, p_session, now())
	on conflict (app, session) do update set seen = excluded.seen;
	delete from public.app_presence where seen < now() - interval '3 minutes';
	select count(*) into n from public.app_presence where app = p_app and seen > now() - interval '2 minutes';
	return n;
end;
$$;

revoke all on function public.presence_beat(text, uuid) from public, anon, authenticated;
