-- Parish-id-only visibility policy.
--
-- Rule: Parish A's account sees Parish A rows, and nothing else.
-- The match is always `<table>.parish_id = <my parish id>`, where
-- the "my parish id" comes from public.parishes.email matching the
-- authenticated user's email (the same link you already use at
-- registration time).
--
-- Safe to re-run -- every policy/function is dropped and recreated.

-- =========================================================================
-- 1. Resolver: "which parish does the authenticated user belong to?"
--
--    It walks, in order:
--      a. auth.jwt() -> 'user_metadata' ->> 'parish_id'
--      b. auth.jwt() -> 'app_metadata'  ->> 'parish_id'
--      c. public.parishes.email = auth email (case-insensitive)
--      d. auth.jwt() -> 'user_metadata' ->> 'parish_name' via parishes
--
--    Returns NULL for diocese / end users that aren't tied to a parish.
-- =========================================================================
create or replace function public.auth_parish_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_jwt   jsonb := nullif(auth.jwt()::text, '')::jsonb;
  v_email text;
  v_try   text;
  v_id    uuid;
begin
  if v_jwt is null then return null; end if;

  v_email := lower(btrim(coalesce(v_jwt ->> 'email', '')));

  -- a) user_metadata.parish_id
  v_try := nullif(v_jwt -> 'user_metadata' ->> 'parish_id', '');
  if v_try is not null then
    begin
      v_id := v_try::uuid;
      if exists (select 1 from public.parishes where id = v_id) then
        return v_id;
      end if;
    exception when others then null;
    end;
  end if;

  -- b) app_metadata.parish_id
  v_try := nullif(v_jwt -> 'app_metadata' ->> 'parish_id', '');
  if v_try is not null then
    begin
      v_id := v_try::uuid;
      if exists (select 1 from public.parishes where id = v_id) then
        return v_id;
      end if;
    exception when others then null;
    end;
  end if;

  -- c) email match
  if v_email <> '' then
    select p.id into v_id
      from public.parishes p
     where lower(btrim(coalesce(p.email, ''))) = v_email
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- d) parish_name metadata
  v_try := nullif(v_jwt -> 'user_metadata' ->> 'parish_name', '');
  if v_try is not null then
    select p.id into v_id
      from public.parishes p
     where lower(btrim(p.parish_name)) = lower(btrim(v_try))
        or lower(btrim(p.parish_name)) = lower(btrim(replace(v_try, ' Parish', '')))
        or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(v_try))
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  return null;
end;
$$;

grant execute on function public.auth_parish_id() to anon, authenticated;

-- Convenience role function. "diocese" | "parish" | "" (end user).
create or replace function public.auth_role_kind()
returns text
language sql stable security definer set search_path = public, auth
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
    case when public.auth_parish_id() is not null then 'parish' else '' end
  );
$$;

grant execute on function public.auth_role_kind() to anon, authenticated;

-- Debug RPC: call this from the app to confirm what the server sees.
create or replace function public.whoami()
returns table (parish_id uuid, parish_name text, role text, email text)
language sql stable security definer set search_path = public, auth as $$
  select public.auth_parish_id()                                                    as parish_id,
         (select parish_name from public.parishes where id = public.auth_parish_id()) as parish_name,
         public.auth_role_kind()                                                    as role,
         lower(coalesce(auth.jwt() ->> 'email', ''))                                as email;
$$;
grant execute on function public.whoami() to anon, authenticated;

-- =========================================================================
-- 2. A single reusable helper to rebuild the "parish_id matches mine"
--    RLS on any given table. It:
--      * enables RLS
--      * drops the old "Parish id scope" read/write policies
--      * creates a strict read policy (only rows where parish_id = mine,
--        diocese sees everything)
--      * creates insert/update/delete policies with the same rule
--      * grants the usual DML permissions
-- =========================================================================
create or replace function public.__apply_parish_id_policy(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_tbl text := format('%s', p_table);
  v_short text := split_part(v_tbl, '.', 2);
  p record;
begin
  execute format('alter table %s enable row level security', v_tbl);

  -- Remove our previous policies (if any).
  for p in
    select policyname
      from pg_policies
     where schemaname = split_part(v_tbl, '.', 1)
       and tablename  = v_short
       and policyname like 'Parish id %'
  loop
    execute format('drop policy if exists %I on %s', p.policyname, v_tbl);
  end loop;

  execute format($sql$
    create policy "Parish id read"
      on %s for select to anon, authenticated
      using (
        public.auth_role_kind() = 'diocese'
        or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
      )
  $sql$, v_tbl);

  execute format($sql$
    create policy "Parish id insert"
      on %s for insert to authenticated
      with check (
        public.auth_role_kind() = 'diocese'
        or (public.auth_parish_id() is not null and (parish_id is null or parish_id = public.auth_parish_id()))
      )
  $sql$, v_tbl);

  execute format($sql$
    create policy "Parish id update"
      on %s for update to authenticated
      using (
        public.auth_role_kind() = 'diocese'
        or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
      )
      with check (
        public.auth_role_kind() = 'diocese'
        or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
      )
  $sql$, v_tbl);

  execute format($sql$
    create policy "Parish id delete"
      on %s for delete to authenticated
      using (
        public.auth_role_kind() = 'diocese'
        or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
      )
  $sql$, v_tbl);

  execute format('grant select on %s to anon', v_tbl);
  execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
  execute format('grant all on %s to service_role', v_tbl);
end;
$$;

-- =========================================================================
-- 3. Apply the "parish_id matches mine" policy to every table that has
--    a parish_id column. Missing tables are skipped gracefully.
-- =========================================================================
do $$
declare
  t text;
  names text[] := array[
    'diocese_archive_records',
    'diocese_service_bookings',
    'parish_events',
    'diocese_announcements',
    'parish_live_streams',
    'parish_livestream_history',
    'parish_chapels'
  ];
begin
  foreach t in array names loop
    if not exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t
    ) then
      raise notice 'Skipping % -- table not present', t;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = t
         and column_name = 'parish_id'
    ) then
      raise notice 'Skipping % -- no parish_id column', t;
      continue;
    end if;

    perform public.__apply_parish_id_policy(format('public.%I', t)::regclass);
  end loop;
end $$;

-- =========================================================================
-- 4. parishes itself -- visible to everyone read-only (needed for the
--    lookup). Writes only by diocese or the row owner (by email).
-- =========================================================================
alter table public.parishes enable row level security;

do $$
declare p record;
begin
  for p in (select policyname from pg_policies where schemaname='public' and tablename='parishes') loop
    execute format('drop policy if exists %I on public.parishes', p.policyname);
  end loop;
end $$;

create policy "Parishes read"
on public.parishes for select to anon, authenticated using (true);

create policy "Parishes write"
on public.parishes for all to authenticated
using (
  public.auth_role_kind() = 'diocese'
  or lower(btrim(coalesce(email,''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
)
with check (
  public.auth_role_kind() = 'diocese'
  or lower(btrim(coalesce(email,''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
);

grant select on public.parishes to anon;
grant select, insert, update, delete on public.parishes to authenticated;
grant all on public.parishes to service_role;
