-- ============================================================================
-- UPDATE 45 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   Who recorded a customer is now fixed once the customer is recorded. Nobody can change it through the app,
--   admins and the Director included, and the "assign customers to a staff member" function is removed.
--   (Customers can still be recorded or restored with any recorder, and a genuine mistake can still be corrected
--   in the Supabase SQL editor.)
--   Everything else about customers is unchanged, including: only the Director marks commission as paid.
-- ============================================================================
drop function if exists public.assign_customers_to_member(bigint[], uuid);

create or replace function public.protect_customer_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' and new.recorded_by is distinct from old.recorded_by then
      raise exception 'Who recorded a customer cannot be changed';
    end if;
    if not public.is_admin() then
      if tg_op = 'INSERT' then
        new.commission_exempt := false; new.commission_paid_at := null;
      elsif new.commission_paid_at is distinct from old.commission_paid_at or new.commission_exempt is distinct from old.commission_exempt then
        raise exception 'Only an admin can change commission status';
      end if;
    elsif tg_op = 'UPDATE' and new.commission_paid_at is distinct from old.commission_paid_at and not public.is_director() then
      raise exception 'Only the Director can mark commission as paid';
    end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
