-- Strict parish_id scoping for archive records and service bookings.
--
-- Goal: the parish dashboard MUST show rows that belong to the
-- logged-in parish only. Previously service bookings were filtered
-- by parish_name (free text) which leaked data whenever two parishes
-- had similar names or a booking was inserted with a stale parish
-- name. This migration:
--
--   1. Adds public.diocese_service_bookings.parish_id (FK -> parishes.id)
--      with the supporting index (archive table already has parish_id).
--   2. Backfills parish_id from parish_name on both tables so existing
--      rows become scoped.
--   3. Auto-fills parish_id on every future insert/update via triggers
--      (prefers an explicit parish_id -> the authenticated parish ->
--      lookup by parish_name).
--   4. Hardens RLS on both tables so parish users see rows where
--      parish_id = their own parish only.
--   5. Adds / replaces RPCs (search_archive_records, search_booked_services,
--      parish_recent_bookings) so the UI never needs to filter by
--      parish_name client-side.
--
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. parish_id on diocese_service_bookings
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings
  add column if not exists parish_id uuid;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'diocese_service_bookings'
       and constraint_name = 'diocese_service_bookings_parish_id_fkey'
  ) then
    alter table public.diocese_service_bookings
      add constraint diocese_service_bookings_parish_id_fkey
      foreign key (parish_id) references public.parishes(id) on delete set null;
  end if;
end $$;

create index if not exists diocese_service_bookings_parish_id_idx
  on public.diocese_service_bookings (parish_id);

create index if not exists diocese_service_bookings_parish_date_idx
  on public.diocese_service_bookings (parish_id, booking_date desc);

-- ---------------------------------------------------------------------------
-- 2. Helpers (reuse pc_current_* but fall back gracefully if parish_chapels
--    migration hasn't been applied yet).
-- ---------------------------------------------------------------------------
create or replace function public.current_parish_id_any()
returns uuid language sql stable security definer set search_path = public, auth as $$
  select p.id
    from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;
grant execute on function public.current_parish_id_any() to anon, authenticated;

create or replace function public.current_auth_role_any()
returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
    case when public.current_parish_id_any() is not null then 'parish' else '' end
  );
$$;
grant execute on function public.current_auth_role_any() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill parish_id on both tables from parish_name / church
-- ---------------------------------------------------------------------------
update public.diocese_service_bookings b
   set parish_id = p.id
  from public.parishes p
 where b.parish_id is null
   and b.parish_name is not null
   and lower(btrim(b.parish_name)) = lower(btrim(p.parish_name));

-- A softer match for near-duplicates (e.g. trailing "Parish" word).
update public.diocese_service_bookings b
   set parish_id = p.id
  from public.parishes p
 where b.parish_id is null
   and b.parish_name is not null
   and (
     lower(btrim(b.parish_name)) = lower(btrim(replace(p.parish_name, ' Parish', '')))
     or lower(btrim(b.parish_name)) = lower(btrim(p.parish_name || ' Parish'))
   );

update public.diocese_archive_records a
   set parish_id = p.id
  from public.parishes p
 where a.parish_id is null
   and a.church is not null
   and (
     lower(btrim(a.church)) = lower(btrim(p.parish_name))
     or a.church ilike '%' || p.parish_name || '%'
   );

-- ---------------------------------------------------------------------------
-- 4. Trigger: always resolve parish_id on diocese_service_bookings
-- ---------------------------------------------------------------------------
create or replace function public.diocese_service_bookings_fill_parish_id()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_role text := public.current_auth_role_any();
  v_my   uuid := public.current_parish_id_any();
begin
  -- Explicit id wins when provided by staff.
  if new.parish_id is not null then
    if v_role = 'parish' and new.parish_id <> coalesce(v_my, new.parish_id) then
      raise exception 'You can only create bookings for your own parish.'
        using errcode = '28000';
    end if;
    -- Keep parish_name in sync so downstream queries stay readable.
    if new.parish_name is null or btrim(new.parish_name) = '' then
      select parish_name into new.parish_name from public.parishes where id = new.parish_id;
    end if;
    return new;
  end if;

  -- A parish staff account is submitting for itself.
  if v_role = 'parish' and v_my is not null then
    new.parish_id := v_my;
    if new.parish_name is null or btrim(new.parish_name) = '' then
      select parish_name into new.parish_name from public.parishes where id = v_my;
    end if;
    return new;
  end if;

  -- Fall back to resolving the parish_name string the client sent.
  if new.parish_name is not null and btrim(new.parish_name) <> '' then
    select p.id into new.parish_id
      from public.parishes p
     where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
     limit 1;
    if new.parish_id is null then
      select p.id into new.parish_id
        from public.parishes p
       where lower(btrim(p.parish_name)) = lower(btrim(replace(new.parish_name, ' Parish','')))
          or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(new.parish_name))
       limit 1;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_service_bookings_fill_parish_id on public.diocese_service_bookings;
create trigger diocese_service_bookings_fill_parish_id
  before insert or update of parish_id, parish_name
  on public.diocese_service_bookings
  for each row execute function public.diocese_service_bookings_fill_parish_id();

-- ---------------------------------------------------------------------------
-- 5. RLS on diocese_service_bookings: strict parish_id scoping
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings enable row level security;

-- Wipe previous policies so we start clean each run.
do $$
declare p record;
begin
  for p in (
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'diocese_service_bookings'
  ) loop
    execute format('drop policy if exists %I on public.diocese_service_bookings', p.policyname);
  end loop;
end $$;

-- Anyone may read their own / the public list of bookings the UI
-- exposes, but parish staff are limited to bookings that belong to
-- *their* parish_id. Diocese staff see everything. Users see bookings
-- they themselves booked.
create policy "Read bookings"
on public.diocese_service_bookings
for select
to anon, authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id is not null
    and parish_id = public.current_parish_id_any()
  )
  or booked_by = auth.uid()
);

-- Anyone authenticated can create a booking; the trigger guarantees
-- that parish users can only create for their own parish.
create policy "Create bookings"
on public.diocese_service_bookings
for insert
to authenticated
with check (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and (
      parish_id is null
      or parish_id = public.current_parish_id_any()
    )
  )
  or booked_by = auth.uid()
);

create policy "Update bookings"
on public.diocese_service_bookings
for update
to authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
  or booked_by = auth.uid()
)
with check (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
  or booked_by = auth.uid()
);

create policy "Delete bookings"
on public.diocese_service_bookings
for delete
to authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
);

grant select on public.diocese_service_bookings to anon;
grant select, insert, update, delete on public.diocese_service_bookings to authenticated;
grant all on public.diocese_service_bookings to service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS on diocese_archive_records: mirror the same strictness
-- ---------------------------------------------------------------------------
alter table public.diocese_archive_records enable row level security;

do $$
declare p record;
begin
  for p in (
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'diocese_archive_records'
  ) loop
    execute format('drop policy if exists %I on public.diocese_archive_records', p.policyname);
  end loop;
end $$;

create policy "Read archive"
on public.diocese_archive_records
for select
to anon, authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id is not null
    and parish_id = public.current_parish_id_any()
  )
);

create policy "Write archive"
on public.diocese_archive_records
for insert
to authenticated
with check (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and (
      parish_id is null
      or parish_id = public.current_parish_id_any()
    )
  )
);

create policy "Update archive"
on public.diocese_archive_records
for update
to authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
)
with check (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
);

create policy "Delete archive"
on public.diocese_archive_records
for delete
to authenticated
using (
  public.current_auth_role_any() = 'diocese'
  or (
    public.current_auth_role_any() = 'parish'
    and parish_id = public.current_parish_id_any()
  )
);

grant select on public.diocese_archive_records to anon;
grant select, insert, update, delete on public.diocese_archive_records to authenticated;
grant all on public.diocese_archive_records to service_role;

-- ---------------------------------------------------------------------------
-- 7. RPCs: strict parish_id scoping for search endpoints.
--
--    These are SECURITY DEFINER so the RPC itself decides the scope,
--    no matter what value the client sends.
-- ---------------------------------------------------------------------------

-- List recent bookings for the current parish (used by the dashboard
-- summary card).
drop function if exists public.parish_recent_bookings(int);
create or replace function public.parish_recent_bookings(p_limit int default 15)
returns setof public.diocese_service_bookings
language sql stable security definer set search_path = public, auth as $$
  select b.*
    from public.diocese_service_bookings b
   where (
     public.current_auth_role_any() = 'diocese'
     or (
       public.current_auth_role_any() = 'parish'
       and b.parish_id = public.current_parish_id_any()
     )
     or b.booked_by = auth.uid()
   )
   order by b.updated_at desc
   limit greatest(coalesce(p_limit, 15), 1);
$$;
grant execute on function public.parish_recent_bookings(int) to anon, authenticated;

-- Full bookings search, always scoped to the caller's parish.
drop function if exists public.search_booked_services(text, text, date, date, int, int);
create or replace function public.search_booked_services(
  p_search text default null,
  p_status text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  reference_number text,
  service_name text,
  booking_status text,
  booking_date date,
  booking_time time,
  full_name text,
  client_name text,
  parish_id uuid,
  parish_name text,
  chapel_id uuid,
  cost numeric,
  booked_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_role text := public.current_auth_role_any();
  v_my   uuid := public.current_parish_id_any();
  v_q    text := nullif(btrim(coalesce(p_search,'')),'');
begin
  return query
  with scoped as (
    select b.* from public.diocese_service_bookings b
     where (
       v_role = 'diocese'
       or (v_role = 'parish' and b.parish_id = v_my)
       or b.booked_by = auth.uid()
     )
  ),
  filtered as (
    select * from scoped s
     where (p_status is null or lower(s.booking_status) = lower(p_status))
       and (p_from_date is null or s.booking_date >= p_from_date)
       and (p_to_date   is null or s.booking_date <= p_to_date)
       and (
         v_q is null
         or s.client_name    ilike '%' || v_q || '%'
         or coalesce(s.father_name,'')      ilike '%' || v_q || '%'
         or coalesce(s.mother_name,'')      ilike '%' || v_q || '%'
         or s.service_name                  ilike '%' || v_q || '%'
         or s.reference_number              ilike '%' || v_q || '%'
         or coalesce(s.parish_name,'')      ilike '%' || v_q || '%'
       )
  )
  select
    f.id, f.reference_number, f.service_name, f.booking_status,
    f.booking_date, f.booking_time,
    coalesce(
      nullif(btrim(concat_ws(' ', f.client_first_name, f.client_middle_name, f.client_last_name)), ''),
      f.client_name
    ) as full_name,
    f.client_name,
    f.parish_id, f.parish_name, f.chapel_id,
    f.cost, f.booked_by, f.created_at, f.updated_at,
    (select count(*) from filtered) as total_count
  from filtered f
  order by f.updated_at desc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.search_booked_services(text, text, date, date, int, int)
  to anon, authenticated;

-- Archive records search, also strictly scoped by parish_id.
drop function if exists public.search_archive_records(text, text, text, date, date, int, int);
create or replace function public.search_archive_records(
  p_search text default null,
  p_record_type text default null,
  p_church text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit int default 50,
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
  v_q    text := nullif(btrim(coalesce(p_search,'')),'');
begin
  return query
  with scoped as (
    select r.* from public.diocese_archive_records r
     where (
       v_role = 'diocese'
       or (v_role = 'parish' and r.parish_id = v_my)
     )
  ),
  filtered as (
    select * from scoped s
     where (p_record_type is null or lower(s.record_type) = lower(p_record_type))
       and (p_church      is null or s.church ilike '%' || p_church || '%')
       and (p_from_date   is null or s.service_date >= p_from_date)
       and (p_to_date     is null or s.service_date <= p_to_date)
       and (
         v_q is null
         or s.first_name  ilike '%' || v_q || '%'
         or coalesce(s.middle_name,'') ilike '%' || v_q || '%'
         or s.last_name   ilike '%' || v_q || '%'
         or coalesce(s.mother_name,'')  ilike '%' || v_q || '%'
         or coalesce(s.father_name,'')  ilike '%' || v_q || '%'
         or coalesce(s.church,'')       ilike '%' || v_q || '%'
         or coalesce(s.rev_name,'')     ilike '%' || v_q || '%'
         or coalesce(s.register_no,'')  ilike '%' || v_q || '%'
         or coalesce(s.page_no,'')      ilike '%' || v_q || '%'
         or coalesce(s.line_no,'')      ilike '%' || v_q || '%'
       )
  )
  select
    f.id, f.record_type,
    f.first_name, f.middle_name, f.last_name,
    btrim(concat_ws(' ', f.first_name, f.middle_name, f.last_name)) as full_name,
    nullif(btrim(concat_ws(' ', f.mother_name, f.mother_last_name)), '') as mother_name,
    nullif(btrim(concat_ws(' ', f.father_name, f.father_last_name)), '') as father_name,
    f.born_in, f.born_on, f.service_date, f.rev_name, f.church,
    f.register_no, f.page_no, f.line_no,
    f.parish_id, f.chapel_id,
    f.scanned_file_url, f.created_at, f.updated_at,
    (select count(*) from filtered) as total_count
  from filtered f
  order by coalesce(f.service_date, f.created_at::date) desc, f.last_name asc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.search_archive_records(text, text, text, date, date, int, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Diagnostics view: quickly spot rows that still lack a parish_id
--    so staff can decide whether to fix them.
-- ---------------------------------------------------------------------------
create or replace view public.parish_id_coverage as
select
  'diocese_service_bookings'::text as source,
  count(*) filter (where parish_id is null) as missing_parish_id,
  count(*) as total
from public.diocese_service_bookings
union all
select
  'diocese_archive_records',
  count(*) filter (where parish_id is null),
  count(*)
from public.diocese_archive_records;

grant select on public.parish_id_coverage to anon, authenticated, service_role;
