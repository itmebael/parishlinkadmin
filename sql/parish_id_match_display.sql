-- Make archive records (and every parish-owned table) display whenever
-- the logged-in parish account's parish_id matches the row's parish_id.
--
-- Problem we're solving:
--   Parish accounts sometimes saw an empty archive list even though their
--   rows clearly had a parish_id. The RLS rule was correct, but the
--   server-side resolver `current_parish_id_any()` only looked at
--   auth.jwt()->>'email' vs public.parishes.email. If the Supabase user's
--   email didn't exactly match the parishes row (different casing,
--   different column, or the account was linked through
--   registered_users), the resolver returned NULL and every row got
--   filtered out.
--
-- Fix:
--   1. Strengthen the resolver so it checks (in order):
--        a. auth.jwt() -> 'user_metadata' ->> 'parish_id'
--        b. auth.jwt() -> 'app_metadata'  ->> 'parish_id'
--        c. registered_users.parish_id for the current auth.uid()
--        d. email match against public.parishes.email (case insensitive)
--        e. auth.jwt() -> 'user_metadata' ->> 'parish_name' via parishes.parish_name
--   2. Expose a read-only debug RPC `my_parish_id()` so the UI can show
--      exactly which parish the server thinks the caller belongs to.
--   3. Add `my_archive_records(...)` -- a lightweight SECURITY DEFINER
--      function that returns every archive row with the same parish_id
--      as the caller. RLS keeps the generic queries safe; this helper
--      makes the parish dashboard's main list trivially correct.
--   4. Reconfirm the read-side RLS on archive + bookings uses the new
--      resolver.
--
-- Safe to re-run.

-- ----------------------------------------------------------------------
-- 1. Beefier resolver
-- ----------------------------------------------------------------------
create or replace function public.current_parish_id_any()
returns uuid
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_jwt jsonb := nullif(auth.jwt()::text, '')::jsonb;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_uid uuid := auth.uid();
  v_try text;
  v_id uuid;
begin
  if v_jwt is null then
    return null;
  end if;

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

  -- c) registered_users.parish_id (parish secretary might be in there too)
  if v_uid is not null then
    begin
      select ru.parish_id into v_id
        from public.registered_users ru
       where ru.id = v_uid
         and ru.parish_id is not null
       limit 1;
      if v_id is not null then
        return v_id;
      end if;
    exception when undefined_table then null;
    end;
  end if;

  -- d) email match on public.parishes.email
  if v_email <> '' then
    select p.id into v_id
      from public.parishes p
     where lower(coalesce(p.email, '')) = v_email
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- e) parish_name match from user_metadata
  v_try := nullif(v_jwt -> 'user_metadata' ->> 'parish_name', '');
  if v_try is not null then
    select p.id into v_id
      from public.parishes p
     where lower(btrim(p.parish_name)) = lower(btrim(v_try))
        or lower(btrim(p.parish_name)) = lower(btrim(replace(v_try, ' Parish', '')))
        or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(v_try))
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  return null;
end;
$$;

grant execute on function public.current_parish_id_any() to anon, authenticated;

-- ----------------------------------------------------------------------
-- 2. Make current_auth_role_any() also use the improved resolver so
--    role detection stays consistent.
-- ----------------------------------------------------------------------
create or replace function public.current_auth_role_any()
returns text
language sql stable security definer set search_path = public, auth
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
    case when public.current_parish_id_any() is not null then 'parish' else '' end
  );
$$;

grant execute on function public.current_auth_role_any() to anon, authenticated;

-- ----------------------------------------------------------------------
-- 3. Debug RPC -- the UI can call this to show which parish the server
--    sees the caller as.
-- ----------------------------------------------------------------------
drop function if exists public.my_parish_id();

create or replace function public.my_parish_id()
returns table (
  parish_id uuid,
  parish_name text,
  detected_role text,
  detected_email text
)
language sql stable security definer set search_path = public, auth as $$
  select
    public.current_parish_id_any() as parish_id,
    (select parish_name from public.parishes where id = public.current_parish_id_any()) as parish_name,
    public.current_auth_role_any() as detected_role,
    lower(coalesce(auth.jwt() ->> 'email', '')) as detected_email;
$$;

grant execute on function public.my_parish_id() to anon, authenticated;

-- ----------------------------------------------------------------------
-- 4. Straight-through archive reader, keyed by parish_id match.
--    The parish dashboard's default "show my parish's archive" view
--    calls this (no need to pass filters to see the full list).
-- ----------------------------------------------------------------------
drop function if exists public.my_archive_records(text, date, date, int, int);

create or replace function public.my_archive_records(
  p_record_type text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  record_type text,
  first_name text,
  middle_name text,
  last_name text,
  full_name text,
  mother_name text,
  father_name text,
  born_in text,
  born_on date,
  service_date date,
  rev_name text,
  church text,
  register_no text,
  page_no text,
  line_no text,
  parish_id uuid,
  chapel_id uuid,
  scanned_file_url text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_role text := public.current_auth_role_any();
  v_my   uuid := public.current_parish_id_any();
begin
  return query
  with scoped as (
    select r.*
      from public.diocese_archive_records r
     where v_role = 'diocese'
        or (v_my is not null and r.parish_id = v_my)
  ),
  filtered as (
    select * from scoped s
     where (p_record_type is null or lower(s.record_type) = lower(p_record_type))
       and (p_from_date   is null or s.service_date >= p_from_date)
       and (p_to_date     is null or s.service_date <= p_to_date)
  )
  select
    f.id, f.record_type,
    f.first_name, f.middle_name, f.last_name,
    btrim(concat_ws(' ', f.first_name, f.middle_name, f.last_name)) as full_name,
    nullif(btrim(concat_ws(' ', f.mother_name, f.mother_last_name)), '') as mother_name,
    nullif(btrim(concat_ws(' ', f.father_name, f.father_last_name)), '') as father_name,
    f.born_in, f.born_on, f.service_date, f.rev_name, f.church,
    f.register_no, f.page_no, f.line_no,
    f.parish_id, f.chapel_id, f.scanned_file_url,
    f.created_at, f.updated_at,
    (select count(*) from filtered) as total_count
  from filtered f
  order by coalesce(f.service_date, f.created_at::date) desc, f.last_name asc
  limit greatest(coalesce(p_limit, 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.my_archive_records(text, date, date, int, int)
  to anon, authenticated;

-- ----------------------------------------------------------------------
-- 5. Same helper for bookings: "show my parish's bookings" in one call.
-- ----------------------------------------------------------------------
drop function if exists public.my_parish_bookings(text, date, date, int, int);

create or replace function public.my_parish_bookings(
  p_status text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit int default 100,
  p_offset int default 0
)
returns setof public.diocese_service_bookings
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_role text := public.current_auth_role_any();
  v_my   uuid := public.current_parish_id_any();
begin
  return query
  select b.*
    from public.diocese_service_bookings b
   where (
     v_role = 'diocese'
     or (v_my is not null and b.parish_id = v_my)
   )
     and (p_status is null or lower(b.booking_status) = lower(p_status))
     and (p_from_date is null or b.booking_date >= p_from_date)
     and (p_to_date   is null or b.booking_date <= p_to_date)
   order by b.updated_at desc
   limit greatest(coalesce(p_limit, 100), 1)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.my_parish_bookings(text, date, date, int, int)
  to anon, authenticated;

-- ----------------------------------------------------------------------
-- 6. Re-affirm read RLS on the two heavy tables (idempotent).
--    Archive records + bookings display rows whose parish_id matches
--    the account's parish_id. Diocese sees everything.
-- ----------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_archive_records') then
    execute 'alter table public.diocese_archive_records enable row level security';

    -- Drop any duplicate "Read archive" policy first.
    execute 'drop policy if exists "Read archive" on public.diocese_archive_records';

    execute $pol$
      create policy "Read archive"
        on public.diocese_archive_records for select to anon, authenticated
        using (
          public.current_auth_role_any() = 'diocese'
          or (
            public.current_parish_id_any() is not null
            and parish_id = public.current_parish_id_any()
          )
        )
    $pol$;
  end if;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_service_bookings') then
    execute 'alter table public.diocese_service_bookings enable row level security';

    execute 'drop policy if exists "Read bookings" on public.diocese_service_bookings';

    execute $pol$
      create policy "Read bookings"
        on public.diocese_service_bookings for select to anon, authenticated
        using (
          public.current_auth_role_any() = 'diocese'
          or (
            public.current_parish_id_any() is not null
            and parish_id = public.current_parish_id_any()
          )
          or booked_by = auth.uid()
        )
    $pol$;
  end if;
end $$;
