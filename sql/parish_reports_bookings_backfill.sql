-- Parish Reports: make sure existing bookings count, even when their
-- parish_id was never stamped and the parish_name uses a different
-- casing / spelling / with-or-without "Parish" suffix.
--
-- This migration does two things:
--   1. Backfills `parish_id` on every existing row in
--      diocese_service_bookings, parish_events, diocese_announcements
--      and registered_users by matching `parish_name` against
--      public.parishes.parish_name (tolerant to whitespace, trailing
--      " Parish" suffix and case).
--   2. Replaces parish_reports_by_id with a more forgiving version
--      that counts by parish_id OR by any name variant in one shot,
--      so rows that slipped the backfill still appear in the stats.
--
-- Safe to re-run.

-- =========================================================================
-- 1. Backfill parish_id wherever the row has a matchable parish_name.
-- =========================================================================
do $$
declare
  v_tables text[] := array[
    'diocese_service_bookings',
    'parish_events',
    'diocese_announcements',
    'registered_users'
  ];
  t text;
begin
  foreach t in array v_tables loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='parish_id'
    ) then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='parish_name'
    ) then
      continue;
    end if;

    execute format($q$
      update public.%I r
         set parish_id = p.id
        from public.parishes p
       where r.parish_id is null
         and r.parish_name is not null
         and (
           lower(btrim(r.parish_name)) = lower(btrim(p.parish_name))
           or lower(btrim(r.parish_name)) = lower(btrim(replace(p.parish_name, ' Parish','')))
           or lower(btrim(r.parish_name)) = lower(btrim(p.parish_name || ' Parish'))
           or r.parish_name ilike '%%' || p.parish_name || '%%'
           or p.parish_name ilike '%%' || r.parish_name || '%%'
         )
    $q$, t);
  end loop;
end $$;

-- =========================================================================
-- 2. Tolerant parish name compare helper
-- =========================================================================
create or replace function public.__parish_name_match(a text, b text)
returns boolean
language sql
immutable
as $$
  select case
    when a is null or b is null then false
    else
      lower(btrim(a)) = lower(btrim(b))
      or lower(btrim(a)) = lower(btrim(replace(b, ' Parish','')))
      or lower(btrim(a || ' Parish')) = lower(btrim(b))
      or lower(btrim(a)) = lower(btrim(b || ' Parish'))
      or a ilike '%' || b || '%'
      or b ilike '%' || a || '%'
  end;
$$;

grant execute on function public.__parish_name_match(text, text) to anon, authenticated;

-- =========================================================================
-- 3. Rebuild the reports RPC with a more forgiving count.
-- =========================================================================
drop function if exists public.parish_reports_by_id(uuid);

create or replace function public.parish_reports_by_id(p_parish_id uuid)
returns table (
  month_bookings    bigint,
  pending_bookings  bigint,
  members           bigint,
  events            bigint,
  announcements     bigint,
  archive_records   bigint,
  chapels           bigint,
  live_streams      bigint,
  total_bookings    bigint,
  completed_bookings bigint
)
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_parish public.parishes%rowtype;
  v_first_of_month date := date_trunc('month', now())::date;
begin
  if p_parish_id is null then
    raise exception 'A parish_id is required.' using errcode = '22023';
  end if;
  select * into v_parish from public.parishes where id = p_parish_id;
  if v_parish.id is null then
    raise exception 'Unknown parish_id %.', p_parish_id using errcode = 'P0002';
  end if;

  return query
  select
    -- Month bookings: scope by parish_id when present, else parish_name match.
    (
      case
        when exists (
          select 1 from information_schema.columns
           where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id'
        )
        then (
          select count(*) from public.diocese_service_bookings b
           where b.created_at >= v_first_of_month
             and (b.parish_id = v_parish.id or public.__parish_name_match(b.parish_name, v_parish.parish_name))
        )
        else (
          select count(*) from public.diocese_service_bookings b
           where b.created_at >= v_first_of_month
             and public.__parish_name_match(b.parish_name, v_parish.parish_name)
        )
      end
    )::bigint,

    -- Pending bookings.
    (
      case
        when exists (
          select 1 from information_schema.columns
           where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id'
        )
        then (
          select count(*) from public.diocese_service_bookings b
           where lower(coalesce(b.booking_status,'')) in ('pending','pending review','awaiting review','for review','correction')
             and (b.parish_id = v_parish.id or public.__parish_name_match(b.parish_name, v_parish.parish_name))
        )
        else (
          select count(*) from public.diocese_service_bookings b
           where lower(coalesce(b.booking_status,'')) in ('pending','pending review','awaiting review','for review','correction')
             and public.__parish_name_match(b.parish_name, v_parish.parish_name)
        )
      end
    )::bigint,

    -- Members.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='registered_users') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='registered_users' and column_name='parish_id')
          then (select count(*) from public.registered_users ru where ru.parish_id = v_parish.id)
        else 0
      end
    )::bigint,

    -- Events.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_events') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_events' and column_name='parish_id')
          then (select count(*) from public.parish_events e where e.parish_id = v_parish.id or public.__parish_name_match(e.parish_name, v_parish.parish_name))
        else (select count(*) from public.parish_events e where public.__parish_name_match(e.parish_name, v_parish.parish_name))
      end
    )::bigint,

    -- Announcements.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_announcements') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_announcements' and column_name='parish_id')
          then (select count(*) from public.diocese_announcements a where a.parish_id = v_parish.id or public.__parish_name_match(a.parish_name, v_parish.parish_name))
        else (select count(*) from public.diocese_announcements a where public.__parish_name_match(a.parish_name, v_parish.parish_name))
      end
    )::bigint,

    -- Archive records.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_archive_records') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_archive_records' and column_name='parish_id')
          then (select count(*) from public.diocese_archive_records r where r.parish_id = v_parish.id or public.__parish_name_match(r.church, v_parish.parish_name))
        else (select count(*) from public.diocese_archive_records r where public.__parish_name_match(r.church, v_parish.parish_name))
      end
    )::bigint,

    -- Chapels.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_chapels') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_chapels' and column_name='parish_id')
          then (select count(*) from public.parish_chapels c where c.parish_id = v_parish.id)
        else 0
      end
    )::bigint,

    -- Live streams.
    (
      case
        when not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_live_streams') then 0
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_live_streams' and column_name='parish_id')
          then (select count(*) from public.parish_live_streams s where s.parish_id = v_parish.id or public.__parish_name_match(s.parish_name, v_parish.parish_name))
        else (select count(*) from public.parish_live_streams s where public.__parish_name_match(s.parish_name, v_parish.parish_name))
      end
    )::bigint,

    -- All-time bookings.
    (
      case
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id')
          then (select count(*) from public.diocese_service_bookings b where b.parish_id = v_parish.id or public.__parish_name_match(b.parish_name, v_parish.parish_name))
        else (select count(*) from public.diocese_service_bookings b where public.__parish_name_match(b.parish_name, v_parish.parish_name))
      end
    )::bigint,

    -- Completed bookings.
    (
      case
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id')
          then (select count(*) from public.diocese_service_bookings b where lower(coalesce(b.booking_status,'')) in ('completed','done','released') and (b.parish_id = v_parish.id or public.__parish_name_match(b.parish_name, v_parish.parish_name)))
        else (select count(*) from public.diocese_service_bookings b where lower(coalesce(b.booking_status,'')) in ('completed','done','released') and public.__parish_name_match(b.parish_name, v_parish.parish_name))
      end
    )::bigint;
end;
$$;

grant execute on function public.parish_reports_by_id(uuid) to anon, authenticated;
