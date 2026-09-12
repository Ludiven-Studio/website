-- Email recovery for grocery lists. No accounts: a space is still reached by its
-- uuid secret in the URL. This only lets a device that holds a space link an email
-- to it, so the links can be mailed back when the localStorage "recents" are gone
-- (new phone, cleared cache). Emails are never a login: they are a recovery channel.
-- RLS stays locked with no policies, so access is only via the `courses` Edge
-- Function (service_role), exactly like the other courses_* tables.

create table if not exists public.courses_emails (
	id uuid primary key default gen_random_uuid(),
	email text not null,                 -- normalized: trimmed + lowercased
	space_id uuid not null references public.courses_spaces(id) on delete cascade,
	created_at timestamptz not null default now(),
	unique (email, space_id)
);

create index if not exists courses_emails_email_idx on public.courses_emails (email);

-- One row per email, holding the last time we sent it its links. Lets the Edge
-- Function throttle sends (both link_spaces and request_lists) so the endpoint
-- can't be used to spam an address.
create table if not exists public.courses_email_throttle (
	email text primary key,
	last_sent_at timestamptz not null default now()
);

alter table public.courses_emails enable row level security;
alter table public.courses_email_throttle enable row level security;
