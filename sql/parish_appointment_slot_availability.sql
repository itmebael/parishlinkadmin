-- Parish appointment slot availability.
--
-- Goal:
--   A parish appointment (same parish + same date + same time) can be booked
--   only when the slot is available. If another active booking OR a parish
--   event/mass already holds that exact time, the insert/update is rejected
--   so the UI can tell the user "That time is no longer available, please
--   pick another."
--
--   Days that have a mass or event are still bookable at OTHER times — only
--   the exact (parish, date, time) tuple is protected. Events with a null
--   start_time (all-day) do not block any specific time slot.
--
--   Cancelled / rejected bookings do not block the slot, so a freed-up time
--   can be booked by someone else.
--
-- Works against `public.diocese_service_bookings` and `public.parish_events`.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1. Normalize parish_name so capitalisation/whitespace can't bypass checks
-- ---------------------------------------------------------------------------
create or replace function public.diocese_service_bookings_normalize()
returns trigger
language plpgsql
as $$
begin
  if new.parish_name is not null then
    new.parish_name := btrim(new.parish_name);
  end if;
  if new.booking_status is not null then
    new.booking_status := btrim(new.booking_status);
  end if;
  return new;
end;
$$;

drop trigger if exists diocese_service_bookings_normalize_trg
  on public.diocese_service_bookings;

create trigger diocese_service_bookings_normalize_trg
before insert or update on public.diocese_service_bookings
for each row
execute function public.diocese_service_bookings_normalize();

-- ---------------------------------------------------------------------------
-- 2. Hard uniqueness: one active booking per (parish, date, time)
--
--    We consider a booking "active" when its status is NOT one of the
--    cancellation-like states. Those rows must be unique on the slot.
--    Rows without a booking_time (legacy or "any time" requests) are ignored
--    so they don't block real time-slot bookings.
-- ---------------------------------------------------------------------------
drop index if exists public.diocese_service_bookings_parish_slot_unique;

create unique index diocese_service_bookings_parish_slot_unique
  on public.diocese_service_bookings (
    lower(parish_name),
    booking_date,
    booking_time
  )
  where booking_time is not null
    and lower(coalesce(booking_status, 'booked')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'void'
    );

-- Index to accelerate availability look-ups even without the unique filter.
create index if not exists diocese_service_bookings_parish_slot_idx
  on public.diocese_service_bookings (
    lower(parish_name), booking_date, booking_time
  );

-- ---------------------------------------------------------------------------
-- 3. Friendly conflict trigger
--
--    The unique index above is the source of truth, but a dedicated trigger
--    lets us raise a clear, app-friendly error so the frontend can display
--    a nice message instead of a generic "duplicate key" PG error.
-- ---------------------------------------------------------------------------
create or replace function public.diocese_service_bookings_check_slot()
returns trigger
language plpgsql
as $$
declare
  v_conflict_id uuid;
  v_event_title text;
  v_event_type text;
begin
  -- Only constrain when we actually have a time slot.
  if new.booking_time is null or new.booking_date is null
     or new.parish_name is null or btrim(new.parish_name) = '' then
    return new;
  end if;

  -- Cancelled / rejected bookings never conflict.
  if lower(coalesce(new.booking_status, 'booked')) in (
       'cancelled', 'canceled', 'rejected', 'declined', 'void'
     ) then
    return new;
  end if;

  -- A) Conflict with another active booking on the same exact slot.
  select b.id
    into v_conflict_id
  from public.diocese_service_bookings b
  where lower(b.parish_name) = lower(new.parish_name)
    and b.booking_date = new.booking_date
    and b.booking_time = new.booking_time
    and lower(coalesce(b.booking_status, 'booked')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'void'
    )
    and (tg_op = 'INSERT' or b.id <> new.id)
  limit 1;

  if v_conflict_id is not null then
    raise exception using
      errcode = '23505',
      message = format(
        'That %s time slot on %s is already booked at %s. Please choose another time.',
        new.parish_name,
        to_char(new.booking_date, 'Mon DD, YYYY'),
        to_char(new.booking_time, 'HH12:MI AM')
      ),
      hint = 'parish_appointment_slot_taken';
  end if;

  -- B) Conflict with a scheduled mass/event at the same exact time.
  --    Same-day events at OTHER times are fine, so the rule only triggers
  --    when start_time matches. All-day events (start_time IS NULL) never
  --    block a specific time slot.
  select e.title, e.event_type
    into v_event_title, v_event_type
  from public.parish_events e
  where lower(e.parish_name) = lower(new.parish_name)
    and e.event_date = new.booking_date
    and e.start_time is not null
    and e.start_time = new.booking_time
  limit 1;

  if v_event_title is not null then
    raise exception using
      errcode = '23505',
      message = format(
        '%s already has %s "%s" scheduled on %s at %s. Please choose another time.',
        new.parish_name,
        coalesce(lower(nullif(btrim(v_event_type), '')), 'an event'),
        v_event_title,
        to_char(new.booking_date, 'Mon DD, YYYY'),
        to_char(new.booking_time, 'HH12:MI AM')
      ),
      hint = 'parish_appointment_event_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_service_bookings_check_slot_trg
  on public.diocese_service_bookings;

create trigger diocese_service_bookings_check_slot_trg
before insert or update of parish_name, booking_date, booking_time, booking_status
on public.diocese_service_bookings
for each row
execute function public.diocese_service_bookings_check_slot();

-- ---------------------------------------------------------------------------
-- 4. Frontend helpers
-- ---------------------------------------------------------------------------

-- Returns true when (parish, date, time) is free — considers BOTH active
-- bookings and scheduled parish events/masses at that exact time.
-- Pass p_exclude_booking_id when editing an existing booking so it doesn't
-- conflict with itself.
create or replace function public.is_parish_slot_available(
  p_parish_name text,
  p_booking_date date,
  p_booking_time time,
  p_exclude_booking_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.diocese_service_bookings b
      where lower(b.parish_name) = lower(btrim(p_parish_name))
        and b.booking_date = p_booking_date
        and b.booking_time = p_booking_time
        and lower(coalesce(b.booking_status, 'booked')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'void'
        )
        and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
    )
    and not exists (
      select 1
      from public.parish_events e
      where lower(e.parish_name) = lower(btrim(p_parish_name))
        and e.event_date = p_booking_date
        and e.start_time is not null
        and e.start_time = p_booking_time
    );
$$;

grant execute on function public.is_parish_slot_available(text, date, time, uuid)
  to anon, authenticated;

-- Returns the list of taken times for a parish on a given date so the UI
-- can grey those out in the time picker. Combines active bookings AND
-- scheduled events/masses (all-day events with null start_time are NOT
-- included, because they don't block any specific time slot).
--
-- Dropped-and-recreated because the return signature changed in this
-- revision (added source/label columns).
drop function if exists public.get_parish_booked_times(text, date);

create function public.get_parish_booked_times(
  p_parish_name text,
  p_booking_date date
)
returns table (
  slot_time time,
  source text,
  label text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.booking_time as slot_time,
    'booking'::text as source,
    coalesce(nullif(btrim(b.service_name), ''), 'Appointment') as label,
    coalesce(nullif(btrim(b.booking_status), ''), 'Booked') as status
  from public.diocese_service_bookings b
  where lower(b.parish_name) = lower(btrim(p_parish_name))
    and b.booking_date = p_booking_date
    and b.booking_time is not null
    and lower(coalesce(b.booking_status, 'booked')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'void'
    )
  union all
  select
    e.start_time as slot_time,
    'event'::text as source,
    coalesce(nullif(btrim(e.title), ''), 'Parish event') as label,
    coalesce(nullif(btrim(e.event_type), ''), 'Event') as status
  from public.parish_events e
  where lower(e.parish_name) = lower(btrim(p_parish_name))
    and e.event_date = p_booking_date
    and e.start_time is not null
  order by slot_time asc;
$$;

grant execute on function public.get_parish_booked_times(text, date)
  to anon, authenticated;
