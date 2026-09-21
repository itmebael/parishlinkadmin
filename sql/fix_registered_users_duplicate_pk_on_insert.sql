-- Fix: duplicate key on registered_users_pkey during registration.
--
-- Some builds insert into public.registered_users from the client right after signup.
-- If a row for the same auth user already exists (e.g., created earlier), a plain
-- INSERT fails with:
--   duplicate key value violates unique constraint "registered_users_pkey"
--
-- This script makes INSERT idempotent by converting duplicate inserts into updates.
-- Safe to re-run.

create or replace function public.registered_users_insert_upsert_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pid uuid;
begin
  -- If the row already exists for this id, treat INSERT as UPDATE.
  if exists (select 1 from public.registered_users ru where ru.id = new.id) then
    -- If client sent only parish_name, resolve parish_id now (because returning NULL
    -- stops later BEFORE triggers from running).
    if new.parish_id is null and new.parish_name is not null and btrim(new.parish_name) <> '' then
      select p.id into v_pid
        from public.parishes p
       where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
          or lower(btrim(p.parish_name)) = lower(btrim(replace(new.parish_name, ' Parish', '')))
          or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(new.parish_name))
       limit 1;
      if v_pid is not null then
        new.parish_id := v_pid;
      end if;
    end if;

    update public.registered_users ru
       set email = coalesce(new.email, ru.email),
           full_name = coalesce(new.full_name, ru.full_name),
           phone_number = coalesce(new.phone_number, ru.phone_number),
           birthdate = coalesce(new.birthdate, ru.birthdate),
           address = coalesce(new.address, ru.address),
           civil_status = coalesce(new.civil_status, ru.civil_status),
           profile_picture_url = coalesce(new.profile_picture_url, ru.profile_picture_url),
           parish_id = coalesce(ru.parish_id, new.parish_id),
           parish_name = coalesce(ru.parish_name, new.parish_name),
           id_picture_url = coalesce(new.id_picture_url, ru.id_picture_url),
           id_picture_uploaded_at = coalesce(new.id_picture_uploaded_at, ru.id_picture_uploaded_at),
           id_picture_file_name = coalesce(new.id_picture_file_name, ru.id_picture_file_name),
           id_picture_file_type = coalesce(new.id_picture_file_type, ru.id_picture_file_type),
           id_picture_file_size = coalesce(new.id_picture_file_size, ru.id_picture_file_size),
           updated_at = now()
     where ru.id = new.id;

    return null; -- skip the insert
  end if;

  return new;
end;
$$;

drop trigger if exists registered_users_insert_upsert_guard_trg on public.registered_users;
create trigger registered_users_insert_upsert_guard_trg
before insert
on public.registered_users
for each row
execute function public.registered_users_insert_upsert_guard();

grant execute on function public.registered_users_insert_upsert_guard() to anon, authenticated;

