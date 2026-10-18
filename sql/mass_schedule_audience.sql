-- Mass schedule audience rules for public.parish_events.
-- Run after parish_events.sql and registered_users_profile_policies.sql.

alter table public.parish_events
  add column if not exists parish_id uuid references public.parishes(id) on delete cascade,
  add column if not exists audience_type text not null default 'main_parish',
  add column if not exists audience_area text;

-- Normalize legacy location labels and preserve existing event rows.
update public.parish_events
   set audience_type = case
         when lower(btrim(coalesce(location, ''))) like 'bec area:%' then 'bec_area'
         when lower(btrim(coalesce(location, ''))) like 'bec %' then 'bec_area'
         when lower(btrim(coalesce(location, ''))) like 'main parish%' then 'main_parish'
         else 'other'
       end,
       audience_area = case
         when lower(btrim(coalesce(location, ''))) like 'bec area:%'
           then btrim(substr(location, position(':' in location) + 1))
         when lower(btrim(coalesce(location, ''))) like 'bec %'
           then btrim(substr(location, 5))
         else null
       end
 where coalesce(event_type, '') ilike 'mass';

create index if not exists parish_events_mass_audience_idx
  on public.parish_events (parish_id, event_date, audience_type, lower(audience_area));

-- A user's address is the BEC area selector. Main Parish events are available
-- to every user in the same parish; BEC events require an exact case-insensitive
-- address match. Parish and diocese staff retain their unrestricted admin list.
create or replace function public.user_mass_schedules()
returns setof public.parish_events
language sql
stable
security definer
set search_path = public, auth
as $$
  select e.*
    from public.parish_events e
    join public.registered_users ru on ru.id = auth.uid()
   where coalesce(auth.jwt() -> 'user_metadata' ->> 'role',
                  auth.jwt() -> 'app_metadata' ->> 'role', '') = 'user'
     and coalesce(e.event_type, '') ilike 'mass'
     and e.event_date >= current_date
     and (
       e.parish_id = ru.parish_id
       or (e.parish_id is null and lower(btrim(e.parish_name)) = lower(btrim(ru.parish_name)))
     )
     and (
       e.audience_type = 'main_parish'
       or (
         e.audience_type = 'bec_area'
         and nullif(btrim(ru.address), '') is not null
         and lower(btrim(ru.address)) = lower(btrim(e.audience_area))
       )
     )
   order by e.event_date asc, e.start_time asc nulls last, e.title asc;
$$;

revoke all on function public.user_mass_schedules() from public, anon;
grant execute on function public.user_mass_schedules() to authenticated;

-- Make sure users can read their own address for profile rendering.
grant select on public.registered_users to authenticated;

-- Refresh the REST API after creating the schedules function.
notify pgrst, 'reload schema';
