-- Parish Reports: fetch every count via parish_id instead of
-- parish_name. The reports panel in the UI previously queried five
-- PostgREST endpoints with `parish_name=eq.<name>`. That broke for
-- parishes whose stored parish_name didn't exactly match the session
-- string (trailing "Parish", case, etc.), so every count read zero.
--
-- This migration adds one SECURITY DEFINER RPC that:
--   * takes the parish_id explicitly (works with anon key too);
--   * returns the same 5 numbers the UI renders, plus archive_records
--     and chapels for future use;
--   * never leaks other parishes' data because it filters by id.
--
-- The UI can call it with a single HTTP round-trip:
--   POST /rest/v1/rpc/parish_reports_by_id  { "p_parish_id": "<uuid>" }
--
-- Safe to re-run.

drop function if exists public.parish_reports_by_id(uuid);

create or replace function public.parish_reports_by_id(p_parish_id uuid)
returns table (
  month_bookings   bigint,
  pending_bookings bigint,
  members          bigint,
  events           bigint,
  announcements    bigint,
  archive_records  bigint,
  chapels          bigint,
  live_streams     bigint
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
    -- Bookings this month (parish_id only when available).
    (
      case
        when exists (
          select 1 from information_schema.columns
           where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id'
        )
        then (
          select count(*) from public.diocese_service_bookings b
           where b.created_at >= v_first_of_month
             and b.parish_id = v_parish.id
        )
        else (
          select count(*) from public.diocese_service_bookings b
           where b.created_at >= v_first_of_month
             and lower(btrim(coalesce(b.parish_name,''))) = lower(btrim(v_parish.parish_name))
        )
      end
    )::bigint,

    -- Pending bookings for this parish (parish_id only when available).
    (
      case
        when exists (
          select 1 from information_schema.columns
           where table_schema='public' and table_name='diocese_service_bookings' and column_name='parish_id'
        )
        then (
          select count(*) from public.diocese_service_bookings b
           where lower(coalesce(b.booking_status,'')) in ('pending','pending review','awaiting review','for review')
             and b.parish_id = v_parish.id
        )
        else (
          select count(*) from public.diocese_service_bookings b
           where lower(coalesce(b.booking_status,'')) in ('pending','pending review','awaiting review','for review')
             and lower(btrim(coalesce(b.parish_name,''))) = lower(btrim(v_parish.parish_name))
        )
      end
    )::bigint,

    -- Registered members linked to this parish (parish_id only).
    (
      case
        when exists (
          select 1 from information_schema.columns
           where table_schema='public'
             and table_name='registered_users'
             and column_name='parish_id'
        )
        then (
          select count(*) from public.registered_users ru
           where ru.parish_id = v_parish.id
        )
        else 0
      end
    )::bigint,

    -- Events.
    (
      case when exists (select 1 from pg_tables where schemaname='public' and tablename='parish_events')
           then (
             select count(*) from public.parish_events e
              where (exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_events' and column_name='parish_id')
                      and (e.parish_id = v_parish.id
                           or (e.parish_id is null and lower(btrim(coalesce(e.parish_name,''))) = lower(btrim(v_parish.parish_name)))))
                 or (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_events' and column_name='parish_id')
                      and lower(btrim(coalesce(e.parish_name,''))) = lower(btrim(v_parish.parish_name)))
           )
           else 0
      end
    )::bigint,

    -- Announcements.
    (
      case when exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_announcements')
           then (
             select count(*) from public.diocese_announcements a
              where (exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_announcements' and column_name='parish_id')
                      and (a.parish_id = v_parish.id
                           or (a.parish_id is null and lower(btrim(coalesce(a.parish_name,''))) = lower(btrim(v_parish.parish_name)))))
                 or (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='diocese_announcements' and column_name='parish_id')
                      and lower(btrim(coalesce(a.parish_name,''))) = lower(btrim(v_parish.parish_name)))
           )
           else 0
      end
    )::bigint,

    -- Archive records.
    (
      case when exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_archive_records')
           then (
             select count(*) from public.diocese_archive_records r
              where r.parish_id = v_parish.id
                 or (r.parish_id is null and lower(btrim(coalesce(r.church,''))) = lower(btrim(v_parish.parish_name)))
           )
           else 0
      end
    )::bigint,

    -- Chapels.
    (
      case when exists (select 1 from pg_tables where schemaname='public' and tablename='parish_chapels')
           then (select count(*) from public.parish_chapels c where c.parish_id = v_parish.id)
           else 0
      end
    )::bigint,

    -- Active / live streams for this parish.
    (
      case when exists (select 1 from pg_tables where schemaname='public' and tablename='parish_live_streams')
           then (
             select count(*) from public.parish_live_streams s
              where (exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_live_streams' and column_name='parish_id')
                      and (s.parish_id = v_parish.id
                           or (s.parish_id is null and lower(btrim(coalesce(s.parish_name,''))) = lower(btrim(v_parish.parish_name)))))
                 or (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='parish_live_streams' and column_name='parish_id')
                      and lower(btrim(coalesce(s.parish_name,''))) = lower(btrim(v_parish.parish_name)))
           )
           else 0
      end
    )::bigint;
end;
$$;

grant execute on function public.parish_reports_by_id(uuid) to anon, authenticated;
