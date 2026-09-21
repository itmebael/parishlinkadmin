-- Parish-scoped baptism records.
-- Safe to run after public.parishes exists.

create extension if not exists pg_trgm;

create or replace function public.current_staff_parish_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_jwt jsonb := auth.jwt();
  v_try text;
  v_id uuid;
begin
  v_try := nullif(v_jwt -> 'user_metadata' ->> 'parish_id', '');
  if v_try is null then v_try := nullif(v_jwt -> 'app_metadata' ->> 'parish_id', ''); end if;
  if v_try is not null then
    begin
      v_id := v_try::uuid;
      if exists (select 1 from public.parishes where id = v_id) then return v_id; end if;
    exception when invalid_text_representation then null;
    end;
  end if;
  select p.id into v_id
    from public.parishes p
   where lower(coalesce(p.email, '')) = lower(coalesce(v_jwt ->> 'email', ''))
   limit 1;
  return v_id;
end;
$$;

grant execute on function public.current_staff_parish_id() to anon, authenticated;

create table if not exists public.baptism_records (
  id bigint generated always as identity not null,
  year_baptism integer null,
  month_batism character varying(20) null,
  date_batism integer null,
  name character varying(255) null,
  year_birth integer null,
  month_birth character varying(20) null,
  day_birth integer null,
  mother_name character varying(255) null,
  father_name character varying(255) null,
  forefathers text null,
  foremothers text null,
  godparents text null,
  location character varying(255) null,
  fee numeric(10, 2) null,
  minister character varying(255) null,
  created_at timestamp with time zone null default now(),
  parish_id uuid not null,
  constraint baptism_records_pkey primary key (id)
);

create index if not exists baptism_records_parish_id_idx
  on public.baptism_records using btree (parish_id);

create index if not exists baptism_records_name_trgm_idx
  on public.baptism_records using gin (name gin_trgm_ops);

create or replace function public.baptism_records_for_parish(
  p_parish_id uuid,
  p_search text default null,
  p_limit integer default 26,
  p_offset integer default 0
)
returns setof public.baptism_records
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_own_parish uuid := public.current_staff_parish_id();
begin
  if p_parish_id is null or (v_role <> 'diocese' and p_parish_id <> v_own_parish) then
    raise exception 'The requested parish is not available to this account.' using errcode = '42501';
  end if;

  return query
  select r.*
    from public.baptism_records r
   where r.parish_id = p_parish_id
     and (nullif(btrim(coalesce(p_search, '')), '') is null
       or r.name ilike '%' || btrim(p_search) || '%')
   order by r.created_at desc nulls last, r.id desc
   limit greatest(1, least(coalesce(p_limit, 26), 200))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.baptism_records_for_parish(uuid, text, integer, integer)
  to authenticated;

alter table public.baptism_records enable row level security;

drop policy if exists "Read scoped baptism records" on public.baptism_records;
drop policy if exists "Create scoped baptism records" on public.baptism_records;
drop policy if exists "Update scoped baptism records" on public.baptism_records;
drop policy if exists "Delete scoped baptism records" on public.baptism_records;

create policy "Read scoped baptism records"
on public.baptism_records
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and parish_id = public.current_staff_parish_id()
  )
);

create policy "Create scoped baptism records"
on public.baptism_records
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and parish_id = public.current_staff_parish_id()
  )
);

create policy "Update scoped baptism records"
on public.baptism_records
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and parish_id = public.current_staff_parish_id()
  )
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and parish_id = public.current_staff_parish_id()
  )
);

create policy "Delete scoped baptism records"
on public.baptism_records
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'diocese'
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'parish'
    and parish_id = public.current_staff_parish_id()
  )
);

grant select, insert, update, delete on table public.baptism_records to authenticated;
grant usage, select on sequence public.baptism_records_id_seq to authenticated;
