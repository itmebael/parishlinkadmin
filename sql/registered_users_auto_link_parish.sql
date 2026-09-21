-- Auto-link registered users to their parish at sign-up time.
--
-- Context:
--   When a user signs up from a parish page, the registration form should put
--   the target parish into Supabase auth `user_metadata` (as either
--   `parish_id`, `parish_name`, or `parish`). This migration makes sure that
--   whenever a row is inserted into `public.registered_users`, the
--   `parish_id` column is populated from that signup metadata automatically,
--   so the user dashboard never shows "No linked parish" again.
--
--   It also backfills any existing rows where `parish_id` is null but the
--   corresponding `auth.users.raw_user_meta_data` carries parish info.

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Resolver: turn whatever is in auth user_metadata into a parishes.id
-- ---------------------------------------------------------------------------
create or replace function public.resolve_parish_id_for_auth_user(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  with meta as (
    select
      coalesce(u.raw_user_meta_data, '{}'::jsonb) as m,
      lower(coalesce(u.email, '')) as email
    from auth.users u
    where u.id = p_user_id
  )
  select coalesce(
    -- 1) explicit parish_id in user_metadata
    (
      select p.id
      from meta, public.parishes p
      where nullif(meta.m ->> 'parish_id', '') is not null
        and p.id::text = meta.m ->> 'parish_id'
      limit 1
    ),
    -- 2) parish_name in user_metadata
    (
      select p.id
      from meta, public.parishes p
      where nullif(meta.m ->> 'parish_name', '') is not null
        and lower(p.parish_name) = lower(meta.m ->> 'parish_name')
      limit 1
    ),
    -- 3) generic "parish" key (name or id)
    (
      select p.id
      from meta, public.parishes p
      where nullif(meta.m ->> 'parish', '') is not null
        and (
          lower(p.parish_name) = lower(meta.m ->> 'parish')
          or p.id::text = meta.m ->> 'parish'
        )
      limit 1
    )
  );
$$;

grant execute on function public.resolve_parish_id_for_auth_user(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger on registered_users: fill parish_id on insert/update when missing
-- ---------------------------------------------------------------------------
create or replace function public.registered_users_auto_link_parish()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_parish_id uuid;
begin
  if new.parish_id is not null then
    return new;
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(new.email)
  limit 1;

  if v_user_id is null then
    return new;
  end if;

  v_parish_id := public.resolve_parish_id_for_auth_user(v_user_id);

  if v_parish_id is not null then
    new.parish_id := v_parish_id;
  end if;

  return new;
end;
$$;

drop trigger if exists registered_users_auto_link_parish_trg
  on public.registered_users;

create trigger registered_users_auto_link_parish_trg
before insert or update of email, parish_id
on public.registered_users
for each row
execute function public.registered_users_auto_link_parish();

-- ---------------------------------------------------------------------------
-- Trigger on auth.users: create/refresh the registered_users row on sign-up
-- ---------------------------------------------------------------------------
-- Some projects create the `registered_users` row from the client after
-- signup, others rely on a DB-side trigger. We cover both: if the row does
-- not exist yet when a new auth user appears, we create it; if it already
-- exists (e.g. created by the client shortly after), we patch parish_id.

create or replace function public.handle_new_auth_user_parish_link()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_parish_id uuid;
  v_email text := lower(coalesce(new.email, ''));
  v_full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'fullName'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Member'
  );
begin
  -- Never block signup. If profile creation fails, allow auth.users row anyway.
  begin
    if v_email = '' then
      return new;
    end if;

    v_parish_id := public.resolve_parish_id_for_auth_user(new.id);

    -- Make this idempotent: client may also create the registered_users row.
    -- Always key the profile row by auth.users.id (primary key), and upsert.
    begin
      insert into public.registered_users (id, email, full_name, parish_id)
      values (new.id, v_email, v_full_name, v_parish_id)
      on conflict (id) do update
        set email = excluded.email,
            full_name = coalesce(public.registered_users.full_name, excluded.full_name),
            parish_id = coalesce(public.registered_users.parish_id, excluded.parish_id);
    exception
      when unique_violation then
        -- If a legacy row already exists with the same email, merge into it.
        update public.registered_users
           set id = new.id,
               full_name = coalesce(public.registered_users.full_name, v_full_name),
               parish_id = coalesce(public.registered_users.parish_id, v_parish_id)
         where lower(email) = v_email;
      when undefined_column then
        -- Fall back for schemas that don't have full_name.
        begin
          insert into public.registered_users (id, email, parish_id)
          values (new.id, v_email, v_parish_id)
          on conflict (id) do update
            set email = excluded.email,
                parish_id = coalesce(public.registered_users.parish_id, excluded.parish_id);
        exception
          when unique_violation then
            update public.registered_users
               set id = new.id,
                   parish_id = coalesce(public.registered_users.parish_id, v_parish_id)
             where lower(email) = v_email;
        end;
    end;
  exception
    when others then
      -- Intentionally swallow any error to prevent /auth/v1/signup from returning 500.
      -- (You can inspect Postgres logs in Supabase to see the original error.)
      return new;
  end;

  return new;
end;
$$;

drop trigger if exists handle_new_auth_user_parish_link_trg
  on auth.users;

create trigger handle_new_auth_user_parish_link_trg
after insert or update of raw_user_meta_data, email
on auth.users
for each row
execute function public.handle_new_auth_user_parish_link();

-- ---------------------------------------------------------------------------
-- One-time backfill for existing registered_users rows
-- ---------------------------------------------------------------------------
update public.registered_users ru
   set parish_id = sub.resolved_parish_id
  from (
    select
      u.id as auth_user_id,
      lower(u.email) as email,
      public.resolve_parish_id_for_auth_user(u.id) as resolved_parish_id
    from auth.users u
  ) as sub
 where ru.parish_id is null
   and lower(ru.email) = sub.email
   and sub.resolved_parish_id is not null;
