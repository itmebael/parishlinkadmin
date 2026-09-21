create extension if not exists pgcrypto;

create table if not exists public.parish_events (
  id uuid primary key default gen_random_uuid(),
  parish_name text not null,
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  location text,
  event_type text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parish_events
  add column if not exists created_by uuid references auth.users (id) on delete set null default auth.uid();

alter table public.parish_events
  alter column created_by set default auth.uid();

create index if not exists parish_events_parish_name_idx
  on public.parish_events (parish_name);

create index if not exists parish_events_event_date_idx
  on public.parish_events (event_date);

create index if not exists parish_events_event_type_idx
  on public.parish_events (event_type);

grant usage on schema public to anon, authenticated;

grant select
  on public.parish_events
  to anon, authenticated;

grant insert, update, delete
  on public.parish_events
  to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_parish_events_updated_at
  on public.parish_events;

create trigger set_parish_events_updated_at
before update on public.parish_events
for each row
execute function public.set_updated_at();

alter table public.parish_events enable row level security;

drop policy if exists "Read parish events"
  on public.parish_events;

create policy "Read parish events"
on public.parish_events
for select
to anon, authenticated
using (true);

drop policy if exists "Create parish events"
  on public.parish_events;

create policy "Create parish events"
on public.parish_events
for insert
to authenticated
with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));

drop policy if exists "Update parish events"
  on public.parish_events;

create policy "Update parish events"
on public.parish_events
for update
to authenticated
using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'))
with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));

drop policy if exists "Delete parish events"
  on public.parish_events;

create policy "Delete parish events"
on public.parish_events
for delete
to authenticated
using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));
