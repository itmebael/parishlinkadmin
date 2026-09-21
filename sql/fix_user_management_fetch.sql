-- Restores member reads for User Management, Dashboard and Reports.
-- Run in the Supabase SQL editor if parish staff cannot read member rows.
-- A parish office can read registered users linked to its own parish, either
-- by parish_id (current schema) or parish_name (legacy registrations).
-- Diocese administrators retain their full read access.

grant select on public.registered_users to authenticated;
alter table public.registered_users enable row level security;

drop policy if exists "Read own registered user profile" on public.registered_users;
drop policy if exists "Read scoped registered users" on public.registered_users;

create policy "Read scoped registered users"
on public.registered_users
for select
to authenticated
using (
  id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or exists (
    select 1
    from public.parishes parish
    where nullif(lower(btrim(parish.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
      and (
        registered_users.parish_id = parish.id
        or (registered_users.parish_id is null
            and nullif(lower(btrim(registered_users.parish_name)), '') = nullif(lower(btrim(parish.parish_name)), ''))
      )
  )
);
