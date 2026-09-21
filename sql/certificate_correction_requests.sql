-- =============================================================
--  Certificate Correction Requests  (Batch 1 support file)
--
--  The "Correction" button on the user dashboard submits to the
--  existing diocese_service_bookings table with:
--      service_name     = 'Correction Request - <certificate type>'
--      booking_status   = 'Correction'
--      reference_number = 'COR-YYYYMMDD-XXXXXX'
--      requester_address packs: "Original reference: ... | Incorrect: ... | Correct: ..."
--  Supporting documents reuse the existing 'service-certificates'
--  Supabase storage bucket via certificate_file_url.
--
--  This file is OPTIONAL.  Running it:
--    1. Adds an index on booking_status so the parish can filter
--       correction requests quickly.
--    2. Creates a helper view `correction_requests` that extracts
--       the original reference, incorrect value, and correct value
--       from requester_address for easy parish review in SQL.
--    3. Re-grants the baseline privileges used by the app so the
--       feature keeps working with anon or authenticated callers.
--
--  Everything below is idempotent and safe to re-run.
-- =============================================================

-- ---- 1. Fast filtering by booking_status ----
create index if not exists diocese_service_bookings_booking_status_idx
  on public.diocese_service_bookings (booking_status);

-- ---- 2. Partial index for the "Correction" queue ----
create index if not exists diocese_service_bookings_corrections_idx
  on public.diocese_service_bookings (created_at desc)
  where booking_status = 'Correction';

-- ---- 3. Parish-facing helper view ----
create or replace view public.correction_requests as
with raw as (
  select
    id,
    reference_number,
    parish_name,
    client_name,
    father_name,
    service_name,
    booking_status,
    booking_date,
    booking_time,
    cost,
    requester_address,
    certificate_file_name,
    certificate_file_type,
    certificate_file_size,
    certificate_file_url,
    certificate_uploaded_at,
    created_at,
    updated_at
  from public.diocese_service_bookings
  where booking_status = 'Correction'
     or service_name ilike 'Correction Request%'
)
select
  id,
  reference_number,
  parish_name,
  client_name,
  father_name,
  -- "Correction Request - Baptismal Certificate" -> "Baptismal Certificate"
  case
    when service_name ilike 'Correction Request - %'
      then trim(substring(service_name from length('Correction Request - ') + 1))
    else service_name
  end as certificate_type,
  booking_status,
  booking_date,
  booking_time,
  cost,
  -- Extract "Original reference: XYZ" when present
  nullif(
    trim(
      substring(
        requester_address
        from 'Original reference:\s*([^|]+)'
      )
    ),
    ''
  ) as original_reference,
  -- Extract "Incorrect: ..." up to the next "|"
  nullif(
    trim(
      substring(
        requester_address
        from 'Incorrect:\s*([^|]+)'
      )
    ),
    ''
  ) as incorrect_value,
  -- Extract "Correct: ..." up to end-of-string or next "|"
  nullif(
    trim(
      substring(
        requester_address
        from 'Correct:\s*([^|]+)'
      )
    ),
    ''
  ) as correct_value,
  requester_address as raw_details,
  certificate_file_name   as supporting_file_name,
  certificate_file_type   as supporting_file_type,
  certificate_file_size   as supporting_file_size,
  certificate_file_url    as supporting_file_url,
  certificate_uploaded_at as supporting_uploaded_at,
  created_at,
  updated_at
from raw
order by created_at desc;

comment on view public.correction_requests is
  'Parish-facing view of certificate correction submissions created via the user dashboard Correction button.';

grant select on public.correction_requests to anon, authenticated;
grant all    on public.correction_requests to service_role;

-- ---- 4. Re-assert baseline grants (same as diocese_service_bookings.sql) ----
grant select, insert, update, delete
  on public.diocese_service_bookings
  to anon, authenticated;

grant all
  on public.diocese_service_bookings
  to service_role;

-- ---- 5. Ensure the supporting-document bucket + storage policies exist ----
-- (Safe no-op if diocese_service_bookings.sql has already been run.)
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
  public           = excluded.public,
  file_size_limit  = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

-- =============================================================
--  Verify:
--      select * from public.correction_requests;
--  New correction requests submitted through the user dashboard
--  will appear here with the original reference, incorrect value,
--  correct value, and supporting file link already split out.
-- =============================================================
