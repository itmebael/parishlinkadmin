grant usage on schema public to authenticated;

create extension if not exists pgcrypto;

create table if not exists public.parish_secretary_messages (
  id uuid primary key default gen_random_uuid(),
  parish_id text not null,
  parish_name text not null,
  user_id text,
  user_email text not null,
  user_full_name text,
  sender_role text not null check (sender_role in ('user', 'parish')),
  sender_name text,
  message_text text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint parish_secretary_messages_message_text_check check (char_length(btrim(message_text)) > 0)
);

create index if not exists parish_secretary_messages_parish_id_idx
  on public.parish_secretary_messages (parish_id, created_at desc);

create index if not exists parish_secretary_messages_user_email_idx
  on public.parish_secretary_messages (user_email, created_at desc);

grant select, insert
  on public.parish_secretary_messages
  to authenticated;

alter table public.parish_secretary_messages enable row level security;

drop policy if exists "Read parish secretary messages"
  on public.parish_secretary_messages;

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

drop policy if exists "Insert parish secretary messages"
  on public.parish_secretary_messages;

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
