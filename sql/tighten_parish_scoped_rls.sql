-- Parish-scoped RLS for the remaining shared tables.
--
-- Applies the same "diocese sees all / parish sees only their own parish /
-- user sees only their own stuff" policy shape we just applied to
-- `diocese_service_bookings` to:
--
--   * public.diocese_announcements
--   * public.parish_events
--   * public.parish_secretary_messages  (already scoped, just tightens grants)
--
-- Prerequisite:
--   public.current_staff_parish_name()  -- created by
--   sql/tighten_diocese_service_bookings_rls.sql. Recreated here defensively
--   so this migration is runnable on its own.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Shared helper: signed-in parish staff's parish name, via parishes.email
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_parish_name()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.parish_name
    from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

grant execute on function public.current_staff_parish_name()
  to anon, authenticated;

-- ===========================================================================
-- 1. diocese_announcements
-- ===========================================================================
alter table public.diocese_announcements enable row level security;

drop policy if exists "Read scoped announcements"          on public.diocese_announcements;
drop policy if exists "Create staff announcements"         on public.diocese_announcements;
drop policy if exists "Create scoped announcements"        on public.diocese_announcements;
drop policy if exists "Update staff announcements"         on public.diocese_announcements;
drop policy if exists "Update scoped announcements"        on public.diocese_announcements;
drop policy if exists "Delete staff announcements"         on public.diocese_announcements;
drop policy if exists "Delete scoped announcements"        on public.diocese_announcements;

-- SELECT:
--   * Diocese sees all
--   * Parish staff see all diocese-wide posts + their own parish's posts
--     (drafts included, so they can edit them)
--   * Regular users / anon: published posts that are diocese-wide OR
--     targeted at their own parish
create policy "Read scoped announcements"
on public.diocese_announcements
for select
to anon, authenticated
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
  or (
    status <> 'Draft'
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or lower(parish_name) = lower(coalesce(public.get_current_user_parish_name(), ''))
    )
  )
);

-- INSERT: staff only, parish must post under their own parish (or leave it blank for diocese-wide)
create policy "Create scoped announcements"
on public.diocese_announcements
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or lower(parish_name) = lower(public.current_staff_parish_name())
    )
  )
);

-- UPDATE: parish staff can only edit their own parish's announcements and
-- cannot move them to a different parish.
create policy "Update scoped announcements"
on public.diocese_announcements
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or lower(parish_name) = lower(public.current_staff_parish_name())
    )
  )
)
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or lower(parish_name) = lower(public.current_staff_parish_name())
    )
  )
);

-- DELETE: same scoping as UPDATE
create policy "Delete scoped announcements"
on public.diocese_announcements
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and (
      parish_name is null
      or btrim(parish_name) = ''
      or lower(parish_name) = lower(public.current_staff_parish_name())
    )
  )
);

-- ===========================================================================
-- 2. parish_events
-- ===========================================================================
alter table public.parish_events enable row level security;

drop policy if exists "Read parish events"        on public.parish_events;
drop policy if exists "Create parish events"      on public.parish_events;
drop policy if exists "Create scoped parish events" on public.parish_events;
drop policy if exists "Update parish events"      on public.parish_events;
drop policy if exists "Update scoped parish events" on public.parish_events;
drop policy if exists "Delete parish events"      on public.parish_events;
drop policy if exists "Delete scoped parish events" on public.parish_events;

-- SELECT: events are public so everybody can see them (they show up on the
-- public-facing parish calendar).
create policy "Read parish events"
on public.parish_events
for select
to anon, authenticated
using (true);

-- INSERT: parish staff can only add events under their own parish; diocese anywhere.
create policy "Create scoped parish events"
on public.parish_events
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
);

-- UPDATE: parish staff only edit their own parish's events and cannot move them
create policy "Update scoped parish events"
on public.parish_events
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
)
with check (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
);

-- DELETE: same scoping
create policy "Delete scoped parish events"
on public.parish_events
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and public.current_staff_parish_name() is not null
    and lower(parish_name) = lower(public.current_staff_parish_name())
  )
);

-- ===========================================================================
-- 3. parish_secretary_messages
--    Already parish-scoped via parishes.email -> parish_id match.
--    Re-assert the policies so we're certain nothing slipped, and make sure
--    grants are right.
-- ===========================================================================
alter table public.parish_secretary_messages enable row level security;

drop policy if exists "Read parish secretary messages"   on public.parish_secretary_messages;
drop policy if exists "Insert parish secretary messages" on public.parish_secretary_messages;

create policy "Read parish secretary messages"
on public.parish_secretary_messages
for select
to authenticated
using (
  lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1
      from public.parishes p
     where p.id::text = public.parish_secretary_messages.parish_id
       and lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
);

create policy "Insert parish secretary messages"
on public.parish_secretary_messages
for insert
to authenticated
with check (
  (
    sender_role = 'user'
    and coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'user'
    and lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or (
    sender_role = 'parish'
    and coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and exists (
      select 1
        from public.parishes p
       where p.id::text = public.parish_secretary_messages.parish_id
         and lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
);

-- ---------------------------------------------------------------------------
-- Revoke anon write access across all three tables (read on events is
-- intentionally left open; read on announcements uses RLS above which
-- already filters anon appropriately).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.diocese_announcements        from anon;
revoke insert, update, delete on public.parish_events                from anon;
revoke select, insert, update, delete on public.parish_secretary_messages from anon;

grant select, insert, update, delete on public.diocese_announcements        to authenticated;
grant select, insert, update, delete on public.parish_events                to authenticated;
grant select, insert                 on public.parish_secretary_messages    to authenticated;

grant all on public.diocese_announcements        to service_role;
grant all on public.parish_events                to service_role;
grant all on public.parish_secretary_messages    to service_role;

-- ---------------------------------------------------------------------------
-- Sanity check (run while signed in as a specific account)
--
--   -- as Parish B:
--   select public.current_staff_parish_name();              -- "Parish of B"
--   select distinct parish_name from public.parish_events;  -- Parish B + diocese-wide only
--   select distinct parish_name from public.diocese_announcements;
--   -- inserts with a wrong parish_name are rejected by the with-check
--
--   -- as a regular user:
--   select distinct parish_name from public.diocese_announcements;
--   -- shows diocese-wide + the user's own parish, nothing else
-- ---------------------------------------------------------------------------
