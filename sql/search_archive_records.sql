-- Parish records: filtered search + print-ready single-record fetch.
--
-- Used by the "Parish Records" page to:
--   1. Show a list of records with filter bar (name, type, church, date range).
--   2. Open a selected record for viewing.
--   3. Print the selected record using a consistent, preformatted payload.
--
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Trigram indexes so ILIKE '%foo%' stays fast as records grow
-- ---------------------------------------------------------------------------
create index if not exists diocese_archive_records_first_name_trgm
  on public.diocese_archive_records using gin (first_name gin_trgm_ops);

create index if not exists diocese_archive_records_last_name_trgm
  on public.diocese_archive_records using gin (last_name gin_trgm_ops);

create index if not exists diocese_archive_records_middle_name_trgm
  on public.diocese_archive_records using gin (middle_name gin_trgm_ops);

create index if not exists diocese_archive_records_mother_name_trgm
  on public.diocese_archive_records using gin (mother_name gin_trgm_ops);

create index if not exists diocese_archive_records_father_name_trgm
  on public.diocese_archive_records using gin (father_name gin_trgm_ops);

create index if not exists diocese_archive_records_church_trgm
  on public.diocese_archive_records using gin (church gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Filtered list for the records page
-- ---------------------------------------------------------------------------
--
-- From the UI:
--
--   const { data } = await supabase.rpc('search_archive_records', {
--     p_search: query,           -- name, parents, register number, etc.
--     p_record_type: 'Baptism',  -- 'Baptism' | 'Confirmation' | 'Marriage' | 'Death' | null
--     p_church: 'Catbalogan',    -- ILIKE match on church, nullable
--     p_from_date: null,         -- service_date >= p_from_date
--     p_to_date: null,           -- service_date <= p_to_date
--     p_limit: 50,
--     p_offset: 0,
--   });
--
-- Returns one row per record + a total_count column for pagination.

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
begin
  return query
  with filtered as (
    select r.*
      from public.diocese_archive_records r
     where (v_record_type is null or lower(r.record_type) = lower(v_record_type))
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
    f.created_at,
    f.updated_at,
    c.total_count
  from filtered f
  cross join counted c
  order by
    -- exact register match first, then newest service date
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

-- ---------------------------------------------------------------------------
-- Print-ready single record (used by the View + Print dialog)
-- ---------------------------------------------------------------------------
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
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
    r.created_at,
    r.updated_at
  from public.diocese_archive_records r
  where r.id = p_id;
$$;

grant execute on function public.get_archive_record_for_print(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Distinct churches list (populates the church filter dropdown)
-- ---------------------------------------------------------------------------
drop function if exists public.list_archive_churches();

create or replace function public.list_archive_churches()
returns table (church text, record_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.church,
    count(*) as record_count
  from public.diocese_archive_records r
  where r.church is not null
    and btrim(r.church) <> ''
  group by r.church
  order by r.church asc;
$$;

grant execute on function public.list_archive_churches()
  to anon, authenticated;
