-- Shared grocery lists ("Liste de courses"). A private, non-listed tool.
-- One SPACE (uuid = the shared secret, lives in the URL) holds many LISTS; the
-- active list has archived_at IS NULL, older ones are the reusable history. Each
-- list holds ITEMS. RLS is enabled with NO anon policies, so the tables are
-- unreadable/unwritable through the data API: every access goes through the
-- `courses` Edge Function (service_role, bypasses RLS), gated by the space uuid.

create table if not exists public.courses_spaces (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now()
);

create table if not exists public.courses_lists (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references public.courses_spaces(id) on delete cascade,
	title text not null default '',
	archived_at timestamptz,             -- null = the active list; set = history
	created_at timestamptz not null default now()
);

create table if not exists public.courses_items (
	id uuid primary key default gen_random_uuid(),
	list_id uuid not null references public.courses_lists(id) on delete cascade,
	label text not null,
	qty text,                            -- free text ("2", "500 g", "1 pack")
	checked boolean not null default false,
	sort integer not null default 0,     -- insertion order within a list
	created_at timestamptz not null default now()
);

-- One active (non-archived) list per space — new_list archives the previous one first.
create unique index if not exists courses_lists_one_active
	on public.courses_lists (space_id)
	where archived_at is null;

create index if not exists courses_lists_space_idx on public.courses_lists (space_id, created_at desc);
create index if not exists courses_items_list_idx on public.courses_items (list_id, sort, created_at);

-- Lock everything: no policies + RLS on = only the service_role Edge Function gets in.
alter table public.courses_spaces enable row level security;
alter table public.courses_lists enable row level security;
alter table public.courses_items enable row level security;
