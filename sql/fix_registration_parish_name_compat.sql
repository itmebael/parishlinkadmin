-- Fix registration 400/404 errors caused by legacy parish_name filters.
--
-- Symptoms in browser console:
--  - /rest/v1/registered_users?...&parish_name=ilike.*X* -> 400 (column parish_name does not exist)
--  - /rest/v1/parish_priests?...&parish_name=ilike.*X*  -> 400 (column parish_name does not exist)
--  - /rest/v1/parish_live_viewers?...                   -> 404 (table missing)
--  - /auth/v1/signup                                    -> 500 (often triggered by DB errors during sign-up flows)
--
-- Goal:
--  Keep parish_id as the source of truth, but add parish_name columns that
--  the current frontend still queries, and keep them in sync.
--
-- Safe to re-run.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) registered_users: add parish_name compatibility column
-- ------------------------------------------------------------
alter table public.registered_users
  add column if not exists parish_name text;

-- Backfill from parish_id
update public.registered_users ru
   set parish_name = p.parish_name
  from public.parishes p
 where ru.parish_id = p.id
   and (ru.parish_name is null or btrim(ru.parish_name) = '');

create or replace function public.registered_users_sync_parish_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pid uuid;
begin
  -- If parish_id is set, always sync parish_name.
  if new.parish_id is not null then
    select p.parish_name into new.parish_name
      from public.parishes p
     where p.id = new.parish_id;
    return new;
  end if;

  -- If only parish_name is present (legacy client), resolve parish_id.
  if new.parish_name is not null and btrim(new.parish_name) <> '' then
    select p.id into v_pid
      from public.parishes p
     where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
        or lower(btrim(p.parish_name)) = lower(btrim(replace(new.parish_name, ' Parish', '')))
        or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(new.parish_name))
     limit 1;
    if v_pid is not null then
      new.parish_id := v_pid;
      select parish_name into new.parish_name from public.parishes where id = v_pid;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists registered_users_sync_parish_fields_trg on public.registered_users;
create trigger registered_users_sync_parish_fields_trg
before insert or update of parish_id, parish_name
on public.registered_users
for each row
execute function public.registered_users_sync_parish_fields();

grant execute on function public.registered_users_sync_parish_fields() to anon, authenticated;

-- ------------------------------------------------------------
-- 2) parish_priests: add parish_name compatibility column
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname='public' and tablename='parish_priests'
  ) then
    alter table public.parish_priests
      add column if not exists parish_name text;

    -- Backfill name when parish_id exists.
    if exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='parish_priests' and column_name='parish_id'
    ) then
      update public.parish_priests pp
         set parish_name = p.parish_name
        from public.parishes p
       where pp.parish_id = p.id
         and (pp.parish_name is null or btrim(pp.parish_name) = '');
    end if;

    create or replace function public.parish_priests_sync_parish_name()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, auth
    as $fn$
    begin
      if new.parish_id is not null then
        select p.parish_name into new.parish_name
          from public.parishes p
         where p.id = new.parish_id;
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists parish_priests_sync_parish_name_trg on public.parish_priests;
    create trigger parish_priests_sync_parish_name_trg
    before insert or update of parish_id
    on public.parish_priests
    for each row
    execute function public.parish_priests_sync_parish_name();

    grant execute on function public.parish_priests_sync_parish_name() to anon, authenticated;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) parish_live_viewers: create minimal table (prevents 404)
-- ------------------------------------------------------------
create table if not exists public.parish_live_viewers (
  id uuid primary key default gen_random_uuid(),
  parish_name text not null,
  viewer_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists parish_live_viewers_parish_name_idx
  on public.parish_live_viewers (lower(btrim(parish_name)));

alter table public.parish_live_viewers enable row level security;

drop policy if exists "parish_live_viewers_read" on public.parish_live_viewers;
create policy "parish_live_viewers_read"
on public.parish_live_viewers for select
to anon, authenticated
using (true);

grant select on public.parish_live_viewers to anon, authenticated;
grant all on public.parish_live_viewers to service_role;

