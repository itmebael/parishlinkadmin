-- Parish service catalog + sub-type support for Book Parish Appointment.
--
-- Goal:
--   When the user opens "Book Parish Appointment" and picks a service
--   (e.g. "Mass Booking"), the form should show the list of sub-types for
--   that service (e.g. "Sunday Mass", "Funeral Mass", "Wedding Mass",
--   "Thanksgiving Mass", "Others"). Picking "Others" should reveal a free
--   text field so the user can type their own intention.
--
-- This migration adds:
--   1. Two new columns on public.diocese_service_bookings:
--        * service_subtype text  -- e.g. "Funeral Mass"
--        * service_details text  -- free text used when subtype = 'Others'
--   2. A reference table public.parish_service_catalog that the frontend
--      reads to populate the dropdowns. Seed data covers the common
--      Filipino-diocese offerings; parish staff can add/remove their own.
--   3. RLS so everyone can read the catalog, but only diocese/parish staff
--      can modify it.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Extra columns on the bookings table
-- ---------------------------------------------------------------------------
alter table public.diocese_service_bookings
  add column if not exists service_subtype text;

alter table public.diocese_service_bookings
  add column if not exists service_details text;

create index if not exists diocese_service_bookings_service_subtype_idx
  on public.diocese_service_bookings (lower(service_name), lower(service_subtype));

-- Normalise the new columns on save + enforce the two conditional fields:
--
--   * Service = "Mass Booking"   -> service_subtype is required
--                                   ("Type of Mass", e.g. Wedding Mass,
--                                    Funeral Mass, Thanksgiving Mass)
--   * Service = "Others" OR      -> service_details is required
--     service_subtype = "Others"    ("Other details")
create or replace function public.diocese_service_bookings_normalize_subtype()
returns trigger
language plpgsql
as $$
declare
  v_service text := lower(coalesce(btrim(new.service_name), ''));
  v_subtype text := lower(coalesce(btrim(new.service_subtype), ''));
begin
  if new.service_subtype is not null then
    new.service_subtype := nullif(btrim(new.service_subtype), '');
  end if;
  if new.service_details is not null then
    new.service_details := nullif(btrim(new.service_details), '');
  end if;

  -- Mass Booking must carry a Type of Mass.
  if v_service = 'mass booking'
     and new.service_subtype is null then
    raise exception using
      errcode = '22023',
      message = 'Please enter the Type of Mass (e.g. Wedding Mass, Funeral Mass, Thanksgiving Mass).',
      hint = 'parish_booking_mass_type_required';
  end if;

  -- "Others" (either as the service itself or as a subtype) needs details.
  if (v_service = 'others' or v_subtype = 'others')
     and new.service_details is null then
    raise exception using
      errcode = '22023',
      message = 'Please describe your request when choosing "Others".',
      hint = 'parish_booking_others_requires_details';
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_service_bookings_normalize_subtype_trg
  on public.diocese_service_bookings;

create trigger diocese_service_bookings_normalize_subtype_trg
before insert or update of service_name, service_subtype, service_details
on public.diocese_service_bookings
for each row
execute function public.diocese_service_bookings_normalize_subtype();

-- ---------------------------------------------------------------------------
-- 2. Catalog table
-- ---------------------------------------------------------------------------
create table if not exists public.parish_service_catalog (
  id uuid primary key default gen_random_uuid(),
  parish_name text,                  -- null = applies to every parish
  service_name text not null,        -- e.g. "Mass Booking"
  subtype text not null,             -- e.g. "Funeral Mass"
  description text,                  -- optional short help text
  requires_details boolean not null default false, -- forces the freetext box
  display_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coalesce(lower(parish_name), ''), lower(service_name), lower(subtype))
);

-- Backfill columns for upgrades where the table pre-existed
alter table public.parish_service_catalog
  add column if not exists parish_name text;
alter table public.parish_service_catalog
  add column if not exists description text;
alter table public.parish_service_catalog
  add column if not exists requires_details boolean not null default false;
alter table public.parish_service_catalog
  add column if not exists display_order int not null default 100;
alter table public.parish_service_catalog
  add column if not exists is_active boolean not null default true;
alter table public.parish_service_catalog
  add column if not exists created_at timestamptz not null default now();
alter table public.parish_service_catalog
  add column if not exists updated_at timestamptz not null default now();

create index if not exists parish_service_catalog_service_idx
  on public.parish_service_catalog (lower(service_name), display_order);

create index if not exists parish_service_catalog_parish_idx
  on public.parish_service_catalog (lower(coalesce(parish_name, '')));

-- Keep updated_at fresh.
drop trigger if exists parish_service_catalog_updated_at_trg
  on public.parish_service_catalog;

create trigger parish_service_catalog_updated_at_trg
before update on public.parish_service_catalog
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.parish_service_catalog enable row level security;

drop policy if exists "Read parish service catalog" on public.parish_service_catalog;
create policy "Read parish service catalog"
on public.parish_service_catalog
for select
to anon, authenticated
using (true);

drop policy if exists "Modify parish service catalog" on public.parish_service_catalog;
create policy "Modify parish service catalog"
on public.parish_service_catalog
for all
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or (
        public.current_staff_parish_name() is not null
        and lower(parish_name) = lower(public.current_staff_parish_name())
      )
    )
  )
)
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or (
        public.current_staff_parish_name() is not null
        and lower(parish_name) = lower(public.current_staff_parish_name())
      )
    )
  )
);

grant select on public.parish_service_catalog to anon, authenticated;
grant insert, update, delete on public.parish_service_catalog to authenticated;
grant all on public.parish_service_catalog to service_role;

-- ---------------------------------------------------------------------------
-- 4. Seed data (diocese-wide defaults; parish copies override)
-- ---------------------------------------------------------------------------
insert into public.parish_service_catalog (parish_name, service_name, subtype, description, requires_details, display_order)
values
  -- Mass Booking sub-types
  (null, 'Mass Booking', 'Sunday Mass',          'Regular Sunday celebration',                       false,  10),
  (null, 'Mass Booking', 'Weekday Mass',         'Weekday Eucharistic celebration',                  false,  20),
  (null, 'Mass Booking', 'Funeral / Requiem Mass','Mass for the deceased',                           false,  30),
  (null, 'Mass Booking', 'Wedding Mass',         'Nuptial Mass for matrimony',                       false,  40),
  (null, 'Mass Booking', 'Thanksgiving Mass',    'Mass of thanksgiving',                             false,  50),
  (null, 'Mass Booking', 'Anniversary Mass',     'Mass on an anniversary or memorial date',          false,  60),
  (null, 'Mass Booking', 'House Blessing Mass',  'Mass celebrated at a home',                        false,  70),
  (null, 'Mass Booking', 'Others',               'Describe a different mass intention',              true,  999),

  -- Baptism sub-types
  (null, 'Baptism', 'Infant Baptism',            'Baptism for an infant child',                      false,  10),
  (null, 'Baptism', 'Child Baptism',             'Baptism for older children',                       false,  20),
  (null, 'Baptism', 'Adult Baptism',             'Baptism for adults',                               false,  30),
  (null, 'Baptism', 'Others',                    'Describe another baptism request',                 true,  999),

  -- Wedding sub-types
  (null, 'Wedding', 'Nuptial Mass',              'Full wedding mass with Eucharist',                 false,  10),
  (null, 'Wedding', 'Wedding Ceremony',          'Wedding rite without mass',                        false,  20),
  (null, 'Wedding', 'Convalidation',             'Blessing/validation of a civil marriage',          false,  30),
  (null, 'Wedding', 'Others',                    'Describe another wedding-related request',         true,  999),

  -- Certificate sub-types
  (null, 'Certificate Request', 'Baptismal Certificate',    null, false,  10),
  (null, 'Certificate Request', 'Confirmation Certificate', null, false,  20),
  (null, 'Certificate Request', 'Marriage Certificate',     null, false,  30),
  (null, 'Certificate Request', 'Death Certificate',        null, false,  40),
  (null, 'Certificate Request', 'Others',                   'Describe another certificate request', true, 999),

  -- Blessings sub-types
  (null, 'Blessing', 'House Blessing',           null, false,  10),
  (null, 'Blessing', 'Vehicle Blessing',         null, false,  20),
  (null, 'Blessing', 'Business Blessing',        null, false,  30),
  (null, 'Blessing', 'Religious Articles',       null, false,  40),
  (null, 'Blessing', 'Others',                   'Describe another blessing request',                true,  999),

  -- Generic fallback so the UI never has an empty subtype list
  (null, 'Others', 'Others', 'Describe your request', true, 999)
on conflict (coalesce(lower(parish_name), ''), lower(service_name), lower(subtype))
do update set
  description      = excluded.description,
  requires_details = excluded.requires_details,
  display_order    = excluded.display_order,
  is_active        = true,
  updated_at       = now();

-- ---------------------------------------------------------------------------
-- 5. Helper RPC for the booking form
-- ---------------------------------------------------------------------------
--
--   // All active sub-types for a given service, scoped to the user's
--   // parish when signed in as parish staff.
--   const { data: subtypes } = await supabase.rpc("get_parish_service_subtypes", {
--     p_service_name: "Mass Booking",
--     p_parish_name: currentParishName,  // optional
--   });
--
--   // All services offered by the parish (populates the first dropdown)
--   const { data: services } = await supabase.rpc("get_parish_services", {
--     p_parish_name: currentParishName,
--   });

drop function if exists public.get_parish_services(text);
create or replace function public.get_parish_services(
  p_parish_name text default null
)
returns table (
  service_name text,
  subtype_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.service_name,
    count(*) as subtype_count
  from public.parish_service_catalog c
  where c.is_active
    and (
      c.parish_name is null
      or btrim(c.parish_name) = ''
      or p_parish_name is null
      or lower(c.parish_name) = lower(btrim(p_parish_name))
    )
  group by c.service_name
  order by c.service_name;
$$;

grant execute on function public.get_parish_services(text)
  to anon, authenticated;

drop function if exists public.get_parish_service_subtypes(text, text);
create or replace function public.get_parish_service_subtypes(
  p_service_name text,
  p_parish_name text default null
)
returns table (
  id uuid,
  parish_name text,
  service_name text,
  subtype text,
  description text,
  requires_details boolean,
  display_order int
)
language sql
stable
security definer
set search_path = public
as $$
  -- When both diocese-wide AND a parish-specific entry exist for the same
  -- (service, subtype), prefer the parish-specific row so parishes can
  -- override wording / description without duplicating the label.
  with candidates as (
    select
      c.*,
      row_number() over (
        partition by lower(c.service_name), lower(c.subtype)
        order by case when c.parish_name is not null and btrim(c.parish_name) <> '' then 0 else 1 end
      ) as rn
    from public.parish_service_catalog c
    where c.is_active
      and lower(c.service_name) = lower(btrim(p_service_name))
      and (
        c.parish_name is null
        or btrim(c.parish_name) = ''
        or p_parish_name is null
        or lower(c.parish_name) = lower(btrim(p_parish_name))
      )
  )
  select
    id,
    parish_name,
    service_name,
    subtype,
    description,
    requires_details,
    display_order
  from candidates
  where rn = 1
  order by
    -- "Others" always last
    case when lower(subtype) = 'others' then 1 else 0 end,
    display_order,
    subtype;
$$;

grant execute on function public.get_parish_service_subtypes(text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Conditional-field metadata for the booking form
-- ---------------------------------------------------------------------------
--
-- Tells the UI which of the two free-text fields to show based on the
-- selected service (and, optionally, subtype). The UI should call this
-- whenever the service dropdown changes.
--
--   const { data } = await supabase.rpc('get_parish_service_field_rules', {
--     p_service_name: selectedService,
--     p_subtype: selectedSubtype,  // nullable
--   }).single();
--
--   if (data.show_mass_type) {
--     <input label={data.mass_type_label} placeholder={data.mass_type_placeholder} required />
--   }
--   if (data.show_other_details) {
--     <textarea label={data.other_details_label} placeholder={data.other_details_placeholder} required />
--   }

drop function if exists public.get_parish_service_field_rules(text, text);

create or replace function public.get_parish_service_field_rules(
  p_service_name text,
  p_subtype text default null
)
returns table (
  show_mass_type boolean,
  mass_type_label text,
  mass_type_placeholder text,
  show_other_details boolean,
  other_details_label text,
  other_details_placeholder text
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select
      lower(coalesce(btrim(p_service_name), '')) as service,
      lower(coalesce(btrim(p_subtype), '')) as subtype
  )
  select
    (s.service = 'mass booking') as show_mass_type,
    'Type of Mass (fill only if Mass Booking)'::text as mass_type_label,
    'e.g. Wedding Mass, Funeral Mass, Thanksgiving Mass'::text as mass_type_placeholder,
    (s.service = 'others' or s.subtype = 'others') as show_other_details,
    'Other details (fill only if Other)'::text as other_details_label,
    'Describe your request'::text as other_details_placeholder
  from s;
$$;

grant execute on function public.get_parish_service_field_rules(text, text)
  to anon, authenticated;
