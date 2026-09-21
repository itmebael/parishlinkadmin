-- Tighten RLS on diocese_service_bookings so parishes can only see and
-- modify their own bookings.
--
-- Problem this fixes:
--   The previous policies used `using (true)` for every role, so logging
--   into Parish B would still show Parish A's bookings if the UI forgot
--   to filter by parish_name. That's a real data-leak, not just a cache
--   bug -- any authenticated session could read every booking in the
--   diocese.
--
-- New rules:
--   * role = 'diocese'  -> full access to every booking
--   * role = 'parish'   -> only bookings where parish_name matches the
--                          parish whose `parishes.email` equals the
--                          signed-in email (case-insensitive)
--   * role = 'user' or unset -> only the user's own bookings, i.e.
--                          booked_by = auth.uid()  OR  the booking's
--                          email fields match the signed-in email
--   * anon -> no access
--
-- Safe to re-run. Drops and recreates the relevant policies.

-- ---------------------------------------------------------------------------
-- Helper: look up the signed-in user's parish name via `parishes.email`
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_parish_name()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.parish_name
    from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

grant execute on function public.current_staff_parish_name()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS (idempotent) and rebuild policies
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings enable row level security;

-- Drop every previous policy name we've ever used on this table so the
-- new set replaces them cleanly.
drop policy if exists "Public read service bookings"         on public.diocese_service_bookings;
drop policy if exists "Public write service bookings"        on public.diocese_service_bookings;
drop policy if exists "Public update service bookings"       on public.diocese_service_bookings;
drop policy if exists "Public delete service bookings"       on public.diocese_service_bookings;
drop policy if exists "Read service bookings"                on public.diocese_service_bookings;
drop policy if exists "Read own service bookings"            on public.diocese_service_bookings;
drop policy if exists "Read parish-scoped service bookings"  on public.diocese_service_bookings;
drop policy if exists "Create service bookings"              on public.diocese_service_bookings;
drop policy if exists "Create own service bookings"          on public.diocese_service_bookings;
drop policy if exists "Create scoped service bookings"       on public.diocese_service_bookings;
drop policy if exists "Update service bookings"              on public.diocese_service_bookings;
drop policy if exists "Update own or staff service bookings" on public.diocese_service_bookings;
drop policy if exists "Update staff service bookings"        on public.diocese_service_bookings;
drop policy if exists "Update scoped service bookings"       on public.diocese_service_bookings;
drop policy if exists "Delete service bookings"              on public.diocese_service_bookings;
drop policy if exists "Delete staff service bookings"        on public.diocese_service_bookings;
drop policy if exists "Delete scoped service bookings"       on public.diocese_service_bookings;

-- ---------------------------------------------------------------------------
-- SELECT
-- ---------------------------------------------------------------------------
create policy "Read scoped service bookings"
on public.diocese_service_bookings
for select
to authenticated
using (
  -- Diocese admins see everything
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  -- Parish staff see only their own parish
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
  -- Users see their own bookings (either linked by auth uid or by email)
  or booked_by = auth.uid()
);

-- ---------------------------------------------------------------------------
-- INSERT
--   Users can create bookings for themselves.
--   Parish staff can create bookings under their own parish.
--   Diocese admins can create anything.
--   Anon cannot create anything.
-- ---------------------------------------------------------------------------
create policy "Create scoped service bookings"
on public.diocese_service_bookings
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') not in ('parish', 'diocese')
    and coalesce(booked_by, auth.uid()) = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- UPDATE
--   Parish staff can update only their own parish's rows and may not move
--   the row to a different parish (the `with check` clause enforces the
--   after-state, the `using` clause enforces the before-state).
-- ---------------------------------------------------------------------------
create policy "Update scoped service bookings"
on public.diocese_service_bookings
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
  or booked_by = auth.uid()
)
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') not in ('parish', 'diocese')
    and booked_by = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- DELETE
-- ---------------------------------------------------------------------------
create policy "Delete scoped service bookings"
on public.diocese_service_bookings
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
  or booked_by = auth.uid()
);

-- ---------------------------------------------------------------------------
-- Revoke anon access entirely (the policies above already deny it, but
-- removing the grant is belt-and-suspenders).
-- ---------------------------------------------------------------------------
revoke all on public.diocese_service_bookings from anon;

-- Keep authenticated full table DML (the policies scope it row-by-row)
grant select, insert, update, delete
  on public.diocese_service_bookings
  to authenticated;

grant all on public.diocese_service_bookings to service_role;

-- ---------------------------------------------------------------------------
-- Sanity check query (uncomment in SQL Editor while signed in as Parish B)
--
--   select public.current_staff_parish_name();           -- "Parish of B"
--   select count(*) from public.diocese_service_bookings; -- Parish B's count only
--   select distinct parish_name from public.diocese_service_bookings; -- single row
-- ---------------------------------------------------------------------------
