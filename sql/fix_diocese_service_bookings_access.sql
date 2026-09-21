-- Fix: "Could not load booked services - permission denied for table
-- diocese_service_bookings".
--
-- What causes that error:
--   * The REST request is hitting Supabase with a role that has no
--     SELECT grant on the table (typically `anon`, because the synthetic
--     Diocese login uses the publishable key and so looks anon to PostgREST).
--   * `permission denied for table ...` happens at the GRANT layer, BEFORE
--     RLS runs. RLS without a matching policy produces an empty result
--     set, not a permission error -- so this message is never an RLS
--     issue, it's always a grant issue.
--
-- What this migration does:
--   1. Keeps the tight RLS from tighten_diocese_service_bookings_rls.sql
--      (diocese-admin or own-parish-only), but makes sure it is actually
--      in place -- re-creating the policies idempotently.
--   2. Re-applies the correct table grants:
--        - authenticated -> select/insert/update/delete (RLS filters rows)
--        - anon          -> select only (RLS with no anon policy returns
--          zero rows, so the REST call succeeds with [] instead of 403)
--        - service_role  -> full
--   3. Makes the parish-scope check more forgiving: staff are recognized
--      either via the `user_metadata.role` JWT claim OR via the presence
--      of a matching `parishes.email` row, so a parish staff member whose
--      signup didn't persist `role: 'parish'` in user metadata still gets
--      scoped reads / writes.
--   4. Provides a diagnostic view so you can see, while signed in, what
--      the server thinks your role and parish are.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Helpers (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.current_auth_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    -- Supabase stores role under user_metadata (set at signup)
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    -- Some admin flows put it under app_metadata
    nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
    -- Fallback: infer "parish" if the signed-in email owns a parish row
    case
      when exists (
        select 1
          from public.parishes p
         where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      then 'parish'
      else ''
    end
  );
$$;

grant execute on function public.current_auth_role() to anon, authenticated;

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

grant execute on function public.current_staff_parish_name() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rebuild RLS policies on diocese_service_bookings
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings enable row level security;

-- Drop every policy name we've ever used so this block is authoritative.
drop policy if exists "Public read service bookings"         on public.diocese_service_bookings;
drop policy if exists "Public write service bookings"        on public.diocese_service_bookings;
drop policy if exists "Public update service bookings"       on public.diocese_service_bookings;
drop policy if exists "Public delete service bookings"       on public.diocese_service_bookings;
drop policy if exists "Read service bookings"                on public.diocese_service_bookings;
drop policy if exists "Read own service bookings"            on public.diocese_service_bookings;
drop policy if exists "Read parish-scoped service bookings"  on public.diocese_service_bookings;
drop policy if exists "Read scoped service bookings"         on public.diocese_service_bookings;
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

-- SELECT
create policy "Read scoped service bookings"
on public.diocese_service_bookings
for select
to authenticated
using (
  public.current_auth_role() = 'diocese'
  or (
    public.current_auth_role() = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(coalesce(parish_name, '')) = lower(public.current_staff_parish_name())
  )
  or booked_by = auth.uid()
);

-- INSERT
create policy "Create scoped service bookings"
on public.diocese_service_bookings
for insert
to authenticated
with check (
  public.current_auth_role() = 'diocese'
  or (
    public.current_auth_role() = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(coalesce(parish_name, '')) = lower(public.current_staff_parish_name())
  )
  or (
    public.current_auth_role() not in ('parish', 'diocese')
    and coalesce(booked_by, auth.uid()) = auth.uid()
  )
);

-- UPDATE
create policy "Update scoped service bookings"
on public.diocese_service_bookings
for update
to authenticated
using (
  public.current_auth_role() = 'diocese'
  or (
    public.current_auth_role() = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(coalesce(parish_name, '')) = lower(public.current_staff_parish_name())
  )
  or booked_by = auth.uid()
)
with check (
  public.current_auth_role() = 'diocese'
  or (
    public.current_auth_role() = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(coalesce(parish_name, '')) = lower(public.current_staff_parish_name())
  )
  or (
    public.current_auth_role() not in ('parish', 'diocese')
    and booked_by = auth.uid()
  )
);

-- DELETE
create policy "Delete scoped service bookings"
on public.diocese_service_bookings
for delete
to authenticated
using (
  public.current_auth_role() = 'diocese'
  or (
    public.current_auth_role() = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(coalesce(parish_name, '')) = lower(public.current_staff_parish_name())
  )
  or booked_by = auth.uid()
);

-- ---------------------------------------------------------------------------
-- 3. Grants
--
-- RLS is the security boundary for row visibility. The GRANT layer just
-- decides whether the request is allowed to ask at all. We grant SELECT
-- to anon so PostgREST returns an empty array instead of 403 for
-- publishable-key requests -- RLS then denies the rows because there is
-- no `to anon` policy above.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select
  on public.diocese_service_bookings
  to anon;

grant select, insert, update, delete
  on public.diocese_service_bookings
  to authenticated;

grant all on public.diocese_service_bookings to service_role;

-- Make sure the supporting sequence (if any) is also reachable for
-- authenticated users so INSERTs don't fail on "permission denied for
-- sequence". The archive table uses gen_random_uuid(), so this is a
-- no-op for it but a good habit for other booking-adjacent tables.
do $$
declare
  s regclass;
begin
  for s in
    select oid::regclass
      from pg_class
     where relkind = 'S'
       and relnamespace = 'public'::regnamespace
       and relname like 'diocese_service_bookings%'
  loop
    execute format('grant usage, select on sequence %s to authenticated', s);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Diagnostic view -- run this while signed in to see what the server
--    thinks your identity is. Helps when bookings still look empty.
--
--   select * from public.my_booking_scope_debug;
-- ---------------------------------------------------------------------------
create or replace view public.my_booking_scope_debug as
select
  auth.uid()                                      as auth_uid,
  auth.jwt() ->> 'email'                          as email,
  auth.jwt() -> 'user_metadata' ->> 'role'        as jwt_user_meta_role,
  auth.jwt() -> 'app_metadata'  ->> 'role'        as jwt_app_meta_role,
  public.current_auth_role()                      as effective_role,
  public.current_staff_parish_name()              as staff_parish_name,
  (
    select count(*)
      from public.diocese_service_bookings b
     where public.current_auth_role() = 'diocese'
        or (
          public.current_auth_role() = 'parish'
          and public.current_staff_parish_name() is not null
          and lower(coalesce(b.parish_name, '')) = lower(public.current_staff_parish_name())
        )
        or b.booked_by = auth.uid()
  ) as visible_row_count;

grant select on public.my_booking_scope_debug to anon, authenticated;
