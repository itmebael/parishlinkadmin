create extension if not exists pgcrypto;

create table if not exists public.diocese_archive_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null default 'Baptism',
  first_name text not null,
  middle_name text,
  last_name text not null,
  mother_name text,
  mother_last_name text,
  father_name text,
  father_last_name text,
  born_in text,
  born_on date,
  service_date date,
  rev_name text,
  church text,
  register_no text,
  page_no text,
  line_no text,
  scanned_file_name text,
  scanned_file_type text,
  scanned_file_size bigint,
  scanned_file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diocese_archive_records
  add column if not exists record_type text;

alter table public.diocese_archive_records
  add column if not exists first_name text;

alter table public.diocese_archive_records
  add column if not exists middle_name text;

alter table public.diocese_archive_records
  add column if not exists last_name text;

alter table public.diocese_archive_records
  add column if not exists mother_name text;

alter table public.diocese_archive_records
  add column if not exists mother_last_name text;

alter table public.diocese_archive_records
  add column if not exists father_name text;

alter table public.diocese_archive_records
  add column if not exists father_last_name text;

alter table public.diocese_archive_records
  add column if not exists born_in text;

alter table public.diocese_archive_records
  add column if not exists born_on date;

alter table public.diocese_archive_records
  add column if not exists service_date date;

alter table public.diocese_archive_records
  add column if not exists rev_name text;

alter table public.diocese_archive_records
  add column if not exists church text;

alter table public.diocese_archive_records
  add column if not exists register_no text;

alter table public.diocese_archive_records
  add column if not exists page_no text;

alter table public.diocese_archive_records
  add column if not exists line_no text;

alter table public.diocese_archive_records
  add column if not exists scanned_file_name text;

alter table public.diocese_archive_records
  add column if not exists scanned_file_type text;

alter table public.diocese_archive_records
  add column if not exists scanned_file_size bigint;

alter table public.diocese_archive_records
  add column if not exists scanned_file_url text;

alter table public.diocese_archive_records
  add column if not exists created_at timestamptz not null default now();

alter table public.diocese_archive_records
  add column if not exists updated_at timestamptz not null default now();

update public.diocese_archive_records
set
  record_type = coalesce(nullif(trim(record_type), ''), 'Baptism'),
  first_name = coalesce(nullif(trim(first_name), ''), 'Unknown'),
  last_name = coalesce(nullif(trim(last_name), ''), 'Unknown')
where record_type is null
  or first_name is null
  or last_name is null;

alter table public.diocese_archive_records
  alter column record_type set not null;

alter table public.diocese_archive_records
  alter column record_type set default 'Baptism';

alter table public.diocese_archive_records
  alter column first_name set not null;

alter table public.diocese_archive_records
  alter column last_name set not null;

create index if not exists diocese_archive_records_created_at_idx
  on public.diocese_archive_records (created_at desc);

create index if not exists diocese_archive_records_record_type_idx
  on public.diocese_archive_records (record_type);

create index if not exists diocese_archive_records_service_date_idx
  on public.diocese_archive_records (service_date desc);

create index if not exists diocese_archive_records_church_idx
  on public.diocese_archive_records (church);

create index if not exists diocese_archive_records_last_name_idx
  on public.diocese_archive_records (last_name);

create index if not exists diocese_archive_records_register_idx
  on public.diocese_archive_records (register_no, page_no, line_no);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archive-record-files',
  'archive-record-files',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on public.diocese_archive_records
  to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_diocese_archive_records_updated_at
  on public.diocese_archive_records;

create trigger set_diocese_archive_records_updated_at
before update on public.diocese_archive_records
for each row
execute function public.set_updated_at();

alter table public.diocese_archive_records enable row level security;

drop policy if exists "Read archive records"
  on public.diocese_archive_records;

create policy "Read archive records"
on public.diocese_archive_records
for select
to anon, authenticated
using (true);

drop policy if exists "Create archive records"
  on public.diocese_archive_records;

create policy "Create archive records"
on public.diocese_archive_records
for insert
to anon, authenticated
with check (true);

drop policy if exists "Update archive records"
  on public.diocese_archive_records;

create policy "Update archive records"
on public.diocese_archive_records
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Delete archive records"
  on public.diocese_archive_records;

create policy "Delete archive records"
on public.diocese_archive_records
for delete
to anon, authenticated
using (true);

drop policy if exists "Read archive record files"
  on storage.objects;

create policy "Read archive record files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'archive-record-files');

drop policy if exists "Create archive record files"
  on storage.objects;

create policy "Create archive record files"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'archive-record-files');

drop policy if exists "Update archive record files"
  on storage.objects;

create policy "Update archive record files"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'archive-record-files')
with check (bucket_id = 'archive-record-files');
