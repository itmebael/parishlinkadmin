-- public.parishes — parish registry (user registration dropdown, parish_id links, etc.)
-- Run in Supabase SQL editor. Extension + indexes use IF NOT EXISTS / idempotent patterns.
--
-- The dashboard loads all names for user registration with:
--   GET /rest/v1/parishes?select=id,parish_name&order=parish_name.asc&limit=10000
-- Anon must pass RLS + have SELECT granted (see grants at bottom).

create extension if not exists pgcrypto;

create table if not exists public.parishes (
  id uuid not null default gen_random_uuid (),
  parish_name text not null,
  address text not null,
  city text not null,
  province text not null,
  contact_number text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parishes_pkey primary key (id),
  constraint parishes_email_key unique (email)
);

-- Legacy DBs only: add parishes_email_key if the table predates that constraint.
-- (Re-running after CREATE TABLE already added it would error with 42P07 unless we guard.)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'parishes'
      and c.conname = 'parishes_email_key'
  ) then
    alter table public.parishes add constraint parishes_email_key unique (email);
  end if;
end $$;

create unique index if not exists parishes_email_unique
  on public.parishes using btree (email)
  where (email is not null)
    and (btrim(email) <> ''::text);

create index if not exists parishes_parish_name_idx
  on public.parishes using btree (lower(parish_name));

create unique index if not exists parishes_parish_name_unique
  on public.parishes using btree (lower(btrim(parish_name)));

alter table public.parishes enable row level security;

drop policy if exists "parishes_select_public" on public.parishes;
create policy "parishes_select_public"
  on public.parishes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "parishes_insert_authenticated" on public.parishes;
create policy "parishes_insert_authenticated"
  on public.parishes
  for insert
  to authenticated
  with check (true);

drop policy if exists "parishes_update_authenticated" on public.parishes;
create policy "parishes_update_authenticated"
  on public.parishes
  for update
  to authenticated
  using (true)
  with check (true);

grant select on public.parishes to anon, authenticated;
grant insert, update on public.parishes to authenticated;
grant all on public.parishes to service_role;

comment on table public.parishes is
  'Diocese parishes. Registration lists parish_name; registered_users.parish_id links users to parish features.';
