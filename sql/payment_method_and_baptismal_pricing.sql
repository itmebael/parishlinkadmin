-- Add payment method + pricing fields to bookings.
-- Requirement: allow "GCash" or "Personal payment", and default Baptismal to 520 + 80 fee = 600.
-- Safe to re-run.

alter table public.diocese_service_bookings
  add column if not exists payment_method text,
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_fee numeric(12,2),
  add column if not exists payment_total numeric(12,2);

-- Optional: constrain allowed payment methods (null allowed).
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'diocese_service_bookings'
       and c.conname = 'diocese_service_bookings_payment_method_check'
  ) then
    alter table public.diocese_service_bookings
      add constraint diocese_service_bookings_payment_method_check
      check (payment_method is null or lower(payment_method) in ('gcash','personal'));
  end if;
end $$;

create or replace function public.diocese_service_bookings_apply_pricing()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_baptismal boolean := false;
begin
  v_is_baptismal := lower(coalesce(new.service_name,'')) like '%baptism%';

  -- If Personal payment, fee is always zero.
  if lower(coalesce(new.payment_method,'')) = 'personal' then
    new.payment_fee := 0;
  end if;

  -- Default pricing for Baptismal only when not provided.
  if v_is_baptismal then
    if new.payment_amount is null then new.payment_amount := 520; end if;
    -- Apply fee only when not Personal payment.
    if lower(coalesce(new.payment_method,'')) <> 'personal' then
      if new.payment_fee is null then new.payment_fee := 80; end if;
    end if;
  end if;

  -- Keep total consistent when any amount/fee present.
  if new.payment_amount is not null or new.payment_fee is not null then
    new.payment_total := coalesce(new.payment_amount, 0) + coalesce(new.payment_fee, 0);
  end if;

  -- Keep booking cost in sync (so UI doesn't show ₱0).
  -- Only set when cost is missing/zero to avoid overriding parish-set pricing.
  if (new.cost is null or new.cost = 0) and new.payment_total is not null then
    new.cost := new.payment_total;
  end if;

  return new;
end;
$$;

drop trigger if exists diocese_service_bookings_apply_pricing_trg on public.diocese_service_bookings;
create trigger diocese_service_bookings_apply_pricing_trg
before insert or update of service_name, payment_amount, payment_fee, payment_total
on public.diocese_service_bookings
for each row
execute function public.diocese_service_bookings_apply_pricing();

grant execute on function public.diocese_service_bookings_apply_pricing() to anon, authenticated;

