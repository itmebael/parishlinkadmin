-- Assign existing Confirmation and Marriage records to the specified parish.
begin;

update public.confirmation_records
set parish_id = 'c8fa11c8-ccf3-47b3-bdf2-5ca96234b598'::uuid;

update public.marriage_records
set parish_id = 'c8fa11c8-ccf3-47b3-bdf2-5ca96234b598'::uuid;

commit;
