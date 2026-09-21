-- Allow a signed-in parish administrator to remove only the parish profile
-- attached to their own login email. Diocese administrators may delete any
-- parish profile. Run this in the Supabase SQL editor before using Delete.

alter table public.parishes enable row level security;

grant delete on public.parishes to authenticated;

drop policy if exists "Parishes delete own profile" on public.parishes;
create policy "Parishes delete own profile"
on public.parishes
for delete
to authenticated
using (
  lower(btrim(coalesce(email, ''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
);
