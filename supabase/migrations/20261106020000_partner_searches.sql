-- Partner searches for the PetanqueMeet app: a player, or two who need a third, look
-- for teammates for one contest of a tournament. The phone number is never listed:
-- the function gives it to one signed-in player at a time, and counts each request.
-- A search goes, with its number, when its contest starts or its author closes it.
-- Same lockdown as the other meetup_* tables: RLS on, no policy, no grant — only
-- the `meetups` Edge Function reads or writes them.

create table if not exists public.meetup_partner_searches (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.meetup_tournaments(id) on delete cascade,
	player_id uuid not null,
	player_ip text,                      -- peppered hash, see _shared/ipKey.ts
	first_name text not null,
	poster text not null check (poster in ('solo', 'pair')),
	contest_starts_at timestamptz not null,
	format text not null check (format in ('doublette', 'triplette')),
	category text not null check (category in ('open', 'veterans', 'feminin', 'jeunes', 'mixte')),
	level text not null check (level in ('loisir', 'confirme', 'competition')),
	note text not null default '' check (char_length(note) <= 120),
	phone text not null check (phone ~ '^0[1-9][0-9]{8}$'),
	hidden boolean not null default false,
	created_at timestamptz not null default now(),
	-- A pair in doublette is already a team.
	check (not (poster = 'pair' and format = 'doublette')),
	unique (tournament_id, player_id)
);

create index if not exists meetup_partner_searches_tournament_idx
	on public.meetup_partner_searches (tournament_id, contest_starts_at) where not hidden;
create index if not exists meetup_partner_searches_player_idx on public.meetup_partner_searches (player_id);
create index if not exists meetup_partner_searches_start_idx on public.meetup_partner_searches (contest_starts_at);

alter table public.meetup_partner_searches enable row level security;
revoke all on public.meetup_partner_searches from anon, authenticated;

-- Who asked for which number: the author sees the count, the daily caps read it.
create table if not exists public.meetup_partner_contacts (
	search_id uuid not null references public.meetup_partner_searches(id) on delete cascade,
	player_id uuid not null,
	player_ip text,
	created_at timestamptz not null default now(),
	primary key (search_id, player_id)
);

create index if not exists meetup_partner_contacts_player_idx on public.meetup_partner_contacts (player_id, created_at);
create index if not exists meetup_partner_contacts_ip_idx on public.meetup_partner_contacts (player_ip, created_at);

alter table public.meetup_partner_contacts enable row level security;
revoke all on public.meetup_partner_contacts from anon, authenticated;

create table if not exists public.meetup_partner_reports (
	id uuid primary key default gen_random_uuid(),
	search_id uuid not null references public.meetup_partner_searches(id) on delete cascade,
	reporter_id uuid not null,
	reporter_ip text,
	reason text not null check (reason in ('fake', 'offensive', 'other')),
	created_at timestamptz not null default now(),
	unique (search_id, reporter_id)
);

create index if not exists meetup_partner_reports_ip_idx on public.meetup_partner_reports (reporter_ip, created_at);

alter table public.meetup_partner_reports enable row level security;
revoke all on public.meetup_partner_reports from anon, authenticated;
