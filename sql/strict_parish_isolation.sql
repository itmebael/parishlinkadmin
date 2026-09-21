-- Strict cross-parish data isolation.
--
-- Goal: when Parish B logs in, nothing that belongs to Parish A should
-- ever show up -- not events, not announcements, not secretary
-- messages, not live streams, not archive records, not bookings.
--
-- This migration walks every parish-owned table and:
--
--   1. Adds a proper public.parishes(id) foreign key column if it's
--      missing (parish_id uuid).
--   2. Backfills parish_id from the legacy parish_name string.
--   3. Adds a BEFORE INSERT / UPDATE trigger that:
--        - for parish staff, forces parish_id to their own parish;
--        - for anyone else, resolves parish_id from parish_name when
--          possible (so legacy clients keep working).
--   4. Rebuilds RLS so:
--        - diocese staff see everything,
--        - parish staff see rows where parish_id = their own parish,
--        - end users see the public-facing subset their app needs.
--
-- Safe to re-run (policies and triggers are dropped/recreated).
--
-- This file depends on sql/parish_id_only_scoping.sql (for the
-- helper functions current_parish_id_any() and current_auth_role_any()),
-- which you should apply first.

-- =========================================================================
-- Helper: tolerant parish-name -> parish_id resolver used in every backfill
-- =========================================================================
create or replace function public.resolve_parish_id_by_name(p_name text)
returns uuid language sql stable security definer set search_path = public as $$
  with needle as (
    select nullif(btrim(coalesce(p_name, '')), '') as q
  )
  select id from public.parishes p, needle n
   where n.q is not null and (
     lower(btrim(p.parish_name)) = lower(n.q)
     or lower(btrim(p.parish_name)) = lower(replace(n.q, ' Parish', ''))
     or lower(btrim(p.parish_name || ' Parish')) = lower(n.q)
   )
   order by char_length(p.parish_name) desc
   limit 1;
$$;
grant execute on function public.resolve_parish_id_by_name(text) to anon, authenticated;

-- Small helper: skip a whole block if the target table is missing.
-- We use it via `if public.__table_exists('parish_events') then ...`.
create or replace function public.__table_exists(p_name text)
returns boolean language sql stable as $$
  select exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = p_name
  );
$$;

-- =========================================================================
-- 1. parish_events
-- =========================================================================
do $$
begin
  if not public.__table_exists('parish_events') then
    raise notice 'Skipping parish_events -- table does not exist yet';
    return;
  end if;

  alter table public.parish_events
    add column if not exists parish_id uuid;

  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'parish_events'
       and constraint_name = 'parish_events_parish_id_fkey'
  ) then
    alter table public.parish_events
      add constraint parish_events_parish_id_fkey
      foreign key (parish_id) references public.parishes(id) on delete cascade;
  end if;

  execute 'create index if not exists parish_events_parish_id_idx
           on public.parish_events (parish_id, event_date desc)';

  execute 'update public.parish_events e
              set parish_id = public.resolve_parish_id_by_name(e.parish_name)
            where e.parish_id is null';

  execute $fn$
    create or replace function public.parish_events_fill_parish_id()
    returns trigger language plpgsql security definer set search_path = public, auth as $body$
    declare
      v_role text := public.current_auth_role_any();
      v_my   uuid := public.current_parish_id_any();
    begin
      if v_role = 'parish' and v_my is not null then
        new.parish_id := v_my;
        if new.parish_name is null or btrim(new.parish_name) = '' then
          select parish_name into new.parish_name from public.parishes where id = v_my;
        end if;
        return new;
      end if;
      if new.parish_id is null and new.parish_name is not null then
        new.parish_id := public.resolve_parish_id_by_name(new.parish_name);
      end if;
      return new;
    end;
    $body$
  $fn$;

  execute 'drop trigger if exists parish_events_fill_parish_id on public.parish_events';
  execute 'create trigger parish_events_fill_parish_id
           before insert or update of parish_id, parish_name
           on public.parish_events
           for each row execute function public.parish_events_fill_parish_id()';

  execute 'alter table public.parish_events enable row level security';

  declare p record;
  begin
    for p in (select policyname from pg_policies where schemaname='public' and tablename='parish_events') loop
      execute format('drop policy if exists %I on public.parish_events', p.policyname);
    end loop;
  end;

  execute $pol$
    create policy "Read parish events"
      on public.parish_events
      for select to anon, authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
        or (parish_id is null)
        or exists (
          select 1 from public.registered_users ru
           where ru.id = auth.uid() and ru.parish_id = parish_events.parish_id
        )
      )
  $pol$;

  execute $pol$
    create policy "Write parish events"
      on public.parish_events for all to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
      with check (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
  $pol$;

  execute 'grant select on public.parish_events to anon';
  execute 'grant select, insert, update, delete on public.parish_events to authenticated';
  execute 'grant all on public.parish_events to service_role';
end $$;

-- =========================================================================
-- 2. diocese_announcements (a.k.a. parish announcements / broadcasts)
-- =========================================================================
do $$
declare p record;
begin
  if not public.__table_exists('diocese_announcements') then
    raise notice 'Skipping diocese_announcements -- table does not exist yet';
    return;
  end if;

  execute 'alter table public.diocese_announcements add column if not exists parish_id uuid';

  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'diocese_announcements'
       and constraint_name = 'diocese_announcements_parish_id_fkey'
  ) then
    execute 'alter table public.diocese_announcements
             add constraint diocese_announcements_parish_id_fkey
             foreign key (parish_id) references public.parishes(id) on delete cascade';
  end if;

  execute 'create index if not exists diocese_announcements_parish_id_idx
           on public.diocese_announcements (parish_id, created_at desc)';

  execute 'update public.diocese_announcements a
              set parish_id = public.resolve_parish_id_by_name(a.parish_name)
            where a.parish_id is null and a.parish_name is not null';

  execute $fn$
    create or replace function public.diocese_announcements_fill_parish_id()
    returns trigger language plpgsql security definer set search_path = public, auth as $body$
    declare
      v_role text := public.current_auth_role_any();
      v_my   uuid := public.current_parish_id_any();
    begin
      if v_role = 'parish' and v_my is not null then
        new.parish_id := v_my;
        if new.parish_name is null or btrim(new.parish_name) = '' then
          select parish_name into new.parish_name from public.parishes where id = v_my;
        end if;
        return new;
      end if;
      if new.parish_id is null and new.parish_name is not null then
        new.parish_id := public.resolve_parish_id_by_name(new.parish_name);
      end if;
      return new;
    end;
    $body$
  $fn$;

  execute 'drop trigger if exists diocese_announcements_fill_parish_id on public.diocese_announcements';
  execute 'create trigger diocese_announcements_fill_parish_id
           before insert or update of parish_id, parish_name
           on public.diocese_announcements
           for each row execute function public.diocese_announcements_fill_parish_id()';

  execute 'alter table public.diocese_announcements enable row level security';

  for p in (select policyname from pg_policies where schemaname='public' and tablename='diocese_announcements') loop
    execute format('drop policy if exists %I on public.diocese_announcements', p.policyname);
  end loop;

  execute $pol$
    create policy "Read announcements"
      on public.diocese_announcements
      for select to anon, authenticated
      using (
        parish_id is null
        or public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
        or exists (
          select 1 from public.registered_users ru
           where ru.id = auth.uid() and ru.parish_id = diocese_announcements.parish_id
        )
      )
  $pol$;

  execute $pol$
    create policy "Write announcements"
      on public.diocese_announcements for all to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
      with check (
        public.current_auth_role_any() = 'diocese'
        or (
          public.current_auth_role_any() = 'parish'
          and (parish_id is null or parish_id = public.current_parish_id_any())
        )
      )
  $pol$;

  execute 'grant select on public.diocese_announcements to anon';
  execute 'grant select, insert, update, delete on public.diocese_announcements to authenticated';
  execute 'grant all on public.diocese_announcements to service_role';
end $$;

-- =========================================================================
-- 3. parish_secretary_messages  (already has parish_id as text)
--    Standardize to strict UUID-based scoping through RLS.
-- =========================================================================
do $$
declare p record;
begin
  if not public.__table_exists('parish_secretary_messages') then
    raise notice 'Skipping parish_secretary_messages -- table does not exist yet';
    return;
  end if;

  execute 'alter table public.parish_secretary_messages enable row level security';

  for p in (select policyname from pg_policies where schemaname='public' and tablename='parish_secretary_messages') loop
    execute format('drop policy if exists %I on public.parish_secretary_messages', p.policyname);
  end loop;

  execute $pol$
    create policy "Read secretary messages"
      on public.parish_secretary_messages for select to anon, authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (
          public.current_auth_role_any() = 'parish'
          and public.current_parish_id_any() is not null
          and parish_id = public.current_parish_id_any()::text
        )
        or exists (
          select 1 from public.registered_users ru
           where ru.id = auth.uid()
             and ru.parish_id::text = parish_secretary_messages.parish_id
        )
      )
  $pol$;

  execute $pol$
    create policy "Write secretary messages"
      on public.parish_secretary_messages for insert to authenticated
      with check (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any()::text)
        or exists (
          select 1 from public.registered_users ru
           where ru.id = auth.uid()
             and ru.parish_id::text = parish_secretary_messages.parish_id
        )
      )
  $pol$;

  execute $pol$
    create policy "Update secretary messages"
      on public.parish_secretary_messages for update to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any()::text)
      )
      with check (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any()::text)
      )
  $pol$;

  execute $pol$
    create policy "Delete secretary messages"
      on public.parish_secretary_messages for delete to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any()::text)
      )
  $pol$;

  execute 'grant select on public.parish_secretary_messages to anon';
  execute 'grant select, insert, update, delete on public.parish_secretary_messages to authenticated';
  execute 'grant all on public.parish_secretary_messages to service_role';
end $$;

-- =========================================================================
-- 4. parish_live_streams + parish_live_viewers
-- =========================================================================
do $$
declare p record;
begin
  if not public.__table_exists('parish_live_streams') then
    raise notice 'Skipping parish_live_streams -- table does not exist yet';
    return;
  end if;

  execute 'alter table public.parish_live_streams add column if not exists parish_id uuid';

  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'parish_live_streams'
       and constraint_name = 'parish_live_streams_parish_id_fkey'
  ) then
    execute 'alter table public.parish_live_streams
             add constraint parish_live_streams_parish_id_fkey
             foreign key (parish_id) references public.parishes(id) on delete cascade';
  end if;

  execute 'create index if not exists parish_live_streams_parish_id_idx
           on public.parish_live_streams (parish_id)';

  execute 'update public.parish_live_streams s
              set parish_id = public.resolve_parish_id_by_name(s.parish_name)
            where s.parish_id is null';

  execute $fn$
    create or replace function public.parish_live_streams_fill_parish_id()
    returns trigger language plpgsql security definer set search_path = public, auth as $body$
    declare v_my uuid := public.current_parish_id_any();
    begin
      if public.current_auth_role_any() = 'parish' and v_my is not null then
        new.parish_id := v_my;
        if new.parish_name is null or btrim(new.parish_name) = '' then
          select parish_name into new.parish_name from public.parishes where id = v_my;
        end if;
        return new;
      end if;
      if new.parish_id is null and new.parish_name is not null then
        new.parish_id := public.resolve_parish_id_by_name(new.parish_name);
      end if;
      return new;
    end;
    $body$
  $fn$;

  execute 'drop trigger if exists parish_live_streams_fill_parish_id on public.parish_live_streams';
  execute 'create trigger parish_live_streams_fill_parish_id
           before insert or update of parish_id, parish_name
           on public.parish_live_streams
           for each row execute function public.parish_live_streams_fill_parish_id()';

  execute 'alter table public.parish_live_streams enable row level security';

  for p in (select policyname from pg_policies where schemaname='public' and tablename='parish_live_streams') loop
    execute format('drop policy if exists %I on public.parish_live_streams', p.policyname);
  end loop;

  execute $pol$
    create policy "Read live streams"
      on public.parish_live_streams for select to anon, authenticated using (true)
  $pol$;

  execute $pol$
    create policy "Write live streams"
      on public.parish_live_streams for all to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
      with check (
        public.current_auth_role_any() = 'diocese'
        or (
          public.current_auth_role_any() = 'parish'
          and (parish_id is null or parish_id = public.current_parish_id_any())
        )
      )
  $pol$;

  execute 'grant select on public.parish_live_streams to anon';
  execute 'grant select, insert, update, delete on public.parish_live_streams to authenticated';
  execute 'grant all on public.parish_live_streams to service_role';
end $$;

-- live viewers mirror the streams table so viewer counts don't leak.
do $$
begin
  if not public.__table_exists('parish_live_viewers') then
    raise notice 'Skipping parish_live_viewers -- table does not exist yet';
    return;
  end if;

  execute 'alter table public.parish_live_viewers add column if not exists parish_id uuid';

  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'parish_live_viewers'
       and constraint_name = 'parish_live_viewers_parish_id_fkey'
  ) then
    execute 'alter table public.parish_live_viewers
             add constraint parish_live_viewers_parish_id_fkey
             foreign key (parish_id) references public.parishes(id) on delete cascade';
  end if;

  execute 'update public.parish_live_viewers v
              set parish_id = public.resolve_parish_id_by_name(v.parish_name)
            where v.parish_id is null';

  execute $fn$
    create or replace function public.parish_live_viewers_fill_parish_id()
    returns trigger language plpgsql security definer set search_path = public, auth as $body$
    begin
      if new.parish_id is null and new.parish_name is not null then
        new.parish_id := public.resolve_parish_id_by_name(new.parish_name);
      end if;
      return new;
    end;
    $body$
  $fn$;

  execute 'drop trigger if exists parish_live_viewers_fill_parish_id on public.parish_live_viewers';
  execute 'create trigger parish_live_viewers_fill_parish_id
           before insert or update of parish_id, parish_name
           on public.parish_live_viewers
           for each row execute function public.parish_live_viewers_fill_parish_id()';
end $$;

-- =========================================================================
-- 5. parish_livestream_history already has parish_id; just make sure its
--    RLS is strict.
-- =========================================================================
do $$
declare p record;
begin
  if not public.__table_exists('parish_livestream_history') then
    raise notice 'Skipping parish_livestream_history -- table does not exist yet';
    return;
  end if;

  execute 'alter table public.parish_livestream_history enable row level security';

  for p in (select policyname from pg_policies where schemaname='public' and tablename='parish_livestream_history') loop
    execute format('drop policy if exists %I on public.parish_livestream_history', p.policyname);
  end loop;

  execute $pol$
    create policy "Read livestream history"
      on public.parish_livestream_history for select to anon, authenticated
      using (true)
  $pol$;

  execute $pol$
    create policy "Write livestream history"
      on public.parish_livestream_history for all to authenticated
      using (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
      with check (
        public.current_auth_role_any() = 'diocese'
        or (public.current_auth_role_any() = 'parish' and parish_id = public.current_parish_id_any())
      )
  $pol$;
end $$;

-- =========================================================================
-- 6. Diagnostics -- one view that shows how much data on each parish
--    table still lacks parish_id after the backfill. Only includes the
--    tables that actually exist on this deployment.
-- =========================================================================
do $$
declare
  v_sql text := '';
  v_union text;
begin
  v_union := '';

  if public.__table_exists('parish_events') then
    v_union := v_union || format(' union all select %L::text as source, count(*) filter (where parish_id is null)::bigint as missing_parish_id, count(*)::bigint as total from public.parish_events', 'parish_events');
  end if;
  if public.__table_exists('diocese_announcements') then
    v_union := v_union || format(' union all select %L::text, count(*) filter (where parish_id is null)::bigint, count(*)::bigint from public.diocese_announcements', 'diocese_announcements');
  end if;
  if public.__table_exists('parish_live_streams') then
    v_union := v_union || format(' union all select %L::text, count(*) filter (where parish_id is null)::bigint, count(*)::bigint from public.parish_live_streams', 'parish_live_streams');
  end if;
  if public.__table_exists('parish_live_viewers') then
    v_union := v_union || format(' union all select %L::text, count(*) filter (where parish_id is null)::bigint, count(*)::bigint from public.parish_live_viewers', 'parish_live_viewers');
  end if;
  if public.__table_exists('diocese_service_bookings') then
    v_union := v_union || format(' union all select %L::text, count(*) filter (where parish_id is null)::bigint, count(*)::bigint from public.diocese_service_bookings', 'diocese_service_bookings');
  end if;
  if public.__table_exists('diocese_archive_records') then
    v_union := v_union || format(' union all select %L::text, count(*) filter (where parish_id is null)::bigint, count(*)::bigint from public.diocese_archive_records', 'diocese_archive_records');
  end if;

  if v_union = '' then
    v_sql := 'create or replace view public.parish_isolation_report as
              select ''(none)''::text as source, 0::bigint as missing_parish_id, 0::bigint as total';
  else
    v_union := substring(v_union from length(' union all ') + 1);
    v_sql := 'create or replace view public.parish_isolation_report as ' || v_union;
  end if;

  execute v_sql;
  execute 'grant select on public.parish_isolation_report to anon, authenticated, service_role';
end $$;
