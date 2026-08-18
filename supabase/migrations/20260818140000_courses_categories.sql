-- Categories (store aisles) for the shared grocery lists, plus the label -> aisle
-- memory that lets a re-typed item file itself automatically.
--
-- Categories belong to a SPACE, not to a list: the aisle order is a property of
-- the household's supermarket and must survive "new list". Their `sort` is that
-- walking order. Items keep their own `sort`, now meaningful within a category.
-- Existing items stay category_id NULL and render in a "Sans catégorie" bucket.

create table if not exists public.courses_categories (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references public.courses_spaces(id) on delete cascade,
	name text not null,
	sort integer not null default 0,     -- aisle walking order
	created_at timestamptz not null default now()
);

create index if not exists courses_categories_space_idx on public.courses_categories (space_id, sort);

-- Deleting an aisle must not delete the shopping items filed under it — they fall
-- back to "Sans catégorie".
alter table public.courses_items
	add column if not exists category_id uuid references public.courses_categories(id) on delete set null;

create index if not exists courses_items_category_idx on public.courses_items (list_id, category_id, sort);

-- Remembered filing: "lait" -> Frais. Keyed by an accent/case-folded label so
-- "Lait", "lait" and "LAIT" share one memory. Per space: each household files
-- its own way.
create table if not exists public.courses_item_memory (
	space_id uuid not null references public.courses_spaces(id) on delete cascade,
	label_key text not null,
	category_id uuid not null references public.courses_categories(id) on delete cascade,
	updated_at timestamptz not null default now(),
	primary key (space_id, label_key)
);

alter table public.courses_categories enable row level security;
alter table public.courses_item_memory enable row level security;
