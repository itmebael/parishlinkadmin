-- Parishes fetch + lookup helpers.
--
-- Used by the registration form and every other screen that needs to list
-- parishes or resolve a parish name to its id. Wraps the existing
-- public.parishes table in SECURITY DEFINER RPCs so:
--
--   * The UI doesn't need to rely on RLS being permissive (it already is,
--     but this future-proofs the fetch if you ever tighten RLS on the
--     table itself).
--   * The payload is ordered and trimmed so dropdowns render nicely.
--   * Lookups by name or email return a single row with the id.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Make sure the table has the expected grants + RLS policies
-- ---------------------------------------------------------------------------
alter table public.parishes enable row level security;

drop policy if exists "parishes_select_public" on public.parishes;
create policy "parishes_select_public"
  on public.parishes
  for select
  to anon, authenticated
  using (true);

grant select on public.parishes to anon, authenticated;
grant insert, update on public.parishes to authenticated;
grant all on public.parishes to service_role;

-- ---------------------------------------------------------------------------
-- 2. list_parishes() -- ordered list for dropdowns
-- ---------------------------------------------------------------------------
--
--   const { data: parishes, error } = await supabase.rpc('list_parishes');
--   // [{ id, parish_name, address, city, province, contact_number, email }, ...]

drop function if exists public.list_parishes();

create or replace function public.list_parishes()
returns table (
  id uuid,
  parish_name text,
  address text,
  city text,
  province text,
  contact_number text,
  email text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    btrim(p.parish_name) as parish_name,
    p.address,
    p.city,
    p.province,
    p.contact_number,
    p.email,
    p.created_at
  from public.parishes p
  where coalesce(btrim(p.parish_name), '') <> ''
  order by lower(p.parish_name) asc;
$$;

grant execute on function public.list_parishes()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_parish_id_by_name(parish_name) -- registration form lookup
-- ---------------------------------------------------------------------------
--
--   // Called right after the user picks a parish from the dropdown so the
--   // signup form can stash parish_id into auth user_metadata:
--   const { data: parish } = await supabase
--     .rpc('get_parish_id_by_name', { p_parish_name: 'Parish of Catbalogan' })
--     .single();
--
--   await supabase.auth.signUp({
--     email, password,
--     options: { data: { role: 'user', parish_id: parish?.id, parish_name: parish?.parish_name } },
--   });
--
-- Matches case-insensitively and trims whitespace. Returns zero rows if
-- no parish matches the input.

drop function if exists public.get_parish_id_by_name(text);

create or replace function public.get_parish_id_by_name(p_parish_name text)
returns table (
  id uuid,
  parish_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.parish_name,
    p.email
  from public.parishes p
  where lower(p.parish_name) = lower(btrim(coalesce(p_parish_name, '')))
  limit 1;
$$;

grant execute on function public.get_parish_id_by_name(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_parish_id_by_email(email) -- parish staff login lookup
-- ---------------------------------------------------------------------------
drop function if exists public.get_parish_id_by_email(text);

create or replace function public.get_parish_id_by_email(p_email text)
returns table (
  id uuid,
  parish_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.parish_name,
    p.email
  from public.parishes p
  where lower(coalesce(p.email, '')) = lower(btrim(coalesce(p_email, '')))
  limit 1;
$$;

grant execute on function public.get_parish_id_by_email(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Diagnostic: quick way to check why "Loading parishes..." is stuck.
--
-- Run in Supabase SQL Editor and paste the result if the dropdown is empty:
--
--   select * from public.parishes_diagnostic;
--
-- ---------------------------------------------------------------------------
create or replace view public.parishes_diagnostic as
select
  (select count(*) from public.parishes)                          as total_rows,
  (select count(*) from public.parishes
    where coalesce(btrim(parish_name), '') <> '')                 as usable_rows,
  (select count(*) from public.parishes where email is not null)  as with_email,
  (select array_agg(distinct city)
     from public.parishes where city is not null and city <> '')  as cities,
  (select array_agg(parish_name order by parish_name)
     from public.parishes
    where coalesce(btrim(parish_name), '') <> ''
    limit 20)                                                     as sample_names;

grant select on public.parishes_diagnostic to anon, authenticated;
