-- =============================================================
-- Parish Live Streams
-- Cross-device live-broadcast status & frame relay for the
-- Diocese portal.  The parish side upserts a row + writes the
-- latest JPEG data URL as a heartbeat; the user side polls this
-- table to see which parishes are live and render the latest frame.
--
-- Run this file in the Supabase SQL editor once.  It is safe to
-- re-run: all statements are idempotent.
-- =============================================================

create extension if not exists pgcrypto;

create table if not exists public.parish_live_streams (
  id             uuid primary key default gen_random_uuid(),
  parish_name    text not null unique,
  is_live        boolean not null default false,
  started_at     timestamptz,
  updated_at     timestamptz not null default now(),
  frame_data     text,
  viewer_count   integer not null default 0
);

create index if not exists parish_live_streams_live_idx
  on public.parish_live_streams (is_live, updated_at desc);

-- RLS: allow both anon and authenticated users to read / write.
-- The app does not require auth for the live-stream feature.
alter table public.parish_live_streams enable row level security;

drop policy if exists "parish_live_streams_select" on public.parish_live_streams;
create policy "parish_live_streams_select"
  on public.parish_live_streams
  for select
  to anon, authenticated
  using (true);

drop policy if exists "parish_live_streams_modify" on public.parish_live_streams;
create policy "parish_live_streams_modify"
  on public.parish_live_streams
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.parish_live_streams
  to anon, authenticated;
grant all on public.parish_live_streams to service_role;

-- =============================================================
-- Parish Live Viewers  (cross-device viewer heartbeats)
-- Each viewer upserts a row keyed by viewer_id while watching.
-- The parish broadcaster counts rows whose last_seen is fresh to
-- get an accurate viewer count across devices.
-- =============================================================

create table if not exists public.parish_live_viewers (
  viewer_id    text primary key,
  parish_name  text not null,
  last_seen    timestamptz not null default now()
);

create index if not exists parish_live_viewers_parish_idx
  on public.parish_live_viewers (parish_name, last_seen desc);

alter table public.parish_live_viewers enable row level security;

drop policy if exists "parish_live_viewers_select" on public.parish_live_viewers;
create policy "parish_live_viewers_select"
  on public.parish_live_viewers
  for select
  to anon, authenticated
  using (true);

drop policy if exists "parish_live_viewers_modify" on public.parish_live_viewers;
create policy "parish_live_viewers_modify"
  on public.parish_live_viewers
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.parish_live_viewers
  to anon, authenticated;
grant all on public.parish_live_viewers to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
