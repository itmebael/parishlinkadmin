-- Fix: archive records added by a parish account weren't appearing.
--
-- Root cause
-- ----------
-- The BEFORE INSERT trigger `diocese_archive_records_enforce_parish_id`
-- only tried to fill `parish_id` when the caller had
--     auth.jwt() -> 'user_metadata' ->> 'role' = 'parish'
-- That metadata flag isn't actually set on most parish accounts in
-- this deployment. For anyone without it, the trigger fell through to
-- the diocese branch, which only fills parish_id when the `church`
-- text exactly matches a parishes.parish_name row. So parish_id stayed
-- NULL on the new row, and the RLS read policy
--     parish_id = auth_parish_id()
-- then filtered it out. The record existed, but nobody could see it.
--
-- Fix
-- ----
-- 1. Replace the enforce function with a resolver that uses
--    public.auth_parish_id() as its primary signal (falls back to
--    church-name lookup for diocese admins inserting historical data).
-- 2. Loosen the INSERT policy so parish users can insert rows without
--    pre-setting parish_id -- the trigger will fill it server-side.
-- 3. Back-fill any historical rows that still have NULL parish_id from
--    their church name.
--
-- Depends on:
--   * sql/parish_id_policy.sql  (auth_parish_id / auth_role_kind)
--   * sql/parish_id_only_scoping.sql or parish_id_match_display.sql
--
-- Safe to re-run.

-- =========================================================================
-- 1. Replace the enforce trigger
-- =========================================================================
create or replace function public.diocese_archive_records_enforce_parish_id()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_my uuid := public.auth_parish_id();
  v_role text := public.auth_role_kind();
  v_inferred uuid;
begin
  -- Parish-linked account wins: force the row to belong to the caller.
  if v_my is not null and v_role <> 'diocese' then
    new.parish_id := v_my;
    return new;
  end if;

  -- Diocese admin: respect the explicit parish_id if given; otherwise
  -- try to infer from the `church` text (so uploading old ledgers
  -- auto-attaches to the right parish).
  if new.parish_id is null then
    if new.church is not null and btrim(new.church) <> '' then
      select p.id
        into v_inferred
        from public.parishes p
       where lower(btrim(p.parish_name)) = lower(btrim(new.church))
          or lower(btrim(p.parish_name)) = lower(btrim(replace(new.church, ' Parish', '')))
          or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(new.church))
          or new.church ilike '%' || p.parish_name || '%'
       order by char_length(p.parish_name) desc
       limit 1;
      if v_inferred is not null then
        new.parish_id := v_inferred;
      end if;
    end if;
  end if;

  -- If this is a parish-role user who for some reason still has no
  -- resolvable parish, block the insert early with a clear message.
  if v_role = 'parish' and new.parish_id is null then
    raise exception 'No parish is linked to this account. Ask an admin to set public.parishes.email to match your login email.'
      using errcode = '28000';
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_archive_records_enforce_parish_id on public.diocese_archive_records;
create trigger diocese_archive_records_enforce_parish_id
  before insert or update of parish_id, church
  on public.diocese_archive_records
  for each row execute function public.diocese_archive_records_enforce_parish_id();

-- =========================================================================
-- 2. Loosen the INSERT policy so parish users can insert without
--    pre-populating parish_id (trigger fills it). Read/update/delete
--    stay strictly scoped by parish_id.
-- =========================================================================
alter table public.diocese_archive_records enable row level security;

-- Drop any old parish-id insert/read policies so we install a clean set.
do $$
declare p record;
begin
  for p in (select policyname from pg_policies where schemaname='public' and tablename='diocese_archive_records') loop
    execute format('drop policy if exists %I on public.diocese_archive_records', p.policyname);
  end loop;
end $$;

create policy "Parish id read"
on public.diocese_archive_records
for select to anon, authenticated
using (
  public.auth_role_kind() = 'diocese'
  or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
);

-- Inserts: allow anyone authenticated. The trigger guarantees parish
-- users can only end up with their own parish_id. Diocese may specify
-- any parish_id (or none).
create policy "Parish id insert"
on public.diocese_archive_records
for insert to authenticated
with check (
  public.auth_role_kind() = 'diocese'
  or public.auth_parish_id() is not null
);

create policy "Parish id update"
on public.diocese_archive_records
for update to authenticated
using (
  public.auth_role_kind() = 'diocese'
  or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
)
with check (
  public.auth_role_kind() = 'diocese'
  or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
);

create policy "Parish id delete"
on public.diocese_archive_records
for delete to authenticated
using (
  public.auth_role_kind() = 'diocese'
  or (public.auth_parish_id() is not null and parish_id = public.auth_parish_id())
);

grant select on public.diocese_archive_records to anon;
grant select, insert, update, delete on public.diocese_archive_records to authenticated;
grant all on public.diocese_archive_records to service_role;

-- =========================================================================
-- 3. Backfill historical rows whose parish_id is still NULL from the
--    church name. Anything we still can't resolve is listed in a diag
--    view so staff can fix the church spelling (or assign the parish
--    by hand).
-- =========================================================================
update public.diocese_archive_records r
   set parish_id = p.id
  from public.parishes p
 where r.parish_id is null
   and r.church is not null
   and (
     lower(btrim(p.parish_name)) = lower(btrim(r.church))
     or lower(btrim(p.parish_name)) = lower(btrim(replace(r.church, ' Parish','')))
     or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(r.church))
     or r.church ilike '%' || p.parish_name || '%'
   );

create or replace view public.archive_records_missing_parish as
select id, record_type, first_name, middle_name, last_name, church, service_date
  from public.diocese_archive_records
 where parish_id is null
 order by created_at desc;

grant select on public.archive_records_missing_parish to anon, authenticated, service_role;

-- =========================================================================
-- 4. Bonus: make the same fix for diocese_service_bookings so newly
--    created bookings from parish users also land with the right
--    parish_id and become visible.
-- =========================================================================
do $$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='diocese_service_bookings') then
    return;
  end if;

  execute $fn$
    create or replace function public.diocese_service_bookings_fill_parish_id()
    returns trigger language plpgsql security definer set search_path = public, auth as $body$
    declare
      v_my uuid := public.auth_parish_id();
      v_role text := public.auth_role_kind();
    begin
      if v_my is not null and v_role <> 'diocese' then
        new.parish_id := v_my;
        if new.parish_name is null or btrim(new.parish_name) = '' then
          select parish_name into new.parish_name from public.parishes where id = v_my;
        end if;
        return new;
      end if;

      if new.parish_id is null and new.parish_name is not null then
        select p.id into new.parish_id
          from public.parishes p
         where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
            or lower(btrim(p.parish_name)) = lower(btrim(replace(new.parish_name, ' Parish','')))
            or lower(btrim(p.parish_name || ' Parish')) = lower(btrim(new.parish_name))
         limit 1;
      end if;
      return new;
    end;
    $body$
  $fn$;

  execute 'drop trigger if exists diocese_service_bookings_fill_parish_id on public.diocese_service_bookings';
  execute 'create trigger diocese_service_bookings_fill_parish_id
           before insert or update of parish_id, parish_name
           on public.diocese_service_bookings
           for each row execute function public.diocese_service_bookings_fill_parish_id()';
end $$;
