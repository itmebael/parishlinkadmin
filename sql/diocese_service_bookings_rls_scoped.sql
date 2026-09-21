-- Scoped RLS for public.diocese_service_bookings
-- Replaces permissive policies (using (true)) so members only see their own rows,
-- parish accounts only see rows for their parish (matched via public.parishes.email),
-- and diocese sees all.
--
-- Prerequisites: sql/diocese_service_bookings.sql (table + booked_by column).
-- Run in Supabase SQL editor after backing up. Safe to re-run (drops/recreates policies).

alter table public.diocese_service_bookings enable row level security;

drop policy if exists "Public read service bookings" on public.diocese_service_bookings;
drop policy if exists "Public write service bookings" on public.diocese_service_bookings;
drop policy if exists "Public update service bookings" on public.diocese_service_bookings;
drop policy if exists "Public delete service bookings" on public.diocese_service_bookings;
drop policy if exists "Read service bookings" on public.diocese_service_bookings;
drop policy if exists "Read own service bookings" on public.diocese_service_bookings;
drop policy if exists "Create service bookings" on public.diocese_service_bookings;
drop policy if exists "Create own service bookings" on public.diocese_service_bookings;
drop policy if exists "Update service bookings" on public.diocese_service_bookings;
drop policy if exists "Update own or staff service bookings" on public.diocese_service_bookings;
drop policy if exists "Update staff service bookings" on public.diocese_service_bookings;
drop policy if exists "Delete service bookings" on public.diocese_service_bookings;
drop policy if exists "Delete staff service bookings" on public.diocese_service_bookings;
drop policy if exists "bookings_select_diocese" on public.diocese_service_bookings;
drop policy if exists "bookings_select_parish" on public.diocese_service_bookings;
drop policy if exists "bookings_select_member" on public.diocese_service_bookings;
drop policy if exists "bookings_insert_member" on public.diocese_service_bookings;
drop policy if exists "bookings_insert_staff" on public.diocese_service_bookings;
drop policy if exists "bookings_update_diocese" on public.diocese_service_bookings;
drop policy if exists "bookings_update_parish" on public.diocese_service_bookings;
drop policy if exists "bookings_update_member" on public.diocese_service_bookings;
drop policy if exists "bookings_delete_diocese" on public.diocese_service_bookings;
drop policy if exists "bookings_delete_member" on public.diocese_service_bookings;

-- SELECT: diocese = all rows
create policy "bookings_select_diocese"
  on public.diocese_service_bookings
  for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'diocese'
  );

-- SELECT: parish staff = rows whose parish_name matches their row in public.parishes (by login email)
create policy "bookings_select_parish"
  on public.diocese_service_bookings
  for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'parish'
    and exists (
      select 1
      from public.parishes p
      where lower(trim(p.parish_name)) = lower(trim(parish_name))
        and lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- SELECT: community members = only rows they created
create policy "bookings_select_member"
  on public.diocese_service_bookings
  for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'user'
    and booked_by = auth.uid()
  );

-- INSERT: members — booked_by must be self (matches column default auth.uid())
create policy "bookings_insert_member"
  on public.diocese_service_bookings
  for insert
  to authenticated
  with check (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'user'
    and booked_by = auth.uid()
  );

-- INSERT: diocese / parish staff (office workflows, walk-ins, etc.)
create policy "bookings_insert_staff"
  on public.diocese_service_bookings
  for insert
  to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('diocese', 'parish')
  );

-- UPDATE: diocese
create policy "bookings_update_diocese"
  on public.diocese_service_bookings
  for update
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'diocese'
  )
  with check (true);

-- UPDATE: parish — same parish as their parishes.email account
create policy "bookings_update_parish"
  on public.diocese_service_bookings
  for update
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'parish'
    and exists (
      select 1
      from public.parishes p
      where lower(trim(p.parish_name)) = lower(trim(parish_name))
        and lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from public.parishes p
      where lower(trim(p.parish_name)) = lower(trim(parish_name))
        and lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- UPDATE: member — own rows only
create policy "bookings_update_member"
  on public.diocese_service_bookings
  for update
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'user'
    and booked_by = auth.uid()
  )
  with check (
    booked_by = auth.uid()
  );

-- DELETE: diocese (admin cleanup)
create policy "bookings_delete_diocese"
  on public.diocese_service_bookings
  for delete
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'diocese'
  );

-- DELETE: member cancels own booking
create policy "bookings_delete_member"
  on public.diocese_service_bookings
  for delete
  to authenticated
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'user'
    and booked_by = auth.uid()
  );

-- Note: anon role has no policies here — unauthenticated clients cannot read/write rows.
-- If you previously relied on sql/fix_diocese_service_bookings_permissions.sql "Public *"
-- policies, run this file to restore privacy. Ensure the app sends the user's JWT for API calls.
