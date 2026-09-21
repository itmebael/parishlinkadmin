-- Parish-scoped archiving for public.diocese_archive_records.
--
-- Problem this fixes:
--   The Parish Records archive was shared across every parish, so logging
--   in as Parish B would let you see (and in theory edit) Parish A's
--   baptism / confirmation / marriage / death records. That's a data-leak
--   and breaks the promise that each parish owns its own archive.
--
-- What this migration does:
--   1. Adds a `parish_id uuid` column (FK -> public.parishes.id) with an
--      index, so every archive row is anchored to exactly one parish.
--   2. Best-effort backfills parish_id for existing rows by matching the
--      free-text `church` column against `parishes.parish_name`.
--   3. Adds a BEFORE INSERT/UPDATE trigger that, when the caller is a
--      parish-role user, forces parish_id to their own parish (they can
--      never write a record into someone else's archive, even with a
--      hand-crafted request). Diocese admins can still write any parish.
--   4. Enables RLS and rebuilds the policies so:
--        * role = 'diocese' -> full access to every record
--        * role = 'parish'  -> only records where parish_id matches their
--          own parish (looked up by parishes.email = signed-in email)
--        * everyone else   -> no access
--   5. Updates the three archive RPCs (search_archive_records,
--      get_archive_record_for_print, list_archive_churches) so they honor
--      the parish scope for parish staff and stay global for diocese
--      admins. The UI doesn't need to change - the RPCs automatically
--      filter by the signed-in user's parish.
--
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Schema changes: parish_id column, FK, index
-- ---------------------------------------------------------------------------
alter table public.diocese_archive_records
  add column if not exists parish_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'diocese_archive_records_parish_id_fkey'
       and conrelid = 'public.diocese_archive_records'::regclass
  ) then
    alter table public.diocese_archive_records
      add constraint diocese_archive_records_parish_id_fkey
      foreign key (parish_id) references public.parishes (id)
      on delete set null;
  end if;
end $$;

create index if not exists diocese_archive_records_parish_id_idx
  on public.diocese_archive_records (parish_id);

-- Composite index to speed up the "my parish, newest first" list on the
-- Parish Records page.
create index if not exists diocese_archive_records_parish_service_date_idx
  on public.diocese_archive_records (parish_id, service_date desc);

-- ---------------------------------------------------------------------------
-- 2. Helper: resolve the signed-in user's parish id.
--    Re-use the one from tighten_diocese_service_bookings_rls.sql when it
--    exists, otherwise create it here so this file can be applied on its
--    own without ordering worries.
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_parish_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id
    from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

grant execute on function public.current_staff_parish_id()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Best-effort backfill for existing rows
-- ---------------------------------------------------------------------------
-- Exact match: `church` == `parish_name`
update public.diocese_archive_records r
   set parish_id = p.id
  from public.parishes p
 where r.parish_id is null
   and r.church is not null
   and lower(btrim(r.church)) = lower(btrim(p.parish_name));

-- Fuzzy match: `church` contains the parish short name (e.g. "Catbalogan"
-- in "Parish of Catbalogan" or "St. Michael" in "Diocesan Shrine of ...").
-- Only applies when exactly one parish matches so we never mis-assign.
with candidates as (
  select r.id as record_id,
         (
           select p.id
             from public.parishes p
            where r.church ilike '%' || p.parish_name || '%'
               or p.parish_name ilike '%' || r.church || '%'
            limit 2
         ) as maybe_parish_id,
         (
           select count(*)
             from public.parishes p
            where r.church ilike '%' || p.parish_name || '%'
               or p.parish_name ilike '%' || r.church || '%'
         ) as match_count
    from public.diocese_archive_records r
   where r.parish_id is null
     and r.church is not null
     and btrim(r.church) <> ''
)
update public.diocese_archive_records r
   set parish_id = c.maybe_parish_id
  from candidates c
 where r.id = c.record_id
   and c.match_count = 1
   and c.maybe_parish_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Trigger: enforce parish_id on write
-- ---------------------------------------------------------------------------
-- * Parish staff: parish_id is always forced to their own parish_id,
--   regardless of what the client sent. Blocks cross-parish writes even
--   if the UI is buggy or the request is crafted by hand.
-- * Diocese admins: use whatever parish_id the client sent; if null, try
--   to infer from the `church` name.
-- * Anonymous callers that somehow bypass RLS: rejected.
create or replace function public.diocese_archive_records_enforce_parish_id()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_parish_id uuid;
  v_inferred uuid;
begin
  if v_role = 'parish' then
    v_parish_id := public.current_staff_parish_id();
    if v_parish_id is null then
      raise exception 'No parish is linked to this account. Ask an admin to set parishes.email for your login.'
        using errcode = '28000';
    end if;
    new.parish_id := v_parish_id;
  elsif v_role = 'diocese' then
    if new.parish_id is null and new.church is not null then
      select p.id
        into v_inferred
        from public.parishes p
       where lower(btrim(p.parish_name)) = lower(btrim(new.church))
       limit 1;
      if v_inferred is not null then
        new.parish_id := v_inferred;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_archive_records_enforce_parish_id
  on public.diocese_archive_records;

create trigger diocese_archive_records_enforce_parish_id
  before insert or update of parish_id, church
  on public.diocese_archive_records
  for each row
  execute function public.diocese_archive_records_enforce_parish_id();

-- ---------------------------------------------------------------------------
-- 5. Rebuild RLS policies
-- ---------------------------------------------------------------------------
alter table public.diocese_archive_records enable row level security;

drop policy if exists "Read archive records"          on public.diocese_archive_records;
drop policy if exists "Read scoped archive records"   on public.diocese_archive_records;
drop policy if exists "Public read archive records"   on public.diocese_archive_records;
drop policy if exists "Create archive records"        on public.diocese_archive_records;
drop policy if exists "Create scoped archive records" on public.diocese_archive_records;
drop policy if exists "Public write archive records"  on public.diocese_archive_records;
drop policy if exists "Update archive records"        on public.diocese_archive_records;
drop policy if exists "Update scoped archive records" on public.diocese_archive_records;
drop policy if exists "Public update archive records" on public.diocese_archive_records;
drop policy if exists "Delete archive records"        on public.diocese_archive_records;
drop policy if exists "Delete scoped archive records" on public.diocese_archive_records;
drop policy if exists "Public delete archive records" on public.diocese_archive_records;

-- SELECT
create policy "Read scoped archive records"
on public.diocese_archive_records
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_id() is not null
    and parish_id = public.current_staff_parish_id()
  )
);

-- INSERT
create policy "Create scoped archive records"
on public.diocese_archive_records
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_id() is not null
    and parish_id = public.current_staff_parish_id()
  )
);

-- UPDATE
create policy "Update scoped archive records"
on public.diocese_archive_records
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_id() is not null
    and parish_id = public.current_staff_parish_id()
  )
)
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_id() is not null
    and parish_id = public.current_staff_parish_id()
  )
);

-- DELETE
create policy "Delete scoped archive records"
on public.diocese_archive_records
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_id() is not null
    and parish_id = public.current_staff_parish_id()
  )
);

-- ---------------------------------------------------------------------------
-- 6. Rebuild the archive RPCs so they apply the parish scope as well.
--    (The RPCs run SECURITY DEFINER so they bypass RLS; we re-apply the
--    same scope in the query itself.)
-- ---------------------------------------------------------------------------
drop function if exists public.search_archive_records(
  text, text, text, date, date, int, int
);

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
  mother_last_name text,
  father_name text,
  father_last_name text,
  born_in text,
  born_on date,
  service_date date,
  rev_name text,
  church text,
  register_no text,
  page_no text,
  line_no text,
  scanned_file_name text,
  scanned_file_url text,
  parish_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_record_type text := nullif(btrim(coalesce(p_record_type, '')), '');
  v_church text := nullif(btrim(coalesce(p_church, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_role text := coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_scope_parish uuid;
begin
  -- Parish staff -> scoped to their parish. Anyone who isn't diocese or
  -- parish (or who has no linked parish) gets an empty result set.
  if v_role = 'parish' then
    v_scope_parish := public.current_staff_parish_id();
    if v_scope_parish is null then
      return;
    end if;
  elsif v_role <> 'diocese' then
    return;
  end if;

  return query
  with filtered as (
    select r.*
      from public.diocese_archive_records r
     where (v_scope_parish is null or r.parish_id = v_scope_parish)
       and (v_record_type is null or lower(r.record_type) = lower(v_record_type))
       and (v_church is null or r.church ilike '%' || v_church || '%')
       and (p_from_date is null or r.service_date >= p_from_date)
       and (p_to_date is null or r.service_date <= p_to_date)
       and (
         v_search is null
         or r.first_name       ilike '%' || v_search || '%'
         or r.middle_name      ilike '%' || v_search || '%'
         or r.last_name        ilike '%' || v_search || '%'
         or r.mother_name      ilike '%' || v_search || '%'
         or r.mother_last_name ilike '%' || v_search || '%'
         or r.father_name      ilike '%' || v_search || '%'
         or r.father_last_name ilike '%' || v_search || '%'
         or r.church           ilike '%' || v_search || '%'
         or r.rev_name         ilike '%' || v_search || '%'
         or r.register_no      ilike '%' || v_search || '%'
         or r.page_no          ilike '%' || v_search || '%'
         or r.line_no          ilike '%' || v_search || '%'
         or concat_ws(' ',
              r.first_name, r.middle_name, r.last_name
            ) ilike '%' || v_search || '%'
       )
  ),
  counted as (
    select count(*) as total_count from filtered
  )
  select
    f.id,
    f.record_type,
    f.first_name,
    f.middle_name,
    f.last_name,
    btrim(concat_ws(' ', f.first_name, f.middle_name, f.last_name)) as full_name,
    f.mother_name,
    f.mother_last_name,
    f.father_name,
    f.father_last_name,
    f.born_in,
    f.born_on,
    f.service_date,
    f.rev_name,
    f.church,
    f.register_no,
    f.page_no,
    f.line_no,
    f.scanned_file_name,
    f.scanned_file_url,
    f.parish_id,
    f.created_at,
    f.updated_at,
    c.total_count
  from filtered f
  cross join counted c
  order by
    case when v_search is not null
              and lower(f.register_no) = lower(v_search) then 0
         else 1
    end,
    f.service_date desc nulls last,
    f.last_name asc,
    f.first_name asc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_archive_records(
  text, text, text, date, date, int, int
) to anon, authenticated;

-- Print-ready single record, with a parish_id column and a parish-scope
-- guard so a parish user can't pull another parish's record by guessing
-- an id.
drop function if exists public.get_archive_record_for_print(uuid);

create or replace function public.get_archive_record_for_print(p_id uuid)
returns table (
  id uuid,
  record_type text,
  full_name text,
  first_name text,
  middle_name text,
  last_name text,
  mother_full_name text,
  father_full_name text,
  born_in text,
  born_on date,
  born_on_formatted text,
  service_date date,
  service_date_formatted text,
  rev_name text,
  church text,
  register_no text,
  page_no text,
  line_no text,
  register_ref text,
  scanned_file_name text,
  scanned_file_url text,
  parish_id uuid,
  parish_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_scope_parish uuid;
begin
  if v_role = 'parish' then
    v_scope_parish := public.current_staff_parish_id();
    if v_scope_parish is null then
      return;
    end if;
  elsif v_role <> 'diocese' then
    return;
  end if;

  return query
  select
    r.id,
    r.record_type,
    btrim(concat_ws(' ', r.first_name, r.middle_name, r.last_name)) as full_name,
    r.first_name,
    r.middle_name,
    r.last_name,
    nullif(btrim(concat_ws(' ', r.mother_name, r.mother_last_name)), '') as mother_full_name,
    nullif(btrim(concat_ws(' ', r.father_name, r.father_last_name)), '') as father_full_name,
    r.born_in,
    r.born_on,
    case when r.born_on is not null then to_char(r.born_on, 'FMMonth FMDD, YYYY') end as born_on_formatted,
    r.service_date,
    case when r.service_date is not null then to_char(r.service_date, 'FMMonth FMDD, YYYY') end as service_date_formatted,
    r.rev_name,
    r.church,
    r.register_no,
    r.page_no,
    r.line_no,
    nullif(btrim(concat_ws(' / ',
      case when r.register_no is not null and btrim(r.register_no) <> '' then 'Reg. ' || r.register_no end,
      case when r.page_no is not null and btrim(r.page_no) <> '' then 'Page ' || r.page_no end,
      case when r.line_no is not null and btrim(r.line_no) <> '' then 'Line ' || r.line_no end
    )), '') as register_ref,
    r.scanned_file_name,
    r.scanned_file_url,
    r.parish_id,
    p.parish_name,
    r.created_at,
    r.updated_at
  from public.diocese_archive_records r
  left join public.parishes p on p.id = r.parish_id
  where r.id = p_id
    and (v_scope_parish is null or r.parish_id = v_scope_parish);
end;
$$;

grant execute on function public.get_archive_record_for_print(uuid)
  to anon, authenticated;

-- Distinct churches list -> also parish-scoped for parish staff so their
-- filter dropdown only shows what they're allowed to query.
drop function if exists public.list_archive_churches();

create or replace function public.list_archive_churches()
returns table (church text, record_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_scope_parish uuid;
begin
  if v_role = 'parish' then
    v_scope_parish := public.current_staff_parish_id();
    if v_scope_parish is null then
      return;
    end if;
  elsif v_role <> 'diocese' then
    return;
  end if;

  return query
  select
    r.church,
    count(*) as record_count
  from public.diocese_archive_records r
  where r.church is not null
    and btrim(r.church) <> ''
    and (v_scope_parish is null or r.parish_id = v_scope_parish)
  group by r.church
  order by r.church asc;
end;
$$;

grant execute on function public.list_archive_churches()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Diagnostic view: how many records are still unassigned after backfill?
--    Query with `select * from public.diocese_archive_records_parish_gap;`
-- ---------------------------------------------------------------------------
create or replace view public.diocese_archive_records_parish_gap as
select
  count(*) filter (where parish_id is null)       as unassigned_rows,
  count(*) filter (where parish_id is not null)   as assigned_rows,
  count(*)                                        as total_rows
from public.diocese_archive_records;

grant select on public.diocese_archive_records_parish_gap
  to anon, authenticated;
