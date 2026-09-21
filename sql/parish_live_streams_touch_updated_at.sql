-- Keeps updated_at in sync on every UPDATE so user clients (which poll is_live rows)
-- do not drop the parish after a short client-side freshness window.
-- Safe to re-run.

create or replace function public.parish_live_streams_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists parish_live_streams_touch_updated_at on public.parish_live_streams;
create trigger parish_live_streams_touch_updated_at
  before update on public.parish_live_streams
  for each row execute function public.parish_live_streams_set_updated_at();
