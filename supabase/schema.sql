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
