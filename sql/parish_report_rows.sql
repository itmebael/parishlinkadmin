-- Parish Reports: per-tile detail rows.
-- Returns the underlying rows for a given metric so the dashboard
-- can show a "View data" table and print it.
--
-- Safe to re-run.

drop function if exists public.parish_report_rows(uuid, text, date, date, text, text, int);

create or replace function public.parish_report_rows(
  p_parish_id uuid,
  p_metric    text,
  p_from      date default null,
  p_to        date default null,
  p_status    text default null,
  p_search    text default null,
  p_limit     int  default 500
)
returns table (
  row_id      uuid,
  title       text,
  subtitle    text,
  status      text,
  occurred_at timestamptz,
  extra       jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_parish public.parishes%rowtype;
  v_metric text := lower(coalesce(p_metric, ''));
  v_from   date := p_from;
  v_to     date := p_to;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if p_parish_id is null then
    raise exception 'parish_id is required' using errcode = '22023';
  end if;

  select * into v_parish from public.parishes where id = p_parish_id;
  if v_parish.id is null then
    return;
  end if;

  -- Default to current month when caller doesn't provide a range.
  if v_from is null and v_to is null and v_metric in ('bookings','pending') then
    v_from := date_trunc('month', now())::date;
  end if;

  -------------------------------------------------------------------------
  -- Bookings (any status within range)
  -------------------------------------------------------------------------
  if v_metric = 'bookings' then
    return query
    select
      b.id,
      coalesce(nullif(btrim(b.client_name), ''), b.father_name, '—')::text as title,
      (coalesce(b.service_name, '')
        || case when coalesce(b.reference_number,'') <> ''
                then ' · ' || b.reference_number else '' end)::text as subtitle,
      coalesce(b.booking_status, '')::text as status,
      coalesce(b.booking_date::timestamptz, b.created_at) as occurred_at,
      jsonb_build_object(
        'date',        b.booking_date,
        'time',        b.booking_time,
        'reference',   b.reference_number,
        'cost',        b.cost,
        'parish_name', b.parish_name,
        'service',     b.service_name,
        'client',      b.client_name
      ) as extra
      from public.diocese_service_bookings b
     where (b.parish_id = v_parish.id
            or public.__parish_name_match(b.parish_name, v_parish.parish_name))
       and (v_from is null or b.booking_date >= v_from)
       and (v_to   is null or b.booking_date <= v_to)
       and (v_status is null or lower(b.booking_status) = lower(v_status))
       and (v_search is null
            or b.client_name       ilike '%' || v_search || '%'
            or b.service_name      ilike '%' || v_search || '%'
            or b.reference_number  ilike '%' || v_search || '%'
            or b.father_name       ilike '%' || v_search || '%')
     order by coalesce(b.booking_date, b.created_at::date) desc, b.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Pending bookings
  -------------------------------------------------------------------------
  elsif v_metric = 'pending' then
    return query
    select
      b.id,
      coalesce(nullif(btrim(b.client_name), ''), b.father_name, '—')::text,
      coalesce(b.service_name, '')::text,
      coalesce(b.booking_status, '')::text,
      coalesce(b.booking_date::timestamptz, b.created_at),
      jsonb_build_object(
        'date',      b.booking_date,
        'time',      b.booking_time,
        'reference', b.reference_number,
        'cost',      b.cost,
        'service',   b.service_name,
        'client',    b.client_name
      )
      from public.diocese_service_bookings b
     where (b.parish_id = v_parish.id
            or public.__parish_name_match(b.parish_name, v_parish.parish_name))
       and lower(coalesce(b.booking_status,'')) in
           ('pending','pending review','awaiting review','for review','correction')
       and (v_from is null or b.booking_date >= v_from)
       and (v_to   is null or b.booking_date <= v_to)
       and (v_search is null
            or b.client_name      ilike '%' || v_search || '%'
            or b.service_name     ilike '%' || v_search || '%'
            or b.reference_number ilike '%' || v_search || '%')
     order by coalesce(b.booking_date, b.created_at::date) desc, b.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Registered members
  -------------------------------------------------------------------------
  elsif v_metric = 'members' then
    if not exists (select 1 from pg_tables where schemaname='public' and tablename='registered_users') then
      return;
    end if;
    return query
    select
      u.id,
      coalesce(u.full_name, u.email, '—')::text,
      coalesce(u.email, '')::text,
      coalesce(u.role, '')::text,
      coalesce(u.created_at, now()),
      jsonb_build_object(
        'email',       u.email,
        'parish_name', u.parish_name,
        'created_at',  u.created_at
      )
      from public.registered_users u
     where (u.parish_id = v_parish.id
            or public.__parish_name_match(u.parish_name, v_parish.parish_name))
       and (v_from is null or u.created_at::date >= v_from)
       and (v_to   is null or u.created_at::date <= v_to)
       and (v_search is null
            or u.full_name ilike '%' || v_search || '%'
            or u.email     ilike '%' || v_search || '%')
     order by u.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Events
  -------------------------------------------------------------------------
  elsif v_metric = 'events' then
    if not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_events') then
      return;
    end if;
    return query
    select
      e.id,
      coalesce(e.title, e.event_name, '—')::text,
      coalesce(e.venue, e.location, e.description, '')::text,
      coalesce(e.status, '')::text,
      coalesce(e.event_date::timestamptz, e.created_at),
      to_jsonb(e)
      from public.parish_events e
     where (e.parish_id = v_parish.id
            or public.__parish_name_match(e.parish_name, v_parish.parish_name))
       and (v_from is null or e.event_date::date >= v_from)
       and (v_to   is null or e.event_date::date <= v_to)
       and (v_search is null
            or coalesce(e.title,'')       ilike '%' || v_search || '%'
            or coalesce(e.event_name,'')  ilike '%' || v_search || '%'
            or coalesce(e.description,'') ilike '%' || v_search || '%')
     order by e.event_date desc nulls last, e.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Announcements
  -------------------------------------------------------------------------
  elsif v_metric = 'announcements' then
    if not exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_announcements') then
      return;
    end if;
    return query
    select
      a.id,
      coalesce(a.title, '—')::text,
      coalesce(a.body, a.message, '')::text,
      coalesce(a.status, '')::text,
      coalesce(a.created_at, now()),
      to_jsonb(a)
      from public.diocese_announcements a
     where (a.parish_id = v_parish.id
            or public.__parish_name_match(a.parish_name, v_parish.parish_name))
       and (v_from is null or a.created_at::date >= v_from)
       and (v_to   is null or a.created_at::date <= v_to)
       and (v_search is null
            or coalesce(a.title,'')   ilike '%' || v_search || '%'
            or coalesce(a.body,'')    ilike '%' || v_search || '%'
            or coalesce(a.message,'') ilike '%' || v_search || '%')
     order by a.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Archive records
  -------------------------------------------------------------------------
  elsif v_metric = 'archive' then
    return query
    select
      r.id,
      btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.middle_name,'') || ' ' || coalesce(r.last_name,''))::text,
      coalesce(r.church, '')::text,
      coalesce(r.record_type, 'Baptism')::text,
      coalesce(r.service_date::timestamptz, r.created_at),
      jsonb_build_object(
        'record_type', r.record_type,
        'service_date', r.service_date,
        'church', r.church,
        'register_no', r.register_no,
        'page_no', r.page_no,
        'line_no', r.line_no,
        'father', btrim(coalesce(r.father_name,'') || ' ' || coalesce(r.father_last_name,'')),
        'mother', btrim(coalesce(r.mother_name,'') || ' ' || coalesce(r.mother_last_name,''))
      )
      from public.diocese_archive_records r
     where (r.parish_id = v_parish.id
            or public.__parish_name_match(r.church, v_parish.parish_name))
       and (v_from is null or r.service_date >= v_from)
       and (v_to   is null or r.service_date <= v_to)
       and (v_status is null or lower(r.record_type) = lower(v_status))
       and (v_search is null
            or r.first_name  ilike '%' || v_search || '%'
            or r.last_name   ilike '%' || v_search || '%'
            or r.middle_name ilike '%' || v_search || '%'
            or r.register_no ilike '%' || v_search || '%')
     order by r.service_date desc nulls last, r.created_at desc
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Chapels
  -------------------------------------------------------------------------
  elsif v_metric = 'chapels' then
    if not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_chapels') then
      return;
    end if;
    return query
    select
      c.id,
      coalesce(c.chapel_name, '—')::text,
      coalesce(c.address, c.barangay, '')::text,
      case when c.is_active then 'Active' else 'Inactive' end,
      coalesce(c.created_at, now()),
      to_jsonb(c)
      from public.parish_chapels c
     where c.parish_id = v_parish.id
       and (v_search is null
            or c.chapel_name ilike '%' || v_search || '%'
            or coalesce(c.address,'') ilike '%' || v_search || '%'
            or coalesce(c.barangay,'') ilike '%' || v_search || '%')
     order by c.chapel_name
     limit coalesce(p_limit, 500);

  -------------------------------------------------------------------------
  -- Live streams
  -------------------------------------------------------------------------
  elsif v_metric = 'live' then
    if not exists (select 1 from pg_tables where schemaname='public' and tablename='parish_live_streams') then
      return;
    end if;
    return query
    select
      s.id,
      coalesce(s.title, 'Broadcast')::text,
      coalesce(s.description, '')::text,
      coalesce(s.status, '')::text,
      coalesce(s.started_at, s.created_at),
      to_jsonb(s)
      from public.parish_live_streams s
     where (s.parish_id = v_parish.id
            or public.__parish_name_match(s.parish_name, v_parish.parish_name))
       and (v_from is null or coalesce(s.started_at, s.created_at)::date >= v_from)
       and (v_to   is null or coalesce(s.started_at, s.created_at)::date <= v_to)
       and (v_search is null
            or coalesce(s.title,'')       ilike '%' || v_search || '%'
            or coalesce(s.description,'') ilike '%' || v_search || '%')
     order by coalesce(s.started_at, s.created_at) desc
     limit coalesce(p_limit, 500);

  end if;
end;
$$;

grant execute on function public.parish_report_rows(uuid, text, date, date, text, text, int)
to anon, authenticated;
