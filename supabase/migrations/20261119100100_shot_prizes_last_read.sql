-- shot-prizes now reads the closing rankings a last time 10 s before Unity's reset, so the 23:59 call lasts about a
-- minute: pg_net waits two minutes for it rather than one.
create or replace function public.shot_prizes_call() returns bigint
language sql
set search_path = public
as $fn$
	select net.http_post(
		url := 'https://mzrdfahmzllgbpudpsdi.supabase.co/functions/v1/shot-prizes',
		headers := jsonb_build_object(
			'Content-Type', 'application/json',
			'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'shot_prizes_cron_key')
		),
		body := jsonb_build_object('action', 'snapshot', 'day', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')),
		timeout_milliseconds := 120000
	);
$fn$;
