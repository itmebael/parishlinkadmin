-- Parish broadcast scoping.
--
-- Rule:
--   When a parish goes live (or publishes an announcement), every user who
--   is registered under that parish should see the broadcast on their
--   dashboard automatically. Users from other parishes should not.
--
-- This migration doesn't change any table schema; it adds helper RPCs the
-- dashboard can call so the "see my parish's broadcast" logic lives in the
-- database instead of depending on the frontend to join and filter manually.
--
-- Prerequisites:
--   * sql/registered_users_auto_link_parish.sql has been applied, so a
--     logged-in user has `registered_users.parish_id` set to the parish
--     they registered under.
--   * sql/parish_live_streams.sql has been applied.
--   * sql/diocese_announcements.sql has been applied.
--
-- Safe to re-run.

create or replace function public.get_my_parish_name()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.parish_name
    from public.registered_users ru
    join public.parishes p on p.id = ru.parish_id
   where lower(ru.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

grant execute on function public.get_my_parish_name()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live video broadcast for the signed-in user's parish
-- ---------------------------------------------------------------------------
--
--   const { data: stream } = await supabase
--     .rpc("get_my_parish_live_broadcast")
--     .single();
--
--   if (stream?.is_live) {
--     renderFrame(stream.frame_data);   // base64 JPEG
--   } else {
--     showOfflineState();
--   }
--
-- Returns exactly one row when the user is linked to a parish, zero rows
-- otherwise. The row mirrors `public.parish_live_streams` plus an
-- `is_linked` flag and a `last_seen_seconds` freshness counter the UI can
-- use to show "offline" if the broadcaster's last heartbeat is stale.

drop function if exists public.get_my_parish_live_broadcast();

create or replace function public.get_my_parish_live_broadcast()
returns table (
  id uuid,
  parish_name text,
  is_live boolean,
  is_fresh boolean,
  started_at timestamptz,
  updated_at timestamptz,
  last_seen_seconds integer,
  frame_data text,
  viewer_count integer
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with me as (
    select public.get_my_parish_name() as parish_name
  )
  select
    s.id,
    s.parish_name,
    s.is_live,
    (s.is_live and s.updated_at > now() - interval '15 seconds') as is_fresh,
    s.started_at,
    s.updated_at,
    greatest(0, extract(epoch from (now() - s.updated_at))::int) as last_seen_seconds,
    s.frame_data,
    s.viewer_count
  from public.parish_live_streams s, me
  where me.parish_name is not null
    and lower(s.parish_name) = lower(me.parish_name);
$$;

grant execute on function public.get_my_parish_live_broadcast()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- All broadcasts (for the diocese-wide "who's live right now" view)
-- ---------------------------------------------------------------------------
-- Only rows with a fresh heartbeat are considered truly live, so a parish
-- that crashed without flipping `is_live = false` stops appearing after a
-- few seconds.

drop function if exists public.list_live_parish_broadcasts();

create or replace function public.list_live_parish_broadcasts()
returns table (
  id uuid,
  parish_name text,
  started_at timestamptz,
  updated_at timestamptz,
  viewer_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.parish_name,
    s.started_at,
    s.updated_at,
    s.viewer_count
  from public.parish_live_streams s
  where s.is_live
    and s.updated_at > now() - interval '15 seconds'
  order by s.started_at asc nulls last, s.parish_name asc;
$$;

grant execute on function public.list_live_parish_broadcasts()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Text broadcasts (announcements) scoped to the user's parish
-- ---------------------------------------------------------------------------
-- Mirrors the `"Read scoped announcements"` RLS policy but packages it as a
-- one-shot RPC so the user dashboard doesn't have to manually filter on
-- parish_name, respect draft status, and paginate.
--
--   const { data: posts } = await supabase.rpc("get_my_parish_broadcasts", {
--     p_limit: 20,
--     p_since: null,   -- optional: ISO string, returns only posts after it
--   });

drop function if exists public.get_my_parish_broadcasts(int, timestamptz);

create or replace function public.get_my_parish_broadcasts(
  p_limit int default 20,
  p_since timestamptz default null
)
returns table (
  id uuid,
  parish_name text,
  title text,
  content text,
  audience text,
  status text,
  is_for_my_parish boolean,
  is_diocese_wide boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_parish text := public.get_my_parish_name();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 200));
begin
  return query
  select
    a.id,
    a.parish_name,
    a.title,
    a.content,
    a.audience,
    a.status,
    (
      v_parish is not null
      and lower(coalesce(a.parish_name, '')) = lower(v_parish)
    ) as is_for_my_parish,
    (a.parish_name is null or btrim(a.parish_name) = '') as is_diocese_wide,
    a.created_at,
    a.updated_at
  from public.diocese_announcements a
  where a.status <> 'Draft'
    and (
      -- Diocese-wide posts reach everybody
      a.parish_name is null
      or btrim(a.parish_name) = ''
      -- Parish-scoped posts reach only matching parish members
      or (v_parish is not null and lower(a.parish_name) = lower(v_parish))
    )
    and (p_since is null or a.created_at > p_since)
  order by a.created_at desc
  limit v_limit;
end;
$$;

grant execute on function public.get_my_parish_broadcasts(int, timestamptz)
  to anon, authenticated;
