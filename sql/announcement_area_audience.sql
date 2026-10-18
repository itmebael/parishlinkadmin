-- Run after diocese_announcements.sql and parish_publishing.sql.
-- Uses the existing audience column; existing non-BEC announcements keep their scope.
begin;
create or replace function public.can_read_announcement_area(target_parish text, target_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when coalesce(target_audience, '') !~* '^BEC Area:' then true
  else auth.uid() is not null and (
    exists (
      select 1 from public.registered_users r
      where r.id = auth.uid()
        and exists (select 1 from public.parishes member_parish
          where lower(btrim(member_parish.parish_name)) = lower(btrim(target_parish))
            and (member_parish.id = r.parish_id or (r.parish_id is null
              and lower(btrim(r.parish_name)) = lower(btrim(target_parish)))))
        and nullif(btrim(r.address), '') is not null
        and lower(btrim(r.address)) = lower(btrim(regexp_replace(target_audience, '^BEC Area:\s*', '', 'i')))
    )
    or exists (
      select 1 from public.parishes p
      where lower(btrim(p.parish_name)) = lower(btrim(target_parish))
        and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
        and nullif(btrim(p.email), '') is not null
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  ) end;
$$;
revoke all on function public.can_read_announcement_area(text,text) from public;
grant execute on function public.can_read_announcement_area(text,text) to anon, authenticated;
alter table public.diocese_announcements enable row level security;
-- Restrictive policies are ANDed with the existing parish/status policies.
drop policy if exists announcement_bec_area_guard on public.diocese_announcements;
create policy announcement_bec_area_guard on public.diocese_announcements
as restrictive for select to anon, authenticated
using (public.can_read_announcement_area(parish_name, audience));

-- Apply the same audience gate when generating signed attachment URLs.
create or replace function public.can_read_parish_post_file(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_parish_post_file(object_name) or exists (
    select 1 from public.parish_bulletins b
    where b.parish_id::text = split_part(object_name, '/', 1)
      and b.status = 'Published' and public.can_read_parish_bulletin(b.parish_id)
      and b.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
  ) or exists (
    select 1 from public.diocese_announcements a
    join public.parishes p on a.parish_name = p.parish_name
    where p.id::text = split_part(object_name, '/', 1)
      and a.status = 'Published' and public.can_read_parish_bulletin(p.id)
      and public.can_read_announcement_area(a.parish_name, a.audience)
      and a.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
  );
$$;
revoke all on function public.can_read_parish_post_file(text) from public;
grant execute on function public.can_read_parish_post_file(text) to authenticated;
notify pgrst, 'reload schema';
commit;
