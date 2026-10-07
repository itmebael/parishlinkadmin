-- Run after diocese_announcements.sql, parishes.sql, and registered_users setup.
-- Re-runnable. Existing announcement access policies remain in force.
begin;
alter table public.diocese_announcements
  add column if not exists category text not null default 'Notice',
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb;
comment on column public.diocese_announcements.photo_urls is
  'HTTPS image URLs. Private storage URLs require an authenticated download or a newly signed URL.';

create table if not exists public.parish_bulletins (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null references public.parishes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  category text not null default 'Parish matters' check (category in (
    'Project transparency', 'Donations & contributions', 'Visiting priests', 'Fundraising', 'Parish matters'
  )),
  status text not null default 'Draft' check (status in ('Draft', 'Published', 'Archived')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parish_bulletin_publication_date check (status <> 'Published' or published_at is not null)
);
alter table public.parish_bulletins
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb;
create index if not exists parish_bulletins_feed_idx
  on public.parish_bulletins(parish_id, status, published_at desc);

create or replace function public.can_publish_parish_bulletin(target_parish uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.parishes p join auth.users u on u.id = auth.uid()
    where p.id = target_parish and u.email_confirmed_at is not null
      and lower(btrim(p.email)) = lower(btrim(u.email))
  );
$$;
create or replace function public.can_read_parish_bulletin(target_parish uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_publish_parish_bulletin(target_parish) or exists (
    select 1 from public.registered_users r join auth.users u on u.id = auth.uid()
    where r.parish_id = target_parish and lower(btrim(r.email)) = lower(btrim(u.email))
  );
$$;
revoke all on function public.can_publish_parish_bulletin(uuid) from public;
revoke all on function public.can_read_parish_bulletin(uuid) from public;
grant execute on function public.can_publish_parish_bulletin(uuid) to authenticated;
grant execute on function public.can_read_parish_bulletin(uuid) to authenticated;

create or replace function public.set_parish_bulletin_dates()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'Published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists parish_bulletin_dates on public.parish_bulletins;
create trigger parish_bulletin_dates before insert or update on public.parish_bulletins
  for each row execute function public.set_parish_bulletin_dates();
alter table public.parish_bulletins enable row level security;
revoke all on public.parish_bulletins from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.parish_bulletins to authenticated;
drop policy if exists bulletin_read on public.parish_bulletins;
create policy bulletin_read on public.parish_bulletins for select to authenticated using (
  public.can_publish_parish_bulletin(parish_id)
  or (status = 'Published' and public.can_read_parish_bulletin(parish_id))
);
drop policy if exists bulletin_insert on public.parish_bulletins;
create policy bulletin_insert on public.parish_bulletins for insert to authenticated
  with check (public.can_publish_parish_bulletin(parish_id) and created_by = auth.uid());
drop policy if exists bulletin_update on public.parish_bulletins;
create policy bulletin_update on public.parish_bulletins for update to authenticated
  using (public.can_publish_parish_bulletin(parish_id)) with check (public.can_publish_parish_bulletin(parish_id));
drop policy if exists bulletin_delete on public.parish_bulletins;
create policy bulletin_delete on public.parish_bulletins for delete to authenticated
  using (public.can_publish_parish_bulletin(parish_id));

-- Private parish folders; drafts and archived attachments are publisher-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('parish-post-attachments', 'parish-post-attachments', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_parish_post_file(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.parishes p
    where p.id::text = split_part(object_name, '/', 1)
      and public.can_publish_parish_bulletin(p.id));
$$;
create or replace function public.can_read_parish_post_file(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_parish_post_file(object_name) or exists (
    select 1 from public.parish_bulletins b
    where b.parish_id::text = split_part(object_name, '/', 1)
      and b.status = 'Published' and public.can_read_parish_bulletin(b.parish_id)
      and b.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
  ) or exists (
    select 1 from public.diocese_announcements a join public.parishes p on a.parish_name = p.parish_name
    where p.id::text = split_part(object_name, '/', 1)
      and a.status = 'Published' and public.can_read_parish_bulletin(p.id)
      and a.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
  );
$$;
revoke all on function public.can_manage_parish_post_file(text) from public;
revoke all on function public.can_read_parish_post_file(text) from public;
grant execute on function public.can_manage_parish_post_file(text) to authenticated;
grant execute on function public.can_read_parish_post_file(text) to authenticated;
drop policy if exists parish_post_file_read on storage.objects;
create policy parish_post_file_read on storage.objects for select to authenticated
  using (bucket_id = 'parish-post-attachments' and public.can_read_parish_post_file(name));
drop policy if exists parish_post_file_insert on storage.objects;
create policy parish_post_file_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'parish-post-attachments' and public.can_manage_parish_post_file(name));
drop policy if exists parish_post_file_delete on storage.objects;
create policy parish_post_file_delete on storage.objects for delete to authenticated
  using (bucket_id = 'parish-post-attachments' and public.can_manage_parish_post_file(name));
commit;

-- Members read Published rows only. For attachments, sign the stored path
-- through /storage/v1/object/sign/parish-post-attachments/{path} with their JWT.
-- Keep photo_urls as durable authenticated HTTPS URLs, not expired signed URLs.
