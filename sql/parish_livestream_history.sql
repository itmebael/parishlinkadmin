-- Parish Live Stream history.
--
-- Tracks every broadcast session (start -> end) so the Parish Live
-- Stream Control panel can show a "Broadcast history" list with
-- duration, peak viewer count, and who started it. Works alongside the
-- existing `public.parish_live_streams` "current status" row: a trigger
-- on that table auto-opens a new history row when `is_live` flips to
-- true and closes it when it flips back to false. A periodic peak-
-- viewer update on the same trigger path keeps stats accurate without
-- any frontend wiring.
--
-- Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.parish_livestream_history (
  id                 uuid primary key default gen_random_uuid(),
  parish_name        text not null,
  parish_id          uuid references public.parishes(id) on delete set null,
  title              text,
  notes              text,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  duration_seconds   integer generated always as (
    case when ended_at is null then null
         else greatest(0, extract(epoch from (ended_at - started_at))::int)
    end
  ) stored,
  peak_viewer_count  integer not null default 0,
  last_viewer_count  integer not null default 0,
  started_by_email   text,
  started_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists parish_livestream_history_parish_idx
  on public.parish_livestream_history (parish_id, started_at desc);

create index if not exists parish_livestream_history_parish_name_idx
  on public.parish_livestream_history (parish_name, started_at desc);

-- Only one "open" (ended_at IS NULL) row per parish at a time, so the
-- trigger can always find the session to close without ambiguity.
create unique index if not exists parish_livestream_history_open_per_parish_idx
  on public.parish_livestream_history (parish_name)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- 2. Auto-logger trigger on public.parish_live_streams
--
-- Rules:
--   * is_live false -> true  : open a new history row.
--   * is_live true  -> false : close the most recent open row for that
--                              parish (set ended_at = now()).
--   * stays true             : update the most recent open row's
--                              peak_viewer_count / last_viewer_count.
-- ---------------------------------------------------------------------------
create or replace function public.parish_live_streams_log_history()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_parish_id uuid;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_name  text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'display_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
    new.parish_name
  );
begin
  -- Best-effort link from parish_name -> parishes.id
  select p.id into v_parish_id
    from public.parishes p
   where lower(btrim(p.parish_name)) = lower(btrim(new.parish_name))
   limit 1;

  -- CASE A: went live (false -> true, OR a brand-new row that's already live)
  if (tg_op = 'INSERT' and new.is_live = true)
     or (tg_op = 'UPDATE' and coalesce(old.is_live, false) = false and new.is_live = true)
  then
    -- Close any stale open row first (belt & suspenders if the app
    -- missed a stop-broadcast call).
    update public.parish_livestream_history
       set ended_at = now(),
           updated_at = now()
     where parish_name = new.parish_name
       and ended_at is null;

    insert into public.parish_livestream_history (
      parish_name, parish_id,
      started_at,
      peak_viewer_count, last_viewer_count,
      started_by_email, started_by_name
    )
    values (
      new.parish_name, v_parish_id,
      coalesce(new.started_at, now()),
      coalesce(new.viewer_count, 0),
      coalesce(new.viewer_count, 0),
      nullif(v_email, ''),
      v_name
    );
    return new;
  end if;

  -- CASE B: went offline (true -> false)
  if tg_op = 'UPDATE'
     and coalesce(old.is_live, false) = true
     and coalesce(new.is_live, false) = false
  then
    update public.parish_livestream_history
       set ended_at = now(),
           peak_viewer_count = greatest(peak_viewer_count, coalesce(new.viewer_count, 0)),
           last_viewer_count = coalesce(new.viewer_count, 0),
           updated_at = now()
     where parish_name = new.parish_name
       and ended_at is null;
    return new;
  end if;

  -- CASE C: still live -> keep peak + last viewer counts fresh
  if coalesce(new.is_live, false) = true then
    update public.parish_livestream_history
       set peak_viewer_count = greatest(peak_viewer_count, coalesce(new.viewer_count, 0)),
           last_viewer_count = coalesce(new.viewer_count, 0),
           updated_at = now()
     where parish_name = new.parish_name
       and ended_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists parish_live_streams_log_history
  on public.parish_live_streams;

create trigger parish_live_streams_log_history
  after insert or update on public.parish_live_streams
  for each row
  execute function public.parish_live_streams_log_history();

-- ---------------------------------------------------------------------------
-- 3. RLS
--
-- Mirrors the public table for reads (so the User dashboard can also
-- show "Previous broadcasts" if you ever want that) but locks writes
-- down to the service role + the auto-logger trigger. Parish staff and
-- diocese admins can always read every history row for their scope.
-- ---------------------------------------------------------------------------
alter table public.parish_livestream_history enable row level security;

drop policy if exists "Read livestream history" on public.parish_livestream_history;
create policy "Read livestream history"
on public.parish_livestream_history
for select
to anon, authenticated
using (true);

-- Only the trigger (security definer) and service_role can write.
grant select on public.parish_livestream_history to anon, authenticated;
grant all on public.parish_livestream_history to service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC the UI calls
--
--   const { data } = await supabase.rpc('list_parish_livestream_history', {
--     p_parish_name: $e,      -- optional; when null + role='parish',
--                             -- defaults to the signed-in parish
--     p_limit: 20,
--     p_offset: 0,
--   });
--
-- Returns most recent first. For diocese admins, omit p_parish_name to
-- get every parish's history.
-- ---------------------------------------------------------------------------
drop function if exists public.list_parish_livestream_history(text, int, int);

create or replace function public.list_parish_livestream_history(
  p_parish_name text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  parish_name text,
  parish_id uuid,
  title text,
  notes text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  duration_label text,
  peak_viewer_count int,
  last_viewer_count int,
  started_by_email text,
  started_by_name text,
  is_live boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata'  ->> 'role',
    ''
  );
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_scope_name text := nullif(btrim(coalesce(p_parish_name, '')), '');
  v_staff_name text;
begin
  -- If parish staff, force scope to their own parish regardless of
  -- what the UI passed in.
  if v_role = 'parish' then
    select p.parish_name into v_staff_name
      from public.parishes p
     where lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
     limit 1;
    if v_staff_name is not null then
      v_scope_name := v_staff_name;
    end if;
  end if;

  return query
  select
    h.id,
    h.parish_name,
    h.parish_id,
    h.title,
    h.notes,
    h.started_at,
    h.ended_at,
    h.duration_seconds,
    case
      when h.ended_at is null then 'Live now'
      when h.duration_seconds is null then ''
      when h.duration_seconds < 60 then h.duration_seconds || 's'
      when h.duration_seconds < 3600 then (h.duration_seconds / 60) || 'm ' || (h.duration_seconds % 60) || 's'
      else (h.duration_seconds / 3600) || 'h ' || ((h.duration_seconds % 3600) / 60) || 'm'
    end as duration_label,
    h.peak_viewer_count,
    h.last_viewer_count,
    h.started_by_email,
    h.started_by_name,
    (h.ended_at is null) as is_live
  from public.parish_livestream_history h
  where (v_scope_name is null or h.parish_name = v_scope_name)
  order by h.started_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.list_parish_livestream_history(text, int, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lightweight aggregate for the dashboard header: total broadcasts,
--    total hours on air, last broadcast started_at.
-- ---------------------------------------------------------------------------
drop function if exists public.parish_livestream_stats(text);

create or replace function public.parish_livestream_stats(p_parish_name text default null)
returns table (
  parish_name text,
  total_broadcasts bigint,
  total_minutes_on_air bigint,
  last_started_at timestamptz,
  currently_live boolean,
  peak_viewers_all_time int
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(p_parish_name, 'All parishes') as parish_name,
    count(*)                                            as total_broadcasts,
    coalesce(sum(coalesce(duration_seconds, 0)), 0) / 60 as total_minutes_on_air,
    max(started_at)                                     as last_started_at,
    bool_or(ended_at is null)                           as currently_live,
    coalesce(max(peak_viewer_count), 0)                 as peak_viewers_all_time
  from public.parish_livestream_history h
  where (p_parish_name is null or h.parish_name = p_parish_name);
$$;

grant execute on function public.parish_livestream_stats(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. One-time backfill: if parishes are currently live, open their
--    history row so the trigger has something to close. Safe to re-run.
-- ---------------------------------------------------------------------------
insert into public.parish_livestream_history (
  parish_name, parish_id, started_at,
  peak_viewer_count, last_viewer_count
)
select
  s.parish_name,
  (select p.id from public.parishes p
    where lower(btrim(p.parish_name)) = lower(btrim(s.parish_name))
    limit 1),
  coalesce(s.started_at, s.updated_at, now()),
  coalesce(s.viewer_count, 0),
  coalesce(s.viewer_count, 0)
from public.parish_live_streams s
where s.is_live = true
  and not exists (
    select 1
      from public.parish_livestream_history h
     where h.parish_name = s.parish_name
       and h.ended_at is null
  );
