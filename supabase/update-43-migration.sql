-- ============================================================================
-- UPDATE 43 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   Only the Director can mark commission as paid.
--   Every other admin job still works for any admin: importing customers, handing customers to a staff
--   member, editing a customer. Only CHANGING the "paid" date of an existing customer needs the Director.
-- ============================================================================
create or replace function public.protect_customer_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if tg_op = 'INSERT' then
        new.commission_exempt := false; new.commission_paid_at := null;
      else
        if new.recorded_by is distinct from old.recorded_by then raise exception 'Only an admin can change who recorded a customer'; end if;
        if new.commission_paid_at is distinct from old.commission_paid_at or new.commission_exempt is distinct from old.commission_exempt then
          raise exception 'Only an admin can change commission status';
        end if;
      end if;
    elsif tg_op = 'UPDATE' and new.commission_paid_at is distinct from old.commission_paid_at and not public.is_director() then
      raise exception 'Only the Director can mark commission as paid';
    end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
