-- Daily per-IP counters for the courses Edge Function.
--
-- create_space and the two email actions had no limit at all: a loop could create spaces
-- forever and mail any address from our Resend account (1/min per address, but unlimited
-- addresses). Same shape as meetup_quota; the IP is a peppered hash (functions/_shared/ipKey.ts).
-- Idempotent.

create table if not exists public.courses_quota (
	action text not null check (action in ('create_space', 'email')),
	subject text not null,
	day date not null,
	n integer not null default 0,
	primary key (action, subject, day)
);

create or replace function public.courses_bump_quota(p_action text, p_subject text, p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
	insert into public.courses_quota (action, subject, day, n) values (p_action, p_subject, p_day, 1)
	on conflict (action, subject, day) do update set n = public.courses_quota.n + 1
	returning n;
$$;

alter table public.courses_quota enable row level security;
revoke all on table public.courses_quota from anon, authenticated;
revoke all on function public.courses_bump_quota(text, text, date) from public, anon, authenticated;
grant execute on function public.courses_bump_quota(text, text, date) to service_role;
