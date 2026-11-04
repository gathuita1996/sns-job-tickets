-- ============================================================================
-- UPDATE 44 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   1. Saturdays no longer count as leave days (Sundays never did).
--   2. A contract agreement in every staff profile. Everyone sees their own; admins see all;
--      ONLY THE DIRECTOR can create or change one.
--   3. Annual leave is only for staff on a 1-year contract. Staff on a short-term contract (or with no contract
--      on file) have no leave days. Their leave RECORDS are kept, so the balance is exactly as it was the day the
--      Director changes the contract to a 1-year term: the days come back, nothing is reset.
--   4. The current contracts are entered below by employee number (only where that number exists).
-- ============================================================================

-- ---- 1. Saturdays ----------------------------------------------------------------------------------------
alter table public.app_settings alter column leave_count_saturdays set default false;

do $$
begin
  if to_regclass('public.staff_contracts') is null then            -- first run only, so a later choice by the Director is never undone
    update public.app_settings set leave_count_saturdays = false where id = true;
    -- requests still waiting were counted with their Saturdays: count them again
    update public.leave_requests set days = public.leave_working_days(start_date, end_date)
      where status = 'pending' and public.leave_working_days(start_date, end_date) > 0 and days <> public.leave_working_days(start_date, end_date);
    update public.leave_requests set status = 'cancelled', cancelled_at = now(),
        decision_note = 'Cancelled: Saturdays no longer count as leave days, so no leave days were left in this request'
      where status = 'pending' and public.leave_working_days(start_date, end_date) = 0;
  end if;
end $$;

-- ---- 2. contracts -----------------------------------------------------------------------------------------
create table if not exists public.staff_contracts (
  id                    bigint generated always as identity primary key,
  member_id             uuid not null unique references public.profiles(id) on delete cascade,
  contract_type         text not null check (contract_type in ('annual', 'short_term')),
  start_date            date not null,
  term_months           integer not null check (term_months between 1 and 60),
  renews_on_completion  boolean not null default false,
  notes                 text,
  updated_by            uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now()
);
create table if not exists public.staff_contract_history (
  id                    bigint generated always as identity primary key,
  member_id             uuid not null references public.profiles(id) on delete cascade,
  changed_at            timestamptz not null default now(),
  changed_by            uuid references public.profiles(id) on delete set null,
  action                text not null check (action in ('set', 'changed')),
  previous_type         text,
  contract_type         text not null,
  start_date            date not null,
  term_months           integer not null,
  renews_on_completion  boolean not null,
  notes                 text
);
create index if not exists staff_contract_history_member_idx on public.staff_contract_history (member_id, changed_at desc);
alter table public.staff_contracts enable row level security;
alter table public.staff_contract_history enable row level security;
drop policy if exists "contracts_select_own_or_admin" on public.staff_contracts;
create policy "contracts_select_own_or_admin" on public.staff_contracts for select using (member_id = auth.uid() or public.is_admin());
drop policy if exists "contracts_write_director" on public.staff_contracts;
create policy "contracts_write_director" on public.staff_contracts for all using (public.is_director()) with check (public.is_director());
drop policy if exists "contract_history_select_own_or_admin" on public.staff_contract_history;
create policy "contract_history_select_own_or_admin" on public.staff_contract_history for select using (member_id = auth.uid() or public.is_admin());

create or replace function public.staff_contracts_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_staff_contracts_stamp on public.staff_contracts;
create trigger trg_staff_contracts_stamp before insert or update on public.staff_contracts
  for each row execute function public.staff_contracts_stamp();

-- every change is written down: who, when, from what to what
create or replace function public.staff_contracts_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.staff_contract_history (member_id, changed_by, action, contract_type, start_date, term_months, renews_on_completion, notes)
    values (new.member_id, auth.uid(), 'set', new.contract_type, new.start_date, new.term_months, new.renews_on_completion, new.notes);
  elsif (new.contract_type, new.start_date, new.term_months, new.renews_on_completion, coalesce(new.notes, ''))
        is distinct from (old.contract_type, old.start_date, old.term_months, old.renews_on_completion, coalesce(old.notes, '')) then
    insert into public.staff_contract_history (member_id, changed_by, action, previous_type, contract_type, start_date, term_months, renews_on_completion, notes)
    values (new.member_id, auth.uid(), 'changed', old.contract_type, new.contract_type, new.start_date, new.term_months, new.renews_on_completion, new.notes);
  end if;
  return null;
end $$;
drop trigger if exists trg_staff_contracts_audit on public.staff_contracts;
create trigger trg_staff_contracts_audit after insert or update on public.staff_contracts
  for each row execute function public.staff_contracts_audit();

-- ---- 3. annual leave belongs to 1-year contracts ---------------------------------------------------------
create or replace function public.leave_eligible(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_contracts where member_id = p_member and contract_type = 'annual')
$$;
grant execute on function public.leave_eligible(uuid) to authenticated;

create or replace function public.leave_check(p_member uuid, p_start date, p_end date, p_exclude bigint default null)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  pol record; yr int; d int; used int; pend int; adj int; remaining int; m date; in_month int; new_in_month int;
begin
  select * into pol from public.app_settings where id = true;
  if not public.leave_eligible(p_member) then
    if exists (select 1 from public.staff_contracts where member_id = p_member) then
      raise exception 'Annual leave is for staff on a 1-year contract. A short-term contract has no leave days; they are added when the Director changes the contract to a 1-year term.';
    else
      raise exception 'No contract is on file yet, so there is no annual leave. Ask the Director to enter the contract.';
    end if;
  end if;
  if p_start is null or p_end is null then raise exception 'Choose the first and the last day of the leave.'; end if;
  if p_end < p_start then raise exception 'The last day of leave cannot be before the first day.'; end if;
  if public.leave_year_of(p_start) <> public.leave_year_of(p_end) then
    raise exception 'A leave request cannot run past the end of the leave year. Please send two requests.';
  end if;
  d := public.leave_working_days(p_start, p_end);
  if d = 0 then raise exception 'These dates have no working days (Sundays and public holidays do not count).'; end if;
  if exists (select 1 from public.leave_requests r where r.member_id = p_member and r.status in ('pending', 'approved')
             and (p_exclude is null or r.id <> p_exclude) and r.start_date <= p_end and r.end_date >= p_start) then
    raise exception 'There is already leave, pending or approved, that overlaps these dates.';
  end if;
  yr := public.leave_year_of(p_start);
  select coalesce(sum(days), 0) into used from public.leave_requests where member_id = p_member and leave_year = yr and status = 'approved' and (p_exclude is null or id <> p_exclude);
  select coalesce(sum(days), 0) into pend from public.leave_requests where member_id = p_member and leave_year = yr and status = 'pending'  and (p_exclude is null or id <> p_exclude);
  select coalesce(sum(days), 0) into adj  from public.leave_adjustments where member_id = p_member and leave_year = yr;
  remaining := pol.annual_leave_days - used - pend - adj;
  if d > remaining then
    raise exception 'Not enough leave left: % day(s) available this leave year, % requested.', greatest(remaining, 0), d;
  end if;
  for m in select distinct date_trunc('month', (p_start + n)::timestamp)::date from generate_series(0, p_end - p_start) n loop
    select count(*)::int into new_in_month from generate_series(0, p_end - p_start) n
      where date_trunc('month', (p_start + n)::timestamp)::date = m and public.leave_is_working_day(p_start + n);
    if new_in_month = 0 then continue; end if;
    in_month := public.leave_days_in_month(p_member, m, p_exclude);
    if in_month + new_in_month > pol.max_leave_days_per_month then
      raise exception 'Leave is limited to % days a month. In % there are already % and this adds %.',
        pol.max_leave_days_per_month, to_char(m, 'FMMonth YYYY'), in_month, new_in_month;
    end if;
  end loop;
  return d;
end $$;

create or replace function public.leave_summary(p_member uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare who uuid := coalesce(p_member, auth.uid()); pol record; yr int; used int; adj int; pend int; ok boolean; ent int;
begin
  if who is distinct from auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into pol from public.app_settings where id = true;
  yr := public.leave_year_of(current_date);
  ok := public.leave_eligible(who); ent := case when ok then pol.annual_leave_days else 0 end;
  select coalesce(sum(days), 0) into used from public.leave_requests where member_id = who and leave_year = yr and status = 'approved';
  select coalesce(sum(days), 0) into pend from public.leave_requests where member_id = who and leave_year = yr and status = 'pending';
  select coalesce(sum(days), 0) into adj  from public.leave_adjustments where member_id = who and leave_year = yr;
  return json_build_object('leave_year', yr, 'eligible', ok, 'entitlement', ent, 'used_requests', used, 'adjustments', adj,
    'used', used + adj, 'pending', pend, 'remaining', case when ok then ent - used - adj - pend else 0 end,
    'month_cap', pol.max_leave_days_per_month, 'month_used', public.leave_days_in_month(who, current_date),
    'on_leave_today', exists (select 1 from public.leave_requests r where r.member_id = who and r.status = 'approved' and current_date between r.start_date and r.end_date));
end $$;
grant execute on function public.leave_summary(uuid) to authenticated;

drop function if exists public.leave_overview();
create function public.leave_overview()
returns table (member_id uuid, leave_year int, entitlement int, used_requests int, adjustments int, pending int, remaining int, month_used int, on_leave_today boolean, eligible boolean)
language plpgsql stable security definer set search_path = public as $$
declare yr int := public.leave_year_of(current_date); ent int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select annual_leave_days into ent from public.app_settings where id = true;
  return query
    select x.id, yr, case when x.ok then ent else 0 end, x.used, x.adj, x.pend, case when x.ok then ent - x.used - x.adj - x.pend else 0 end,
           public.leave_days_in_month(x.id, current_date), x.away, x.ok
    from (select p.id, public.leave_eligible(p.id) as ok,
            coalesce((select sum(r.days) from public.leave_requests r where r.member_id = p.id and r.leave_year = yr and r.status = 'approved'), 0)::int as used,
            coalesce((select sum(a.days) from public.leave_adjustments a where a.member_id = p.id and a.leave_year = yr), 0)::int as adj,
            coalesce((select sum(r.days) from public.leave_requests r where r.member_id = p.id and r.leave_year = yr and r.status = 'pending'), 0)::int as pend,
            exists (select 1 from public.leave_requests r where r.member_id = p.id and r.status = 'approved' and current_date between r.start_date and r.end_date) as away
          from public.profiles p) x;
end $$;
revoke all on function public.leave_overview() from public, anon;
grant execute on function public.leave_overview() to authenticated;

-- ---- 4. the current contracts, by employee number (an existing contract is never overwritten) ------------
do $$
declare r record; pid uuid;
begin
  for r in select * from (values
      ('SNS003', 'annual',     '2026-08-01'::date, 12, false), ('SNS004', 'annual', '2026-08-01', 12, false),
      ('SNS005', 'annual',     '2026-08-01',       12, false), ('SNS008', 'annual', '2026-08-01', 12, false),
      ('SNS002', 'annual',     '2026-11-01',       12, false),
      ('SNS006', 'short_term', '2026-07-01',        3, true),  ('SNS010', 'short_term', '2026-07-01', 3, true),
      ('SNS007', 'short_term', '2026-08-04',        3, true)
    ) as v(num, ctype, started, months, renews) loop
    select id into pid from public.profiles where upper(employee_number) = r.num;
    if pid is null then
      raise notice 'No staff member has employee number %, so that contract was not entered. The Director can enter it from the Staff page.', r.num;
    else
      insert into public.staff_contracts (member_id, contract_type, start_date, term_months, renews_on_completion, notes)
      values (pid, r.ctype, r.started, r.months, r.renews, 'Entered from the contract list')
      on conflict (member_id) do nothing;
    end if;
  end loop;
end $$;

-- leave that is still waiting for someone on a short-term contract can never be approved: close it with the reason
-- (people with no contract on file are left alone; the Director can enter their contract and then decide)
update public.leave_requests r set status = 'cancelled', cancelled_at = now(),
    decision_note = 'Cancelled: annual leave is for staff on a 1-year contract'
  where r.status = 'pending' and exists (select 1 from public.staff_contracts c where c.member_id = r.member_id and c.contract_type = 'short_term');

notify pgrst, 'reload schema';
