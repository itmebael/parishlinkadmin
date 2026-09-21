create extension if not exists pgcrypto;

create table if not exists public.diocese_service_bookings (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null default ('CERT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  parish_name text not null,
  client_first_name text,
  client_middle_name text,
  client_last_name text,
  client_name text not null,
  mother_name text,
  mother_last_name text,
  father_name text not null,
  father_last_name text,
  service_name text not null,
  booked_by uuid references auth.users (id) on delete set null default auth.uid(),
  requester_age integer,
  requester_gender text,
  requester_birthday date,
  requester_address text,
  cost numeric(12, 2) not null default 0,
  booking_status text not null default 'Booked',
  booking_date date not null default current_date,
  booking_time time,
  certificate_file_name text,
  certificate_file_type text,
  certificate_file_size bigint,
  certificate_file_url text,
  certificate_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diocese_service_bookings_cost_check check (cost >= 0)
);

alter table public.diocese_service_bookings
  add column if not exists booking_date date not null default current_date;

alter table public.diocese_service_bookings
  add column if not exists booking_time time;

alter table public.diocese_service_bookings
  add column if not exists certificate_file_name text;

alter table public.diocese_service_bookings
  add column if not exists certificate_file_type text;

alter table public.diocese_service_bookings
  add column if not exists certificate_file_size bigint;

alter table public.diocese_service_bookings
  add column if not exists certificate_file_url text;

alter table public.diocese_service_bookings
  add column if not exists certificate_uploaded_at timestamptz;

alter table public.diocese_service_bookings
  add column if not exists reference_number text;

alter table public.diocese_service_bookings
  add column if not exists parish_name text;

alter table public.diocese_service_bookings
  add column if not exists client_name text;

alter table public.diocese_service_bookings
  add column if not exists client_first_name text;

alter table public.diocese_service_bookings
  add column if not exists client_middle_name text;

alter table public.diocese_service_bookings
  add column if not exists client_last_name text;

alter table public.diocese_service_bookings
  add column if not exists mother_name text;

alter table public.diocese_service_bookings
  add column if not exists mother_last_name text;

alter table public.diocese_service_bookings
  add column if not exists father_name text;

alter table public.diocese_service_bookings
  add column if not exists father_last_name text;

alter table public.diocese_service_bookings
  add column if not exists service_name text;

alter table public.diocese_service_bookings
  add column if not exists booked_by uuid references auth.users (id) on delete set null default auth.uid();

alter table public.diocese_service_bookings
  add column if not exists requester_age integer;

alter table public.diocese_service_bookings
  add column if not exists requester_gender text;

alter table public.diocese_service_bookings
  add column if not exists requester_birthday date;

alter table public.diocese_service_bookings
  add column if not exists requester_address text;

alter table public.diocese_service_bookings
  add column if not exists cost numeric(12, 2) default 0;

alter table public.diocese_service_bookings
  add column if not exists booking_status text default 'Booked';

alter table public.diocese_service_bookings
  add column if not exists created_at timestamptz not null default now();

alter table public.diocese_service_bookings
  add column if not exists updated_at timestamptz not null default now();

update public.diocese_service_bookings
set
  parish_name = coalesce(nullif(trim(parish_name), ''), 'Parish Of Catbalogan'),
  client_name = coalesce(nullif(trim(client_name), ''), 'Unknown Client'),
  father_name = coalesce(nullif(trim(father_name), ''), 'Not Provided'),
  service_name = coalesce(nullif(trim(service_name), ''), 'Certificate Booking'),
  cost = coalesce(cost, 0),
  booking_status = coalesce(nullif(trim(booking_status), ''), 'Booked')
where
  parish_name is null
  or client_name is null
  or father_name is null
  or service_name is null
  or cost is null
  or booking_status is null;

update public.diocese_service_bookings
set
  client_first_name = coalesce(nullif(trim(client_first_name), ''), nullif(split_part(client_name, ' ', 1), '')),
  client_last_name = coalesce(
    nullif(trim(client_last_name), ''),
    nullif(regexp_replace(client_name, '^\S+\s*', ''), '')
  )
where client_name is not null
  and (client_first_name is null or client_last_name is null);

update public.diocese_service_bookings
set reference_number = 'CERT-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(id::text, 1, 8))
where reference_number is null;

alter table public.diocese_service_bookings
  alter column parish_name set not null;

alter table public.diocese_service_bookings
  alter column client_name set not null;

alter table public.diocese_service_bookings
  alter column father_name set not null;

alter table public.diocese_service_bookings
  alter column service_name set not null;

alter table public.diocese_service_bookings
  alter column cost set not null;

alter table public.diocese_service_bookings
  alter column cost set default 0;

alter table public.diocese_service_bookings
  alter column booking_status set not null;

alter table public.diocese_service_bookings
  alter column booking_status set default 'Booked';

alter table public.diocese_service_bookings
  alter column reference_number set not null;

alter table public.diocese_service_bookings
  alter column reference_number set default ('CERT-' || upper(substr(gen_random_uuid()::text, 1, 8)));

alter table public.diocese_service_bookings
  alter column booked_by set default auth.uid();

create index if not exists diocese_service_bookings_created_at_idx
  on public.diocese_service_bookings (created_at desc);

create unique index if not exists diocese_service_bookings_reference_number_idx
  on public.diocese_service_bookings (reference_number);

create index if not exists diocese_service_bookings_parish_name_idx
  on public.diocese_service_bookings (parish_name);

create index if not exists diocese_service_bookings_client_last_name_idx
  on public.diocese_service_bookings (client_last_name);

create index if not exists diocese_service_bookings_requester_birthday_idx
  on public.diocese_service_bookings (requester_birthday);

create index if not exists diocese_service_bookings_booking_date_idx
  on public.diocese_service_bookings (booking_date);

create index if not exists diocese_service_bookings_booked_by_idx
  on public.diocese_service_bookings (booked_by);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-certificates',
  'service-certificates',
  true,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.diocese_service_bookings
  from public;

grant select, insert, update, delete
  on public.diocese_service_bookings
  to anon, authenticated;

grant all
  on public.diocese_service_bookings
  to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_diocese_service_bookings_updated_at
  on public.diocese_service_bookings;

create trigger set_diocese_service_bookings_updated_at
before update on public.diocese_service_bookings
for each row
execute function public.set_updated_at();

alter table public.diocese_service_bookings enable row level security;

drop policy if exists "Read service bookings"               on public.diocese_service_bookings;
drop policy if exists "Read own service bookings"            on public.diocese_service_bookings;
drop policy if exists "Create service bookings"              on public.diocese_service_bookings;
drop policy if exists "Create own service bookings"          on public.diocese_service_bookings;
drop policy if exists "Update service bookings"              on public.diocese_service_bookings;
drop policy if exists "Update own or staff service bookings" on public.diocese_service_bookings;
drop policy if exists "Update staff service bookings"        on public.diocese_service_bookings;
drop policy if exists "Delete service bookings"              on public.diocese_service_bookings;
drop policy if exists "Delete staff service bookings"        on public.diocese_service_bookings;
drop policy if exists "Public read service bookings"         on public.diocese_service_bookings;
drop policy if exists "Public write service bookings"        on public.diocese_service_bookings;
drop policy if exists "Public update service bookings"       on public.diocese_service_bookings;
drop policy if exists "Public delete service bookings"       on public.diocese_service_bookings;

create policy "Public read service bookings"
  on public.diocese_service_bookings
  for select
  to anon, authenticated
  using (true);

create policy "Public write service bookings"
  on public.diocese_service_bookings
  for insert
  to anon, authenticated
  with check (true);

create policy "Public update service bookings"
  on public.diocese_service_bookings
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public delete service bookings"
  on public.diocese_service_bookings
  for delete
  to anon, authenticated
  using (true);

drop policy if exists "Read service certificates"   on storage.objects;
drop policy if exists "Create service certificates" on storage.objects;
drop policy if exists "Update service certificates" on storage.objects;
drop policy if exists "Delete service certificates" on storage.objects;

create policy "Read service certificates"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'service-certificates');

create policy "Create service certificates"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'service-certificates');

create policy "Update service certificates"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'service-certificates')
  with check (bucket_id = 'service-certificates');

create policy "Delete service certificates"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'service-certificates');

create or replace function public.get_parish_booking_calendar_rows(
  parish_search text default 'Catbalogan',
  start_date date default current_date,
  end_date date default (current_date + 120)
)
returns table (
  id uuid,
  parish_name text,
  client_name text,
  service_name text,
  booking_status text,
  booking_date date,
  booking_time time,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    bookings.id,
    bookings.parish_name,
    coalesce(nullif(trim(bookings.client_name), ''), 'Reserved') as client_name,
    coalesce(nullif(trim(bookings.service_name), ''), 'Parish booking') as service_name,
    coalesce(bookings.booking_status, 'Booked') as booking_status,
    coalesce(bookings.booking_date, bookings.created_at::date) as booking_date,
    bookings.booking_time,
    bookings.created_at
  from public.diocese_service_bookings as bookings
  where bookings.parish_name ilike ('%' || parish_search || '%')
    and coalesce(bookings.booking_date, bookings.created_at::date) between start_date and end_date
  order by coalesce(bookings.booking_date, bookings.created_at::date) asc,
    bookings.booking_time asc nulls last;
$$;

grant execute on function public.get_parish_booking_calendar_rows(text, date, date)
  to anon, authenticated;
