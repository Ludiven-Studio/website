-- Tournament listings for the PetanqueMeet app: a club or an association announces
-- a tournament on the map. No seats and no signups; players call the organizer.
-- The poster image is optional and stays private until the moderator approves it.
-- Same lockdown as the other meetup_* tables: RLS on, no policy, no grant — only
-- the `meetups` Edge Function reads or writes them.

create table if not exists public.meetup_tournaments (
	id uuid primary key default gen_random_uuid(),
	organizer_id uuid not null,
	organizer_ip text,                   -- peppered hash, see _shared/ipKey.ts
	organizer_tag text generated always as (substr(md5(organizer_id::text), 1, 12)) stored,
	spot_id uuid not null references public.meetup_spots(id),
	club_name text not null,
	title text not null,
	starts_at timestamptz not null,
	format text not null check (format in ('tete-a-tete', 'doublette', 'triplette')),
	category text not null check (category in ('open', 'veterans', 'feminin', 'jeunes', 'mixte')),
	entry_fee_cents integer check (entry_fee_cents between 0 and 100000),
	details text,
	contact_phone text,
	poster_status text not null default 'none' check (poster_status in ('none', 'pending', 'approved', 'rejected')),
	poster_path text,                    -- object name; in posters-pending until approved, then in posters
	status text not null default 'open' check (status in ('open', 'cancelled')),
	hidden boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists meetup_tournaments_open_idx on public.meetup_tournaments (starts_at) where status = 'open' and not hidden;
create index if not exists meetup_tournaments_organizer_idx on public.meetup_tournaments (organizer_id);

alter table public.meetup_tournaments enable row level security;
revoke all on public.meetup_tournaments from anon, authenticated;

-- Kept apart from meetup_reports so its unique index and FK stay untouched.
create table if not exists public.meetup_tournament_reports (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.meetup_tournaments(id) on delete cascade,
	reporter_id uuid not null,
	reporter_ip text,
	reason text not null check (reason in ('poster', 'fake', 'wrong_info', 'other')),
	created_at timestamptz not null default now(),
	unique (tournament_id, reporter_id)
);

create index if not exists meetup_tournament_reports_ip_idx on public.meetup_tournament_reports (reporter_ip, created_at);

alter table public.meetup_tournament_reports enable row level security;
revoke all on public.meetup_tournament_reports from anon, authenticated;

-- Posters. Pending ones are private: the moderator sees them through a short
-- signed URL. Only approved ones are copied to the public bucket. No
-- storage.objects policy, so only the service role (the function) writes either.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters-pending', 'posters-pending', false, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
