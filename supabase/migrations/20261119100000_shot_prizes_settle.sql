-- Pétanque Game's shooting prizes: a period is paid from one reading only. Each reading of a ranking is first kept as
-- the period's draft (its paid places, no name); closing the period copies the draft into shot_prizes and marks it
-- closed in one transaction, so two snapshots running at once can never both pay (the prize rows' key is per
-- player: two readings with different first places would each have paid one). Written by the shot-prizes function only.

create table if not exists public.shot_prizes_draft_head (
	board text not null check (board in ('shots_day', 'shots_week')),
	period date not null,
	total integer not null check (total >= 0), -- Unity's line count when read: it only grows within a period
	taken_at timestamptz not null default now(),
	primary key (board, period)
);

create table if not exists public.shot_prizes_draft (
	board text not null,
	period date not null,
	player_id text not null,
	rank smallint not null check (rank >= 1),
	score smallint not null check (score >= 0),
	coins integer not null check (coins > 0),
	primary key (board, period, player_id),
	foreign key (board, period) references public.shot_prizes_draft_head (board, period) on delete cascade
);
create index if not exists shot_prizes_draft_player on public.shot_prizes_draft (player_id);

alter table public.shot_prizes_draft_head enable row level security;
alter table public.shot_prizes_draft enable row level security;
revoke all on table public.shot_prizes_draft_head from public, anon, authenticated;
revoke all on table public.shot_prizes_draft from public, anon, authenticated;

-- Keeps a reading as the period's draft, unless the period is closed or the draft holds a reading of more lines
-- (a ranking read after Unity's reset has fewer lines than the one before it). True when kept.
create or replace function public.shot_prizes_draft_save(p_board text, p_period date, p_total integer, p_rows jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
begin
	perform pg_advisory_xact_lock(hashtext('shot_prizes:' || p_board || ':' || p_period::text));
	if exists (select 1 from shot_prizes_closed where board = p_board and period = p_period) then
		return false;
	end if;
	insert into shot_prizes_draft_head as h (board, period, total) values (p_board, p_period, p_total)
	on conflict (board, period) do update set total = excluded.total, taken_at = now()
		where h.total <= excluded.total;
	if not found then
		return false;
	end if;
	delete from shot_prizes_draft where board = p_board and period = p_period;
	insert into shot_prizes_draft (board, period, player_id, rank, score, coins)
	select p_board, p_period, r.player_id, r.rank, r.score, r.coins
	from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(player_id text, rank smallint, score smallint, coins integer);
	return true;
end;
$$;

-- Closes a period from its draft, all or nothing: the prize rows paid, or -1 when it was closed already,
-- -2 when no reading was kept (nothing closed).
create or replace function public.shot_prizes_settle(p_board text, p_period date)
returns integer
language plpgsql
set search_path = public
as $$
declare
	paid integer;
begin
	perform pg_advisory_xact_lock(hashtext('shot_prizes:' || p_board || ':' || p_period::text));
	if exists (select 1 from shot_prizes_closed where board = p_board and period = p_period) then
		return -1;
	end if;
	if not exists (select 1 from shot_prizes_draft_head where board = p_board and period = p_period) then
		return -2;
	end if;
	insert into shot_prizes_closed (board, period) values (p_board, p_period);
	insert into shot_prizes (board, period, player_id, rank, score, coins)
	select board, period, player_id, rank, score, coins
	from shot_prizes_draft where board = p_board and period = p_period
	on conflict do nothing;
	get diagnostics paid = row_count;
	delete from shot_prizes_draft_head where board = p_board and period = p_period;
	return paid;
end;
$$;

revoke all on function public.shot_prizes_draft_save(text, date, integer, jsonb) from public, anon, authenticated;
revoke all on function public.shot_prizes_settle(text, date) from public, anon, authenticated;
grant execute on function public.shot_prizes_draft_save(text, date, integer, jsonb) to service_role;
grant execute on function public.shot_prizes_settle(text, date) to service_role;

-- Drafts left behind (a period never closed) go after 30 days with the rest.
create or replace function public.shot_prizes_purge() returns integer
language plpgsql
set search_path = public
as $$
declare
	gone integer;
begin
	delete from shot_prizes where created_at < now() - interval '30 days';
	get diagnostics gone = row_count;
	delete from shot_prizes_closed where closed_at < now() - interval '30 days';
	delete from shot_prizes_draft_head where taken_at < now() - interval '30 days';
	return gone;
end;
$$;
