-- "Rencontres" — the public map of pétanque games (/rencontres). No accounts:
-- identity is the browser's playerId() uuid, and an organizer proves ownership
-- with the per-event `secret`.
--
-- RLS is enabled with NO policies on every table, like courses_*: nothing is
-- readable or writable through the data API, reads included. Every access goes
-- through the `meetups` Edge Function (service_role, bypasses RLS). That is
-- stricter than the games/game_scores model on purpose — `secret` lives in
-- meetup_events, and the only way it can never leak is for the table to have no
-- reader at all outside the function.

-- ---------------------------------------------------------------- spots

create table if not exists public.meetup_spots (
	id uuid primary key default gen_random_uuid(),
	lat double precision not null,
	lng double precision not null,
	label text not null default '',      -- written by the Edge Function only (reverse geocoding)
	commune text not null default '',
	source text not null default 'user' check (source in ('osm', 'user')),
	osm_id text,                         -- "node/123456" — the seed's idempotency key
	confirmed boolean not null default false,
	first_organizer uuid,                -- who pinned it; a SECOND distinct one promotes the spot
	created_at timestamptz not null default now()
);

create unique index if not exists meetup_spots_osm_uniq
	on public.meetup_spots (osm_id) where osm_id is not null;
-- The 30 m merge scans by bounding box first, so latitude leads the index.
create index if not exists meetup_spots_bbox_idx on public.meetup_spots (lat, lng);

-- ---------------------------------------------------------------- events

create table if not exists public.meetup_events (
	id uuid primary key default gen_random_uuid(),
	spot_id uuid not null references public.meetup_spots(id),
	starts_at timestamptz not null,
	ends_at timestamptz not null,        -- drives expiry: the read filter hides ends_at < now()
	format text not null check (format in ('tete-a-tete', 'doublette', 'triplette', 'melee', 'mini-tournoi')),
	players_needed integer not null check (players_needed in (2, 4, 6, 8, 12, 16)),
	role_needed text not null default 'any' check (role_needed in ('any', 'tireur', 'pointeur')),
	organizer_id uuid not null,
	organizer_name text not null,
	organizer_seats integer not null default 1 check (organizer_seats between 1 and 4),
	secret text not null default gen_random_uuid()::text,  -- NEVER returned by a read
	status text not null default 'open' check (status in ('open', 'cancelled')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists meetup_events_window_idx on public.meetup_events (ends_at, status);
create index if not exists meetup_events_organizer_idx on public.meetup_events (organizer_id);

-- ---------------------------------------------------------------- signups

create table if not exists public.meetup_signups (
	id uuid primary key default gen_random_uuid(),
	event_id uuid not null references public.meetup_events(id) on delete cascade,
	player_id uuid not null,
	player_name text not null,
	seats integer not null default 1 check (seats between 1 and 4),
	role text not null default 'any' check (role in ('any', 'tireur', 'pointeur')),
	created_at timestamptz not null default now(),
	unique (event_id, player_id)         -- join once, then change `seats`
);

create index if not exists meetup_signups_event_idx on public.meetup_signups (event_id);

-- ---------------------------------------------------------------- abuse control

-- One row per (kind, subject, Paris day). `subject` is a player uuid OR a
-- peppered IP hash — never a raw IP: bare-hashed IPv4 is walkable in minutes,
-- so it would still be personal data.
create table if not exists public.meetup_quota (
	kind text not null check (kind in ('player', 'ip')),
	subject text not null,
	day date not null,
	creates integer not null default 0,
	joins integer not null default 0,
	primary key (kind, subject, day)
);

-- Nominatim's usage policy allows 1 request/s. One row, one timestamp.
create table if not exists public.meetup_geocode_throttle (
	id boolean primary key default true check (id),
	last_at timestamptz not null default 'epoch'
);
insert into public.meetup_geocode_throttle (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- functions

-- Reuse a spot within 30 m, or create one. Bounding box first (indexed), exact
-- haversine second — no PostGIS for a single distance test.
-- A user spot is born unconfirmed and shown hollow; a SECOND distinct organizer
-- posting there promotes it. A pin in someone's garden stays hollow and dies on
-- its own. No moderator.
create or replace function public.meetup_upsert_spot(
	p_lat double precision,
	p_lng double precision,
	p_organizer uuid,
	p_source text default 'user',
	p_osm_id text default null,
	p_label text default '',
	p_commune text default ''
) returns public.meetup_spots
language plpgsql
security definer
set search_path = public
as $$
declare
	v_spot public.meetup_spots;
	v_dlat double precision := 30.0 / 6371000.0 * 180.0 / pi();
	v_dlng double precision;
begin
	if p_osm_id is not null then
		select * into v_spot from public.meetup_spots where osm_id = p_osm_id;
		if found then return v_spot; end if;
	end if;

	v_dlng := v_dlat / greatest(0.01, cos(radians(p_lat)));

	select * into v_spot
	from public.meetup_spots s
	where s.lat between p_lat - v_dlat and p_lat + v_dlat
	  and s.lng between p_lng - v_dlng and p_lng + v_dlng
	  and 2 * 6371000.0 * asin(least(1.0, sqrt(
			sin(radians(s.lat - p_lat) / 2) ^ 2
			+ cos(radians(p_lat)) * cos(radians(s.lat)) * sin(radians(s.lng - p_lng) / 2) ^ 2
		))) <= 30.0
	order by 2 * 6371000.0 * asin(least(1.0, sqrt(
			sin(radians(s.lat - p_lat) / 2) ^ 2
			+ cos(radians(p_lat)) * cos(radians(s.lat)) * sin(radians(s.lng - p_lng) / 2) ^ 2
		)))
	limit 1;

	if found then
		if not v_spot.confirmed and p_organizer is not null
			and v_spot.first_organizer is not null and v_spot.first_organizer <> p_organizer then
			update public.meetup_spots set confirmed = true where id = v_spot.id returning * into v_spot;
		end if;
		return v_spot;
	end if;

	insert into public.meetup_spots (lat, lng, label, commune, source, osm_id, confirmed, first_organizer)
	values (p_lat, p_lng, p_label, p_commune, p_source, p_osm_id, p_source = 'osm', p_organizer)
	returning * into v_spot;
	return v_spot;
end;
$$;

-- Seat counting is the one race that matters: two people tapping "je viens" on
-- the last seat must not both get it. supabase-js has no transaction API, so the
-- lock has to live here — `for update` holds the event row for the whole check.
-- Returns 'ok' | 'full' | 'cancelled' | 'past' | 'unknown'.
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

-- Count one action against a (kind, subject) for the Paris day. Returns the new
-- count so the caller can refuse above the cap without a second round-trip.
create or replace function public.meetup_bump_quota(
	p_kind text,
	p_subject text,
	p_day date,
	p_creates integer default 0,
	p_joins integer default 0
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	v_row public.meetup_quota;
begin
	insert into public.meetup_quota (kind, subject, day, creates, joins)
	values (p_kind, p_subject, p_day, p_creates, p_joins)
	on conflict (kind, subject, day)
	do update set creates = public.meetup_quota.creates + p_creates,
	              joins = public.meetup_quota.joins + p_joins
	returning * into v_row;
	return case when p_creates > 0 then v_row.creates else v_row.joins end;
end;
$$;

-- ---------------------------------------------------------------- lockdown

alter table public.meetup_spots enable row level security;
alter table public.meetup_events enable row level security;
alter table public.meetup_signups enable row level security;
alter table public.meetup_quota enable row level security;
alter table public.meetup_geocode_throttle enable row level security;

-- These are security definer, so a leftover execute grant would hand anon a
-- writable door straight past RLS. Only service_role ever calls them.
revoke all on function public.meetup_upsert_spot(double precision, double precision, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.meetup_join(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.meetup_bump_quota(text, text, date, integer, integer) from public, anon, authenticated;
