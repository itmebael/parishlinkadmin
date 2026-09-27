-- Enables parish/diocese administrators to deactivate or remove user profiles.
-- Run this once in the Supabase SQL editor before using those actions.

alter table public.registered_users
  add column if not exists is_active boolean not null default true;

grant select, update, delete on public.registered_users to authenticated;

drop policy if exists "Admin update scoped registered users" on public.registered_users;
create policy "Admin update scoped registered users"
on public.registered_users
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or exists (
    select 1
    from public.parishes p
    where lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
      and (
        registered_users.parish_id = p.id
        or (
          registered_users.parish_id is null
          and lower(btrim(registered_users.parish_name)) = lower(btrim(p.parish_name))
        )
      )
  )
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or exists (
    select 1
    from public.parishes p
    where lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
      and (
        registered_users.parish_id = p.id
        or (
          registered_users.parish_id is null
          and lower(btrim(registered_users.parish_name)) = lower(btrim(p.parish_name))
        )
      )
  )
);

drop policy if exists "Admin delete scoped registered users" on public.registered_users;
create policy "Admin delete scoped registered users"
on public.registered_users
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or exists (
    select 1
    from public.parishes p
    where lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
      and (
        registered_users.parish_id = p.id
        or (
          registered_users.parish_id is null
          and lower(btrim(registered_users.parish_name)) = lower(btrim(p.parish_name))
        )
      )
  )
);
