-- Delete your own row in diocese_service_bookings (My Requests).
-- SECURITY DEFINER: works even when parish_id RLS stacks with other policies.
--
-- PostgREST sometimes keeps returning "not in the schema cache" for an RPC
-- name even after you create it. This file defines ONLY:
--   public.umr_delete_own_booking(p_booking_id uuid)
-- so you get a clean new entry. The app calls this name first.
--
-- Run in Supabase → SQL Editor (whole file). Then try Delete again.
--
-- Safe to re-run.

drop function if exists public.delete_my_booking(uuid);
drop function if exists public.umr_delete_own_booking(uuid);

create function public.umr_delete_own_booking(p_booking_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  n int;
  v_uid uuid := auth.uid();
begin
  if p_booking_id is null then
    raise exception 'Booking id is required.' using errcode = '22023';
  end if;
  if v_uid is null then
    raise exception 'You must be signed in to delete a request.' using errcode = '28000';
  end if;

  delete from public.diocese_service_bookings
   where id = p_booking_id
     and booked_by = v_uid;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Request not found or you do not have permission to delete it.'
      using errcode = 'P0002';
  end if;
  return true;
end;
$$;

comment on function public.umr_delete_own_booking(uuid) is
  'My Requests: delete diocese_service_bookings row when booked_by = auth.uid().';

revoke all on function public.umr_delete_own_booking(uuid) from public;
grant execute on function public.umr_delete_own_booking(uuid) to anon;
grant execute on function public.umr_delete_own_booking(uuid) to authenticated;
grant execute on function public.umr_delete_own_booking(uuid) to service_role;

notify pgrst, 'reload schema';
