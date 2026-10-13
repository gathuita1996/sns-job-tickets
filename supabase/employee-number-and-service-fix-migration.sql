-- ============================================================================
-- PART 1: Re-run the "Service" entry-type migration
-- ============================================================================
-- This is the most likely cause of "unable to file a service" -- the
-- columns and policy below are already in schema.sql, but if this exact
-- block was never actually run against the live database, filing a
-- service would fail (missing column, or the old insert policy still
-- active). Every statement here is safe to re-run even if it already
-- succeeded once -- nothing here will error or duplicate data.
-- ============================================================================

alter table public.expenses add column if not exists entry_type text not null default 'purchase' check (entry_type in ('purchase', 'service'));
alter table public.expenses add column if not exists provider_name text;
alter table public.expenses add column if not exists provider_contact text;

drop policy if exists "expenses_insert_team_lead_or_admin" on public.expenses;
drop policy if exists "expenses_insert_team_lead_or_service_admin" on public.expenses;
create policy "expenses_insert_team_lead_or_service_admin"
  on public.expenses for insert
  with check (
    submitted_by = auth.uid()
    and (
      (entry_type = 'purchase' and (public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and is_team_lead = true)))
      or (entry_type = 'service' and public.is_admin())
    )
  );

-- ============================================================================
-- PART 2: Employee numbers
-- ============================================================================
-- Format: SNS### (SNS001, SNS002, ...). SNS001 is reserved for whoever is
-- currently flagged as Director; the rest are randomized. Run this in
-- order -- step 2b needs your own username filled in before step 2c runs,
-- since step 2c requires every row to already have a number.
-- ============================================================================

-- 2a. Add the column (nullable for now -- we're backfilling below)
alter table public.profiles add column if not exists employee_number text;

-- 2b. Reserve SNS001 for the Director
update public.profiles set employee_number = 'SNS001' where is_director = true;

-- 2c. YOUR number -- replace 'your_username_here' with your actual username
--     from the profiles table before running this line.
update public.profiles set employee_number = 'SNS002' where username = 'your_username_here';

-- 2d. Randomize everyone else, starting from SNS003 so there's no
--     collision with the two reserved numbers above.
with shuffled as (
  select id, row_number() over (order by random()) + 2 as rn
  from public.profiles
  where employee_number is null
)
update public.profiles p
set employee_number = 'SNS' || lpad(shuffled.rn::text, 3, '0')
from shuffled
where p.id = shuffled.id;

-- 2e. Confirm every row got a number before locking it down -- if this
--     returns any rows, go back and check steps 2b/2c (most likely: no
--     one is currently flagged as Director, or the username in 2c didn't
--     match any row).
select id, username, full_name, employee_number from public.profiles where employee_number is null;

-- 2f. Once 2e returns zero rows, lock it down: required and unique.
alter table public.profiles alter column employee_number set not null;
alter table public.profiles add constraint profiles_employee_number_unique unique (employee_number);
