-- Fix parish dropdown for user registration (anon + PostgREST).
--
-- Symptom: "Loading parishes..." forever or empty list — often RLS or grants.
-- Safe to re-run.
--
-- After running: Dashboard → Settings → API → reload PostgREST schema if needed:
--   notify pgrst, 'reload schema';

alter table public.parishes enable row level security;

-- One clear read policy for everyone (registration is unauthenticated = role "anon").
drop policy if exists "parishes_select_public" on public.parishes;
drop policy if exists "Parishes read" on public.parishes;

create policy "parishes_select_public"
  on public.parishes
  as permissive
  for select
  to anon, authenticated
  using (true);

-- Optional: keep your stricter write policies from parish_id_policy.sql / parishes.sql.
-- If you use "Parishes write" from parish_id_policy, leave it; it does not block SELECT.

grant select on public.parishes to anon, authenticated;

-- Registration tries POST /rest/v1/rpc/list_parishes first (SECURITY DEFINER — bypasses RLS on the table).
-- Create the function with sql/parishes_lookup.sql if needed; then allow anon to call it:
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_parishes'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    grant execute on function public.list_parishes() to anon, authenticated;
  end if;
end $$;

-- Verify (run and inspect rows):
--   select policyname, roles, cmd, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'parishes';
