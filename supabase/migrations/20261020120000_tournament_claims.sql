-- A club claims the tournaments imported for it from a committee calendar. The
-- moderator checks with the club (the phone the committee publishes, not the one
-- the claimer gives), then every imported tournament of that club moves to the
-- claimer's account, who can edit it and add the poster.
create table if not exists public.meetup_tournament_claims (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.meetup_tournaments(id) on delete cascade,
	player_id uuid not null,
	-- The club as written on the tournament: the transfer moves every tournament
	-- of from_organizer with this club name.
	club_name text not null,
	from_organizer uuid not null,
	message text not null,
	status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
	created_at timestamptz not null default now(),
	decided_at timestamptz,
	unique (tournament_id, player_id)
);

create index if not exists meetup_tournament_claims_status_idx on public.meetup_tournament_claims (status, created_at);
create index if not exists meetup_tournament_claims_player_idx on public.meetup_tournament_claims (player_id);

alter table public.meetup_tournament_claims enable row level security;
revoke all on public.meetup_tournament_claims from anon, authenticated;

-- "Info erronée" says what is wrong.
alter table public.meetup_tournament_reports add column if not exists note text;
