-- homescreen_data: stores each user's bookmark/folder/page data as a single JSON blob
create table if not exists homescreen_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"pages":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table homescreen_data enable row level security;

create policy "users_own_data" on homescreen_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Sync v2: normalized per-row storage
--
-- Each page and each item is its own row with a last-write-wins
-- updated_at (client-generated) and a tombstone (deleted_at) so
-- deletions sync instead of resurrecting. Ordering uses fractional
-- position keys so a reorder touches exactly one row.
--
-- The legacy homescreen_data table is kept as a read-only migration
-- source; clients seed the v2 tables from it on first run.
-- ============================================================

create table if not exists pages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  position text not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- page the item lives on (top-level) or the folder's page (children)
  page_id uuid not null,
  -- null = top level on the page; set = inside that folder
  folder_id uuid,
  type text not null check (type in ('bookmark', 'folder')),
  -- everything non-structural (name, url, subUrls, ...) so new item
  -- fields never need a schema change
  content jsonb not null default '{}'::jsonb,
  position text not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pages_user_idx on pages (user_id);
create index if not exists items_user_idx on items (user_id);

alter table pages enable row level security;
alter table items enable row level security;

create policy "users_own_pages" on pages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_items" on items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Batched last-write-wins push. Applies each row only if it is newer
-- than what the server holds, so replaying an offline queue can never
-- clobber fresher edits from another device. Pages are applied before
-- items so new items always find their page.
create or replace function sync_push(_pages jsonb default '[]', _items jsonb default '[]')
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into pages (id, user_id, position, deleted_at, updated_at)
  select
    (p->>'id')::uuid,
    auth.uid(),
    p->>'position',
    nullif(p->>'deleted_at', '')::timestamptz,
    (p->>'updated_at')::timestamptz
  from jsonb_array_elements(coalesce(_pages, '[]'::jsonb)) p
  on conflict (id) do update set
    position = excluded.position,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where pages.updated_at < excluded.updated_at;

  insert into items (id, user_id, page_id, folder_id, type, content, position, deleted_at, updated_at)
  select
    (i->>'id')::uuid,
    auth.uid(),
    (i->>'page_id')::uuid,
    nullif(i->>'folder_id', '')::uuid,
    i->>'type',
    coalesce(i->'content', '{}'::jsonb),
    i->>'position',
    nullif(i->>'deleted_at', '')::timestamptz,
    (i->>'updated_at')::timestamptz
  from jsonb_array_elements(coalesce(_items, '[]'::jsonb)) i
  on conflict (id) do update set
    page_id = excluded.page_id,
    folder_id = excluded.folder_id,
    content = excluded.content,
    position = excluded.position,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where items.updated_at < excluded.updated_at;
end;
$$;

-- Live cross-session sync (postgres_changes respects RLS)
alter publication supabase_realtime add table pages;
alter publication supabase_realtime add table items;

-- ============================================================
-- Store: a shared catalog of popular sites that any user can install
-- as a bookmark. Listings are global (one catalog for everyone), so
-- unlike pages/items they are not keyed by user. Only members of
-- store_admins may write them; everyone signed in may read published
-- ones. The client builds the bookmark from the listing's name, url,
-- tags and icon_url, then merges `install` (extra bookmark fields such
-- as aliases or subUrls) over that — see src/utils/store.js.
-- ============================================================

create table if not exists store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table store_admins enable row level security;

-- A user may see their own membership (the client uses this to show the
-- admin pages); nobody writes this table from the client.
create policy "store_admins_see_self" on store_admins
  for select using (auth.uid() = user_id);

-- Security definer so the policies below can consult store_admins without
-- being subject to its own RLS.
create or replace function is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from store_admins where user_id = auth.uid());
$$;

create table if not exists store_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  url text not null,
  tagline text not null default '',
  description text not null default '',
  category text not null default 'Other',
  tags text[] not null default '{}',
  icon_url text,
  featured boolean not null default false,
  rank integer not null default 0,
  published boolean not null default true,
  install jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_apps_category_idx on store_apps (category, rank);

alter table store_apps enable row level security;

create policy "store_apps_read_published" on store_apps
  for select to authenticated
  using (published or is_store_admin());

create policy "store_apps_admin_write" on store_apps
  for all to authenticated
  using (is_store_admin())
  with check (is_store_admin());

create or replace function store_apps_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_apps_touch on store_apps;
create trigger store_apps_touch
  before update on store_apps
  for each row execute function store_apps_touch();

-- Make yourself an admin (run once in the SQL editor):
--   insert into store_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
