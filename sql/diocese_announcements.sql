create extension if not exists pgcrypto;

create table if not exists public.diocese_announcements (
  id uuid primary key default gen_random_uuid(),
  parish_name text,
  title text not null,
  content text,
  audience text not null default 'All Parishes',
  status text not null default 'Published',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diocese_announcements
  add column if not exists parish_name text;

alter table public.diocese_announcements
  add column if not exists title text;

alter table public.diocese_announcements
  add column if not exists content text;

alter table public.diocese_announcements
  add column if not exists audience text default 'All Parishes';

alter table public.diocese_announcements
  add column if not exists status text default 'Published';

alter table public.diocese_announcements
  add column if not exists created_by uuid references auth.users (id) on delete set null default auth.uid();

alter table public.diocese_announcements
  add column if not exists created_at timestamptz not null default now();

alter table public.diocese_announcements
  add column if not exists updated_at timestamptz not null default now();

update public.diocese_announcements
set
  title = coalesce(nullif(trim(title), ''), 'Untitled announcement'),
  audience = coalesce(nullif(trim(audience), ''), 'All Parishes'),
  status = coalesce(nullif(trim(status), ''), 'Published')
where title is null
  or audience is null
  or status is null;

alter table public.diocese_announcements
  alter column title set not null;

alter table public.diocese_announcements
  alter column audience set not null;

alter table public.diocese_announcements
  alter column audience set default 'All Parishes';

alter table public.diocese_announcements
  alter column status set not null;

alter table public.diocese_announcements
  alter column status set default 'Published';

alter table public.diocese_announcements
  alter column created_by set default auth.uid();

create index if not exists diocese_announcements_created_at_idx
  on public.diocese_announcements (created_at desc);

create index if not exists diocese_announcements_parish_name_idx
  on public.diocese_announcements (parish_name);

create index if not exists diocese_announcements_status_idx
  on public.diocese_announcements (status);

grant usage on schema public to anon, authenticated;

grant select
  on public.diocese_announcements
  to anon, authenticated;

grant insert, update, delete
  on public.diocese_announcements
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

drop trigger if exists set_diocese_announcements_updated_at
  on public.diocese_announcements;

create trigger set_diocese_announcements_updated_at
before update on public.diocese_announcements
for each row
execute function public.set_updated_at();

create or replace function public.get_current_user_parish_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.parish_name
  from public.registered_users ru
  left join public.parishes p on p.id = ru.parish_id
  where lower(ru.email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

grant execute on function public.get_current_user_parish_name()
  to anon, authenticated;

alter table public.diocese_announcements enable row level security;

drop policy if exists "Read scoped announcements"
  on public.diocese_announcements;

create policy "Read scoped announcements"
on public.diocese_announcements
for select
to anon, authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese')
  or (
    status <> 'Draft'
    and (
      parish_name is null
      or trim(parish_name) = ''
      or lower(parish_name) = lower(coalesce(public.get_current_user_parish_name(), ''))
    )
  )
);

drop policy if exists "Create staff announcements"
  on public.diocese_announcements;

create policy "Create staff announcements"
on public.diocese_announcements
for insert
to authenticated
with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));

drop policy if exists "Update staff announcements"
  on public.diocese_announcements;

create policy "Update staff announcements"
on public.diocese_announcements
for update
to authenticated
using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'))
with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));

drop policy if exists "Delete staff announcements"
  on public.diocese_announcements;

create policy "Delete staff announcements"
on public.diocese_announcements
for delete
to authenticated
using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese'));
