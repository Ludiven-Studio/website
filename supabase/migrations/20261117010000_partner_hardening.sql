-- Partner searches, hardened after the 2026-11-16 review (site ticket 0063):
-- 1. The daily caps on numbers given out (per account, per IP) are checked and taken in one
--    locked call, so parallel requests cannot pass them.
-- 2. What counts towards those caps stays when a search goes (closed, expired, deleted): the
--    contacts table loses its rows with their search, so it no longer counts.
-- 3. The cap on open searches per player holds under parallel posts too.
-- Same lockdown as the other meetup_* objects: only the `meetups` Edge Function (service_role).

-- One row per number given out, kept two days whatever happens to its search.
create table if not exists public.meetup_partner_contact_quota (
	player_id uuid not null,
	player_ip text,                      -- peppered hash, see _shared/ipKey.ts
	created_at timestamptz not null default now()
);
create index if not exists meetup_partner_contact_quota_player_idx
	on public.meetup_partner_contact_quota (player_id, created_at);
create index if not exists meetup_partner_contact_quota_ip_idx
	on public.meetup_partner_contact_quota (player_ip, created_at);
alter table public.meetup_partner_contact_quota enable row level security;
revoke all on public.meetup_partner_contact_quota from anon, authenticated;

-- The numbers given in the last day keep counting.
insert into public.meetup_partner_contact_quota (player_id, player_ip, created_at)
	select player_id, player_ip, created_at from public.meetup_partner_contacts
	where created_at > now() - interval '1 day';

-- 'ok' when the number may be given (asked before, or a new one within both caps, then counted);
-- else 'player_cap', 'ip_cap' or 'gone' (the search went meanwhile).
-- The locks are taken player first, then IP, by every call: no two calls wait on each other in a cycle.
create or replace function public.partner_contact_take(
	p_search uuid, p_player uuid, p_ip text, p_max_player int, p_max_ip int
) returns text
language plpgsql
set search_path = public
as $$
declare
	since timestamptz := now() - interval '1 day';
begin
	perform pg_advisory_xact_lock(hashtextextended('partner_contact_player:' || p_player::text, 0));
	if p_ip is not null then
		perform pg_advisory_xact_lock(hashtextextended('partner_contact_ip:' || p_ip, 0));
	end if;
	if exists (select 1 from meetup_partner_contacts where search_id = p_search and player_id = p_player) then
		return 'ok';
	end if;
	if (select count(*) from meetup_partner_contact_quota where player_id = p_player and created_at >= since) >= p_max_player then
		return 'player_cap';
	end if;
	if p_ip is not null
		and (select count(*) from meetup_partner_contact_quota where player_ip = p_ip and created_at >= since) >= p_max_ip then
		return 'ip_cap';
	end if;
	begin
		insert into meetup_partner_contacts (search_id, player_id, player_ip) values (p_search, p_player, p_ip);
	exception
		when foreign_key_violation then return 'gone';
		when unique_violation then return 'ok';
	end;
	insert into meetup_partner_contact_quota (player_id, player_ip) values (p_player, p_ip);
	delete from meetup_partner_contact_quota where created_at < now() - interval '2 days';
	return 'ok';
end;
$$;
revoke all on function public.partner_contact_take(uuid, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.partner_contact_take(uuid, uuid, text, int, int) to service_role;

-- At most 5 searches still ahead per player (P_MAX_OPEN in _shared/partners.ts): a sixth
-- insert fails with 'partner_open_cap', parallel ones included. Updating one's own is free.
create or replace function public.partner_search_open_cap() returns trigger
language plpgsql
set search_path = public
as $$
begin
	perform pg_advisory_xact_lock(hashtextextended('partner_open:' || new.player_id::text, 0));
	if (select count(*) from meetup_partner_searches
		where player_id = new.player_id and contest_starts_at > now()) >= 5 then
		raise exception 'partner_open_cap';
	end if;
	return new;
end;
$$;
revoke all on function public.partner_search_open_cap() from public, anon, authenticated;
drop trigger if exists meetup_partner_searches_open_cap on public.meetup_partner_searches;
create trigger meetup_partner_searches_open_cap before insert on public.meetup_partner_searches
	for each row execute function public.partner_search_open_cap();
