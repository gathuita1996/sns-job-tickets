-- ============================================================================
-- UPDATE 47 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   Expenses for the Technical department
--   * Everyone in the Technical department can now ask for a purchase (the Expenses feature): "Submit a purchase"
--     and "My Expenses/Purchases" in the member portal. Team Leads keep it as before and admins are unchanged.
--   * Nothing else about expenses changes. A purchase is still a request first: only the Director approves or
--     rejects it, the member then buys it and attaches the receipt, and the Director marks it paid. A member sees
--     only their own requests and can only withdraw one that is still Requested.
--   * "Log a service" is NOT added. Paying an outside person stays an admin job, and the database refuses a service
--     from anyone who is not an admin, however the request is made.
--   * Only an admin can change a person's department, so nobody can move themselves into Technical.
--
--   Two gaps closed on the way (they applied to Team Leads already, and would now have applied to the whole
--   Technical department). Neither changes anything the screens do; they stop someone who talks to the database
--   directly from skipping the Director:
--   * A member's new request is always a plain request. It can no longer be filed already Approved or Paid, or with
--     a receipt, a reviewer, a payment date or a rejection note filled in.
--   * When a member attaches a receipt to an approved request, nothing else on it can change (not the amount, the
--     description, the payment date or who approved it). Admins are not affected.
-- ============================================================================

-- Who may file an expense row. Always as themselves (submitted_by = their own id), and:
--   a purchase  -> an admin as before; anyone in the Technical department or any Team Lead, as a plain request
--   a service   -> admins only (unchanged)
drop policy if exists "expenses_insert_team_lead_or_service_admin" on public.expenses;
drop policy if exists "expenses_insert_purchase_member_or_service_admin" on public.expenses;
create policy "expenses_insert_purchase_member_or_service_admin"
  on public.expenses for insert
  with check (
    submitted_by = auth.uid()
    and (
      (
        entry_type = 'purchase'
        and (
          public.is_admin()
          or (
            status = 'Requested'
            and reviewed_by is null and reviewed_at is null and paid_at is null
            and receipt_path is null and receipt_uploaded_at is null and admin_notes is null
            and exists (select 1 from public.profiles where id = auth.uid() and (department = 'technical' or is_team_lead = true))
          )
        )
      )
      or (entry_type = 'service' and public.is_admin())
    )
  );

-- The one thing a member does to their own request is attach the receipt (Approved -> Purchased). The amount was
-- already locked; now everything except the receipt itself, the date it was bought and the status is locked too.
create or replace function public.expenses_lock_amount_for_submitter()
returns trigger as $$
begin
  if old.submitted_by = auth.uid() and not public.is_admin() then
    if new.amount is distinct from old.amount then
      raise exception 'Amount cannot be changed when attaching a receipt.';
    end if;
    if (to_jsonb(new) - 'status' - 'receipt_path' - 'receipt_uploaded_at' - 'purchase_date')
       is distinct from (to_jsonb(old) - 'status' - 'receipt_path' - 'receipt_uploaded_at' - 'purchase_date') then
      raise exception 'Only the receipt can be added to an approved request.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
