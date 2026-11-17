-- Partner searches whose contest has started go every 10 minutes, with their numbers, even when
-- nobody opens the list (the `meetups` function also purges on each read). Contacts and reports
-- follow by cascade; the counts behind the daily caps go after two days, as in partner_contact_take.

create or replace function public.partner_searches_purge() returns integer
language plpgsql
set search_path = public
as $$
declare
	gone integer;
begin
	delete from meetup_partner_searches where contest_starts_at <= now();
	get diagnostics gone = row_count;
	delete from meetup_partner_contact_quota where created_at < now() - interval '2 days';
	return gone;
end;
$$;
revoke all on function public.partner_searches_purge() from public, anon, authenticated;
grant execute on function public.partner_searches_purge() to service_role;

-- pg_cron makes the `cron` schema: enable it only where it is missing.
do $$
begin
	if not exists (select 1 from pg_namespace where nspname = 'cron') then
		create extension pg_cron with schema pg_catalog;
	end if;
end;
$$;

-- Scheduling under the same name again replaces the job.
select cron.schedule('meetup-partner-purge', '*/10 * * * *', 'select public.partner_searches_purge()');
