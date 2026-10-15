-- A player follows a tournament to find it again in their agenda. The organizer
-- only ever sees how many follow it, never who.
create table if not exists public.meetup_tournament_follows (
	tournament_id uuid not null references public.meetup_tournaments(id) on delete cascade,
	player_id uuid not null,
	created_at timestamptz not null default now(),
	primary key (tournament_id, player_id)
);

create index if not exists meetup_tournament_follows_player_idx on public.meetup_tournament_follows (player_id);

alter table public.meetup_tournament_follows enable row level security;
revoke all on public.meetup_tournament_follows from anon, authenticated;
