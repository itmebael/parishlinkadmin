-- Apply after parish_livestream_history.sql. Safe to re-run.
-- Authorize against the parish office email in the signed JWT, never client metadata.
create or replace function public.delete_parish_livestream_history(p_history_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting a broadcast.' using errcode = '42501';
  end if;

  delete from public.parish_livestream_history h
  where h.id = p_history_id
    and h.ended_at is not null
    and exists (
      select 1 from public.parishes p
      where lower(btrim(p.email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
        and btrim(coalesce(p.email, '')) <> ''
        and (h.parish_id = p.id or (h.parish_id is null and lower(btrim(h.parish_name)) = lower(btrim(p.parish_name))))
    )
  returning h.id into v_deleted;

  if v_deleted is null then
    raise exception 'Broadcast not found, still live, or outside your parish.' using errcode = '42501';
  end if;
  return true;
end;
$$;
revoke all on function public.delete_parish_livestream_history(uuid) from public, anon;
grant execute on function public.delete_parish_livestream_history(uuid) to authenticated;
