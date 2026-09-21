-- Parish Chapels.
--
-- Each parish runs several chapels (mission stations, barangay
-- chapels, etc.). The parish dashboard used to show one blanket
-- "Church" record; the parish secretary couldn't list the chapels
-- under their parish or see how many service requests came from each.
-- This migration adds:
--
--   1. public.parish_chapels       -- list of chapels per parish
--   2. chapel_id on service bookings + archive records so requests
--      can be tagged with the chapel they came from
--   3. RPCs to list chapels for a parish, add / update / delete a
--      chapel, and fetch a "services booked per chapel" count that
--      powers the UI's stat cards
--
-- Safe to re-run.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.parish_chapels (
  id               uuid primary key default gen_random_uuid(),
  parish_id        uuid not null references public.parishes(id) on delete cascade,
  chapel_name      text not null,
  address          text,
  barangay         text,
  contact_number   text,
  patron_saint     text,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid,
  created_by_email text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint parish_chapels_chapel_name_length
    check (char_length(btrim(chapel_name)) > 0),
  constraint parish_chapels_name_unique_per_parish
    unique (parish_id, chapel_name)
);

create index if not exists parish_chapels_parish_idx
  on public.parish_chapels (parish_id, chapel_name);

create index if not exists parish_chapels_name_trgm
  on public.parish_chapels using gin (chapel_name gin_trgm_ops);

create or replace function public.parish_chapels_bump_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists parish_chapels_bump_updated_at on public.parish_chapels;
create trigger parish_chapels_bump_updated_at
  before update on public.parish_chapels
  for each row execute function public.parish_chapels_bump_updated_at();

-- ---------------------------------------------------------------------------
-- 2. chapel_id on bookings + records so we can count services per chapel
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings
  add column if not exists chapel_id uuid references public.parish_chapels(id) on delete set null;

create index if not exists diocese_service_bookings_chapel_idx
  on public.diocese_service_bookings (chapel_id);

alter table public.diocese_archive_records
  add column if not exists chapel_id uuid references public.parish_chapels(id) on delete set null;

create index if not exists diocese_archive_records_chapel_idx
  on public.diocese_archive_records (chapel_id);

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.pc_current_role()
returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
    case when exists (
      select 1 from public.parishes p
       where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    ) then 'parish' else '' end
  );
$$;

grant execute on function public.pc_current_role() to anon, authenticated;

create or replace function public.pc_current_parish_id()
returns uuid language sql stable security definer set search_path = public, auth as $$
  select p.id from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

grant execute on function public.pc_current_parish_id() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.parish_chapels enable row level security;

drop policy if exists "Read chapels" on public.parish_chapels;
drop policy if exists "Create chapels" on public.parish_chapels;
drop policy if exists "Update chapels" on public.parish_chapels;
drop policy if exists "Delete chapels" on public.parish_chapels;

-- Read: anyone can read (so the public/user side sees the chapel list),
-- but we still scope writes.
create policy "Read chapels"
on public.parish_chapels
for select
to anon, authenticated
using (true);

create policy "Create chapels"
on public.parish_chapels
for insert
to authenticated
with check (
  public.pc_current_role() = 'diocese'
  or (
    public.pc_current_role() = 'parish'
    and public.pc_current_parish_id() is not null
    and parish_id = public.pc_current_parish_id()
  )
);

create policy "Update chapels"
on public.parish_chapels
for update
to authenticated
using (
  public.pc_current_role() = 'diocese'
  or (
    public.pc_current_role() = 'parish'
    and public.pc_current_parish_id() is not null
    and parish_id = public.pc_current_parish_id()
  )
)
with check (
  public.pc_current_role() = 'diocese'
  or (
    public.pc_current_role() = 'parish'
    and public.pc_current_parish_id() is not null
    and parish_id = public.pc_current_parish_id()
  )
);

create policy "Delete chapels"
on public.parish_chapels
for delete
to authenticated
using (
  public.pc_current_role() = 'diocese'
  or (
    public.pc_current_role() = 'parish'
    and public.pc_current_parish_id() is not null
    and parish_id = public.pc_current_parish_id()
  )
);

grant select on public.parish_chapels to anon;
grant select, insert, update, delete on public.parish_chapels to authenticated;
grant all on public.parish_chapels to service_role;

-- ---------------------------------------------------------------------------
-- 5. Auto-tag chapel_id on new bookings from the `parish_name` + a free-text
--    chapel string if the client fills one in. Keeps the stats accurate even
--    before the UI is fully migrated to chapel_id picking.
-- ---------------------------------------------------------------------------
create or replace function public.diocese_service_bookings_tag_chapel()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_parish uuid;
  v_chapel uuid;
  v_str text := coalesce(new.venue_name, new.notes, '');
begin
  if new.chapel_id is not null then return new; end if;
  if new.parish_name is null or btrim(new.parish_name) = '' then return new; end if;

  select p.id into v_parish
    from public.parishes p
   where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
   limit 1;
  if v_parish is null then return new; end if;

  -- Try to match on any free-text column that might hold the chapel name.
  if btrim(v_str) <> '' then
    select c.id into v_chapel
      from public.parish_chapels c
     where c.parish_id = v_parish
       and c.is_active = true
       and (
         v_str ilike '%' || c.chapel_name || '%'
         or c.chapel_name ilike '%' || v_str || '%'
       )
     order by char_length(c.chapel_name) desc
     limit 1;
  end if;

  if v_chapel is not null then
    new.chapel_id := v_chapel;
  end if;
  return new;
end;
$$;

-- Guard against missing source columns on older deployments.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'diocese_service_bookings'
       and column_name in ('venue_name', 'notes')
  ) then
    drop trigger if exists diocese_service_bookings_tag_chapel on public.diocese_service_bookings;
    create trigger diocese_service_bookings_tag_chapel
      before insert on public.diocese_service_bookings
      for each row execute function public.diocese_service_bookings_tag_chapel();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RPCs the UI calls
-- ---------------------------------------------------------------------------

-- List chapels with per-chapel service counts. Parish staff get their own
-- parish only; diocese admins can pass any parish id, or null to get every
-- chapel across the diocese.
drop function if exists public.list_parish_chapels(uuid);

create or replace function public.list_parish_chapels(p_parish_id uuid default null)
returns table (
  id uuid,
  parish_id uuid,
  parish_name text,
  chapel_name text,
  address text,
  barangay text,
  contact_number text,
  patron_saint text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  service_requests bigint,
  archive_records bigint,
  last_service_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_role text := public.pc_current_role();
  v_scope uuid := p_parish_id;
begin
  if v_role = 'parish' then
    v_scope := public.pc_current_parish_id();
  elsif v_role <> 'diocese' and v_role <> '' then
    v_scope := coalesce(v_scope, public.pc_current_parish_id());
  end if;

  return query
  select
    c.id,
    c.parish_id,
    p.parish_name,
    c.chapel_name,
    c.address,
    c.barangay,
    c.contact_number,
    c.patron_saint,
    c.notes,
    c.is_active,
    c.created_at,
    c.updated_at,
    (select count(*) from public.diocese_service_bookings b where b.chapel_id = c.id) as service_requests,
    (select count(*) from public.diocese_archive_records r where r.chapel_id = c.id)  as archive_records,
    (select max(b.created_at) from public.diocese_service_bookings b where b.chapel_id = c.id) as last_service_at
  from public.parish_chapels c
  left join public.parishes p on p.id = c.parish_id
  where (v_scope is null or c.parish_id = v_scope)
  order by c.is_active desc, c.chapel_name asc;
end;
$$;

grant execute on function public.list_parish_chapels(uuid) to anon, authenticated;

-- Add a chapel (parish staff: forced to their own parish; diocese: any parish).
drop function if exists public.add_parish_chapel(uuid, text, text, text, text, text, text);

create or replace function public.add_parish_chapel(
  p_parish_id uuid default null,
  p_chapel_name text default null,
  p_address text default null,
  p_barangay text default null,
  p_contact_number text default null,
  p_patron_saint text default null,
  p_notes text default null
)
returns public.parish_chapels
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role text := public.pc_current_role();
  v_parish uuid;
  v_row public.parish_chapels;
begin
  if p_chapel_name is null or char_length(btrim(p_chapel_name)) = 0 then
    raise exception 'A chapel name is required.' using errcode = '22023';
  end if;

  if v_role = 'parish' then
    v_parish := public.pc_current_parish_id();
    if v_parish is null then
      raise exception 'Your account is not linked to a parish.' using errcode = '28000';
    end if;
  elsif v_role = 'diocese' then
    v_parish := p_parish_id;
    if v_parish is null then
      raise exception 'A parish must be specified.' using errcode = '22023';
    end if;
  else
    raise exception 'Only parish staff or diocese admins can add chapels.' using errcode = '28000';
  end if;

  insert into public.parish_chapels (
    parish_id, chapel_name, address, barangay, contact_number, patron_saint, notes,
    created_by, created_by_email
  ) values (
    v_parish, btrim(p_chapel_name),
    nullif(btrim(coalesce(p_address,'')), ''),
    nullif(btrim(coalesce(p_barangay,'')), ''),
    nullif(btrim(coalesce(p_contact_number,'')), ''),
    nullif(btrim(coalesce(p_patron_saint,'')), ''),
    nullif(btrim(coalesce(p_notes,'')), ''),
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', '')
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.add_parish_chapel(uuid, text, text, text, text, text, text)
  to authenticated;

-- Update a chapel (same scope rules).
drop function if exists public.update_parish_chapel(uuid, text, text, text, text, text, text, boolean);

create or replace function public.update_parish_chapel(
  p_id uuid,
  p_chapel_name text default null,
  p_address text default null,
  p_barangay text default null,
  p_contact_number text default null,
  p_patron_saint text default null,
  p_notes text default null,
  p_is_active boolean default null
)
returns public.parish_chapels
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role text := public.pc_current_role();
  v_my uuid := public.pc_current_parish_id();
  v_row public.parish_chapels;
begin
  select * into v_row from public.parish_chapels where id = p_id;
  if v_row.id is null then raise exception 'Chapel not found.' using errcode = 'P0002'; end if;

  if v_role = 'parish' and v_row.parish_id <> coalesce(v_my, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'You can only edit chapels from your own parish.' using errcode = '28000';
  end if;
  if v_role not in ('parish','diocese') then
    raise exception 'Only parish staff or diocese admins can edit chapels.' using errcode = '28000';
  end if;

  update public.parish_chapels set
    chapel_name     = coalesce(nullif(btrim(p_chapel_name),''), chapel_name),
    address         = coalesce(nullif(btrim(coalesce(p_address,'')),''), address),
    barangay        = coalesce(nullif(btrim(coalesce(p_barangay,'')),''), barangay),
    contact_number  = coalesce(nullif(btrim(coalesce(p_contact_number,'')),''), contact_number),
    patron_saint    = coalesce(nullif(btrim(coalesce(p_patron_saint,'')),''), patron_saint),
    notes           = coalesce(nullif(btrim(coalesce(p_notes,'')),''), notes),
    is_active       = coalesce(p_is_active, is_active),
    updated_at      = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_parish_chapel(uuid, text, text, text, text, text, text, boolean)
  to authenticated;

-- Delete a chapel (parish staff: only their own parish).
drop function if exists public.delete_parish_chapel(uuid);

create or replace function public.delete_parish_chapel(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role text := public.pc_current_role();
  v_my uuid := public.pc_current_parish_id();
  v_row public.parish_chapels;
begin
  select * into v_row from public.parish_chapels where id = p_id;
  if v_row.id is null then return false; end if;
  if v_role = 'parish' and v_row.parish_id <> coalesce(v_my, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'You can only delete chapels from your own parish.' using errcode = '28000';
  end if;
  if v_role not in ('parish','diocese') then
    raise exception 'Only parish staff or diocese admins can delete chapels.' using errcode = '28000';
  end if;
  delete from public.parish_chapels where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_parish_chapel(uuid) to authenticated;

-- Summary stats for the parish dashboard card.
drop function if exists public.parish_chapel_stats(uuid);

create or replace function public.parish_chapel_stats(p_parish_id uuid default null)
returns table (
  chapel_count bigint,
  active_chapel_count bigint,
  total_service_requests bigint,
  total_archive_records bigint
)
language sql stable security definer set search_path = public, auth as $$
  with scope as (
    select case
             when public.pc_current_role() = 'parish' then public.pc_current_parish_id()
             else p_parish_id
           end as pid
  )
  select
    (select count(*) from public.parish_chapels c, scope where scope.pid is null or c.parish_id = scope.pid),
    (select count(*) from public.parish_chapels c, scope where c.is_active and (scope.pid is null or c.parish_id = scope.pid)),
    (select count(*)
       from public.diocese_service_bookings b
       join public.parish_chapels c on c.id = b.chapel_id
      cross join scope
      where scope.pid is null or c.parish_id = scope.pid),
    (select count(*)
       from public.diocese_archive_records r
       join public.parish_chapels c on c.id = r.chapel_id
      cross join scope
      where scope.pid is null or c.parish_id = scope.pid);
$$;

grant execute on function public.parish_chapel_stats(uuid) to anon, authenticated;
