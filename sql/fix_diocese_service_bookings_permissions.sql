-- Run this in Supabase SQL editor if you see:
--   "permission denied for table diocese_service_bookings"
-- or "Database permissions are blocked".
--
-- This version removes the "must be logged in" (authenticated) gate so
-- the dashboard works with either the anon key or a signed-in session.
-- It grants the same table privileges to anon + authenticated and
-- replaces the RLS policies with permissive ones that accept both roles.

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.diocese_service_bookings from public;

grant select, insert, update, delete
  on public.diocese_service_bookings
  to anon, authenticated;

grant all
  on public.diocese_service_bookings
  to service_role;

grant execute on function public.get_parish_booking_calendar_rows(text, date, date)
  to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

-- Keep RLS enabled, but replace the login-gated policies with
-- permissive ones so both anon and authenticated callers are allowed.
alter table public.diocese_service_bookings enable row level security;

drop policy if exists "Read service bookings"           on public.diocese_service_bookings;
drop policy if exists "Read own service bookings"        on public.diocese_service_bookings;
drop policy if exists "Create service bookings"          on public.diocese_service_bookings;
drop policy if exists "Create own service bookings"      on public.diocese_service_bookings;
drop policy if exists "Update service bookings"          on public.diocese_service_bookings;
drop policy if exists "Update own or staff service bookings" on public.diocese_service_bookings;
drop policy if exists "Update staff service bookings"    on public.diocese_service_bookings;
drop policy if exists "Delete service bookings"          on public.diocese_service_bookings;
drop policy if exists "Delete staff service bookings"    on public.diocese_service_bookings;
drop policy if exists "Public read service bookings"     on public.diocese_service_bookings;
drop policy if exists "Public write service bookings"    on public.diocese_service_bookings;
drop policy if exists "Public update service bookings"   on public.diocese_service_bookings;
drop policy if exists "Public delete service bookings"   on public.diocese_service_bookings;

create policy "Public read service bookings"
  on public.diocese_service_bookings
  for select
  to anon, authenticated
  using (true);

create policy "Public write service bookings"
  on public.diocese_service_bookings
  for insert
  to anon, authenticated
  with check (true);

create policy "Public update service bookings"
  on public.diocese_service_bookings
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public delete service bookings"
  on public.diocese_service_bookings
  for delete
  to anon, authenticated
  using (true);

-- Storage bucket for certificate uploads -- also drop the login gate.
drop policy if exists "Read service certificates"   on storage.objects;
drop policy if exists "Create service certificates" on storage.objects;
drop policy if exists "Update service certificates" on storage.objects;
drop policy if exists "Delete service certificates" on storage.objects;

create policy "Read service certificates"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'service-certificates');

create policy "Create service certificates"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'service-certificates');

create policy "Update service certificates"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'service-certificates')
  with check (bucket_id = 'service-certificates');

create policy "Delete service certificates"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'service-certificates');

-- Verify (optional):
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'diocese_service_bookings'
--   order by grantee, privilege_type;
