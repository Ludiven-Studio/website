-- Moderation for /rencontres and the PetanqueMeet app. Still no accounts:
-- players report a game, three distinct reporters hide it until a human looks.
-- A ban is permanent on the player uuid. Its IP hash only lasts 48 h and only
-- stops a never-seen uuid from creating: mobile carriers put thousands of people
-- behind one IP (CGNAT), so an IP must never lock out the players already there.
-- Same lockdown as the other meetup_* tables: RLS on, no policy, no grant — only
-- the `meetups` Edge Function reads or writes them.

-- ---------------------------------------------------------------- events & signups

alter table public.meetup_events
	add column if not exists hidden boolean not null default false,
	add column if not exists organizer_ip text,          -- peppered hash, see _shared/ipKey.ts
	-- Lets a player mute one organizer without ever seeing organizer_id, which is
	-- what the 3-active cap counts by. md5 of a random v4 uuid cannot be walked back.
	add column if not exists organizer_tag text
		generated always as (substr(md5(organizer_id::text), 1, 12)) stored;

alter table public.meetup_signups
	add column if not exists ip text;

-- ---------------------------------------------------------------- reports

create table if not exists public.meetup_reports (
	id uuid primary key default gen_random_uuid(),
	event_id uuid not null references public.meetup_events(id) on delete cascade,
	reporter_id uuid not null,
	reporter_ip text,
	reason text not null check (reason in ('name', 'fake', 'no_show', 'other')),
	-- null = the game itself; set = the organizer reporting a signed-up player absent
	target_player uuid,
	created_at timestamptz not null default now()
);

-- One report per reporter per game, and per target for the organizer's no-shows.
create unique index if not exists meetup_reports_once
	on public.meetup_reports (event_id, reporter_id, coalesce(target_player, '00000000-0000-0000-0000-000000000000'));
create index if not exists meetup_reports_target_idx on public.meetup_reports (target_player) where target_player is not null;

create index if not exists meetup_reports_event_idx on public.meetup_reports (event_id);
create index if not exists meetup_reports_ip_idx on public.meetup_reports (reporter_ip, created_at);

-- ---------------------------------------------------------------- bans

create table if not exists public.meetup_bans (
	subject text primary key,            -- a player uuid or a peppered IP hash
	kind text not null check (kind in ('player', 'ip')),
	event_id uuid,                       -- the game that led to it, for the record
	created_at timestamptz not null default now(),
	expires_at timestamptz               -- null = permanent (player); IP bans expire
);

-- ---------------------------------------------------------------- join

-- Same as before, plus: a hidden game takes no new player.
create or replace function public.meetup_join(
	p_event uuid,
	p_player uuid,
	p_name text,
	p_seats integer,
	p_role text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	v_event public.meetup_events;
	v_taken integer;
	v_mine integer;
begin
	select * into v_event from public.meetup_events where id = p_event for update;
	if not found then return 'unknown'; end if;
	if v_event.status <> 'open' then return 'cancelled'; end if;
	if v_event.hidden then return 'hidden'; end if;
	if v_event.ends_at < now() then return 'past'; end if;

	select coalesce(sum(seats), 0) into v_taken from public.meetup_signups where event_id = p_event;
	select coalesce(seats, 0) into v_mine from public.meetup_signups where event_id = p_event and player_id = p_player;

	-- Changing one's own seat count must compare against the others only.
	if v_event.organizer_seats + v_taken - v_mine + p_seats > v_event.players_needed then
		return 'full';
	end if;

	insert into public.meetup_signups (event_id, player_id, player_name, seats, role)
	values (p_event, p_player, p_name, p_seats, p_role)
	on conflict (event_id, player_id)
	do update set seats = excluded.seats, player_name = excluded.player_name, role = excluded.role;
	return 'ok';
end;
$$;

-- ---------------------------------------------------------------- lockdown

alter table public.meetup_reports enable row level security;
alter table public.meetup_bans enable row level security;

revoke all on table public.meetup_reports from anon, authenticated;
revoke all on table public.meetup_bans from anon, authenticated;
revoke all on function public.meetup_join(uuid, uuid, text, integer, text) from public, anon, authenticated;
