grant usage on schema public to authenticated;

grant select, update
  on public.registered_users
  to authenticated;

alter table public.registered_users enable row level security;

drop policy if exists "Read own registered user profile"
  on public.registered_users;

create policy "Read own registered user profile"
on public.registered_users
for select
to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('parish', 'diocese')
);

drop policy if exists "Update own registered user profile"
  on public.registered_users;

create policy "Update own registered user profile"
on public.registered_users
for update
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'))
with check (lower(email) = lower(auth.jwt() ->> 'email'));
