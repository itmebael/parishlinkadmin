-- Search RPC for the Bookings page.
--
-- Usage from the frontend (Supabase JS):
--
--   const { data, error } = await supabase.rpc('search_parish_bookings', {
--     p_search: searchText,     -- free text, can be null/empty
--     p_status: null,           -- 'Booked' | 'Completed' | 'Cancelled' | null
--     p_from_date: null,        -- date | null
--     p_to_date: null,          -- date | null
--     p_limit: 50,
--     p_offset: 0,
--   });
--
-- Scoping:
--   * Users with role = 'diocese' see all parishes.
--   * Users with role = 'parish' see only their own parish (matched by the
--     signed-in email against public.parishes.email).
--   * Anyone else only sees their own bookings (booked_by = auth.uid()).
--
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Trigram indexes so ILIKE '%foo%' stays fast as the table grows.
-- ---------------------------------------------------------------------------
create index if not exists diocese_service_bookings_reference_trgm
  on public.diocese_service_bookings using gin (reference_number gin_trgm_ops);

create index if not exists diocese_service_bookings_client_name_trgm
  on public.diocese_service_bookings using gin (client_name gin_trgm_ops);

create index if not exists diocese_service_bookings_service_name_trgm
  on public.diocese_service_bookings using gin (service_name gin_trgm_ops);

create index if not exists diocese_service_bookings_parish_name_trgm
  on public.diocese_service_bookings using gin (parish_name gin_trgm_ops);

create index if not exists diocese_service_bookings_father_name_trgm
  on public.diocese_service_bookings using gin (father_name gin_trgm_ops);

create index if not exists diocese_service_bookings_mother_name_trgm
  on public.diocese_service_bookings using gin (mother_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Search function
-- ---------------------------------------------------------------------------
drop function if exists public.search_parish_bookings(
  text, text, date, date, int, int
);

create or replace function public.search_parish_bookings(
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
  parish_name text,
  client_name text,
  client_first_name text,
  client_last_name text,
  service_name text,
  booking_status text,
  booking_date date,
  booking_time time,
  cost numeric,
  booked_by uuid,
  certificate_file_url text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''));
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_uid uuid := auth.uid();
  v_parish_name text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  -- Resolve the parish for "parish" role users by matching email on parishes.
  if v_role = 'parish' then
    select p.parish_name
      into v_parish_name
      from public.parishes p
     where lower(coalesce(p.email, '')) = v_email
     limit 1;
  end if;

  return query
  with scoped as (
    select b.*
      from public.diocese_service_bookings b
     where (
       -- Diocese: see everything
       v_role = 'diocese'
       -- Parish staff: only their own parish
       or (v_role = 'parish' and v_parish_name is not null
           and lower(b.parish_name) = lower(v_parish_name))
       -- Any other authenticated user: only their own bookings
       or (v_role not in ('diocese', 'parish') and b.booked_by = v_uid)
     )
  ),
  filtered as (
    select s.*
      from scoped s
     where (v_status is null or lower(s.booking_status) = lower(v_status))
       and (p_from_date is null or s.booking_date >= p_from_date)
       and (p_to_date is null or s.booking_date <= p_to_date)
       and (
         v_search is null
         or s.reference_number ilike '%' || v_search || '%'
         or s.client_name        ilike '%' || v_search || '%'
         or s.client_first_name  ilike '%' || v_search || '%'
         or s.client_last_name   ilike '%' || v_search || '%'
         or s.service_name       ilike '%' || v_search || '%'
         or s.parish_name        ilike '%' || v_search || '%'
         or s.father_name        ilike '%' || v_search || '%'
         or s.mother_name        ilike '%' || v_search || '%'
       )
  ),
  counted as (
    select count(*) as total_count from filtered
  )
  select
    f.id,
    f.reference_number,
    f.parish_name,
    f.client_name,
    f.client_first_name,
    f.client_last_name,
    f.service_name,
    f.booking_status,
    f.booking_date,
    f.booking_time,
    f.cost,
    f.booked_by,
    f.certificate_file_url,
    f.created_at,
    f.updated_at,
    c.total_count
  from filtered f
  cross join counted c
  order by
    -- Exact reference match first, then most recent
    case when v_search is not null and lower(f.reference_number) = lower(v_search) then 0 else 1 end,
    f.booking_date desc nulls last,
    f.booking_time desc nulls last,
    f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_parish_bookings(text, text, date, date, int, int)
  to authenticated;
