-- Defence in depth on the meetup_* tables.
--
-- RLS with zero policies already makes every anon read come back empty, but
-- PostgREST answers `200 []` — indistinguishable from "no rows yet". So the
-- invariant the whole design rests on (nothing but the Edge Function ever reads
-- meetup_events, because that table carries the organizer `secret`) was not
-- assertable: a guard checking for a refusal would have passed on an empty table
-- and kept passing after someone added a policy.
--
-- Dropping the table grant makes it a permission error instead, which
-- scripts/check-rencontres.mjs can hold. service_role keeps its own grants and
-- bypasses RLS, so the function is unaffected.

revoke all on table public.meetup_spots from anon, authenticated;
revoke all on table public.meetup_events from anon, authenticated;
revoke all on table public.meetup_signups from anon, authenticated;
revoke all on table public.meetup_quota from anon, authenticated;
revoke all on table public.meetup_geocode_throttle from anon, authenticated;
