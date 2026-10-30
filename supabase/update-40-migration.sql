-- ============================================================================
-- UPDATE 40 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   1. Profile pictures           (avatars bucket + profiles.avatar_url)
--   2. Bank details               (own table, readable only by the owner and admins)
--   3. Leave                      (21 days a year from August, 3 a month, Director approves)
--   4. Retrieved routers          (routers taken back from customers, with the reason)
--   5. Customers                  (who recorded them; imports never earn commission)
--   6. Shared backup state        (one admin's backup clears every admin's reminder)
--   7. Hardening                  (members cannot make themselves Director / Team Lead)
-- ============================================================================

-- ---- 0. who is who ---------------------------------------------------------------------------
create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_director = true)
$$;

create or replace function public.is_technical_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or department = 'technical'))
$$;

-- ---- 7. hardening: only an admin may change Director, Team Lead or department ------------------
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.is_director  is distinct from old.is_director  then raise exception 'Only an admin can change who the Director is'; end if;
    if new.is_team_lead is distinct from old.is_team_lead then raise exception 'Only an admin can change team lead status'; end if;
    if new.department   is distinct from old.department   then raise exception 'Only an admin can change a department'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---- 1. profile pictures -------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_own_folder;
alter table public.profiles add constraint profiles_avatar_own_folder
  check (avatar_url is null or position('/storage/v1/object/public/avatars/' || id::text || '/' in avatar_url) > 0);

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 512000, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 512000, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  end if;
end $$;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all" on storage.objects for select
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');
drop policy if exists "avatars_delete_own_or_admin" on storage.objects;
create policy "avatars_delete_own_or_admin" on storage.objects for delete
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---- 2. bank details (kept apart from profiles so other members can never read them) ---------------
create table if not exists public.staff_bank_details (
  member_id       uuid primary key references public.profiles(id) on delete cascade,
  bank_name       text,
  branch          text,
  account_number  text,
  account_name    text,
  updated_at      timestamptz not null default now(),
  constraint bank_account_number_format check (account_number is null or account_number ~ '^[0-9A-Za-z -]{4,30}$')
);
alter table public.staff_bank_details enable row level security;
drop policy if exists "bank_select_own_or_admin" on public.staff_bank_details;
create policy "bank_select_own_or_admin" on public.staff_bank_details for select using (member_id = auth.uid() or public.is_admin());
drop policy if exists "bank_insert_own_or_admin" on public.staff_bank_details;
create policy "bank_insert_own_or_admin" on public.staff_bank_details for insert with check (member_id = auth.uid() or public.is_admin());
drop policy if exists "bank_update_own_or_admin" on public.staff_bank_details;
create policy "bank_update_own_or_admin" on public.staff_bank_details for update using (member_id = auth.uid() or public.is_admin());
drop policy if exists "bank_delete_admin" on public.staff_bank_details;
create policy "bank_delete_admin" on public.staff_bank_details for delete using (public.is_admin());
drop trigger if exists trg_bank_touch on public.staff_bank_details;
create trigger trg_bank_touch before update on public.staff_bank_details
  for each row execute function public.touch_updated_at();

-- ---- 6. shared backup state + leave policy live with the other settings ----------------------------
alter table public.app_settings add column if not exists last_backup_at timestamptz;
alter table public.app_settings add column if not exists last_backup_by uuid references public.profiles(id) on delete set null;
alter table public.app_settings add column if not exists annual_leave_days integer not null default 21 check (annual_leave_days between 1 and 365);
alter table public.app_settings add column if not exists max_leave_days_per_month integer not null default 3 check (max_leave_days_per_month between 1 and 31);
alter table public.app_settings add column if not exists leave_year_start_month integer not null default 8 check (leave_year_start_month between 1 and 12);
alter table public.app_settings add column if not exists leave_count_saturdays boolean not null default true;

create or replace function public.record_backup()
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.app_settings set last_backup_at = now(), last_backup_by = auth.uid() where id = true;
  return now();
end $$;
revoke all on function public.record_backup() from public, anon;
grant execute on function public.record_backup() to authenticated;

-- an admin's screen updates the moment another admin backs up (RLS still limits it to admins)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

create or replace function public.protect_leave_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_director() and (
       new.annual_leave_days is distinct from old.annual_leave_days
    or new.max_leave_days_per_month is distinct from old.max_leave_days_per_month
    or new.leave_year_start_month is distinct from old.leave_year_start_month
    or new.leave_count_saturdays is distinct from old.leave_count_saturdays) then
    raise exception 'Only the Director can change the leave policy';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_leave_policy on public.app_settings;
create trigger trg_protect_leave_policy before update on public.app_settings
  for each row execute function public.protect_leave_policy();

-- ---- 3. leave -----------------------------------------------------------------------------------------
create table if not exists public.non_working_days (
  id          bigint generated always as identity primary key,
  day         date not null unique,
  name        text not null,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.non_working_days enable row level security;
drop policy if exists "nwd_select" on public.non_working_days;
create policy "nwd_select" on public.non_working_days for select using (auth.role() = 'authenticated');
drop policy if exists "nwd_write_director" on public.non_working_days;
create policy "nwd_write_director" on public.non_working_days for all using (public.is_director()) with check (public.is_director());

create table if not exists public.leave_requests (
  id            bigint generated always as identity primary key,
  member_id     uuid not null references public.profiles(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  days          integer not null default 1 check (days > 0),
  leave_year    integer not null default 0,
  reason        text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  cancelled_by  uuid references public.profiles(id) on delete set null,
  cancelled_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  constraint leave_dates_in_order check (end_date >= start_date)
);
create index if not exists leave_requests_member_idx on public.leave_requests (member_id, status);
create index if not exists leave_requests_dates_idx on public.leave_requests (start_date, end_date);

create table if not exists public.leave_adjustments (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  leave_year  integer not null,
  days        integer not null check (days <> 0),
  note        text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists leave_adjustments_member_idx on public.leave_adjustments (member_id, leave_year);

alter table public.leave_requests enable row level security;
alter table public.leave_adjustments enable row level security;
drop policy if exists "leave_select_own_or_admin" on public.leave_requests;
create policy "leave_select_own_or_admin" on public.leave_requests for select using (member_id = auth.uid() or public.is_admin());
drop policy if exists "leave_insert_own_or_director" on public.leave_requests;
create policy "leave_insert_own_or_director" on public.leave_requests for insert
  with check (auth.uid() is not null and (member_id = auth.uid() or public.is_director()));
drop policy if exists "leave_update_own_or_director" on public.leave_requests;
create policy "leave_update_own_or_director" on public.leave_requests for update
  using (member_id = auth.uid() or public.is_director()) with check (member_id = auth.uid() or public.is_director());
drop policy if exists "leave_adj_select_own_or_admin" on public.leave_adjustments;
create policy "leave_adj_select_own_or_admin" on public.leave_adjustments for select using (member_id = auth.uid() or public.is_admin());
drop policy if exists "leave_adj_write_director" on public.leave_adjustments;
create policy "leave_adj_write_director" on public.leave_adjustments for all using (public.is_director()) with check (public.is_director());

create or replace function public.leave_policy()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('annual_days', annual_leave_days, 'max_per_month', max_leave_days_per_month,
                           'year_start_month', leave_year_start_month, 'count_saturdays', leave_count_saturdays)
  from public.app_settings where id = true
$$;
grant execute on function public.leave_policy() to authenticated;

-- the leave year is named after the year it STARTS in: 2026 = 1 Aug 2026 to 31 Jul 2027
create or replace function public.leave_year_of(d date)
returns integer language sql stable security definer set search_path = public as $$
  select case when extract(month from d)::int >= (select leave_year_start_month from public.app_settings where id = true)
              then extract(year from d)::int else extract(year from d)::int - 1 end
$$;

-- Sundays never count; Saturdays count unless the policy says otherwise; listed public holidays never count
create or replace function public.leave_is_working_day(d date)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(dow from d) <> 0
     and (extract(dow from d) <> 6 or (select leave_count_saturdays from public.app_settings where id = true))
     and not exists (select 1 from public.non_working_days n where n.day = d)
$$;

create or replace function public.leave_working_days(p_start date, p_end date)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from generate_series(0, p_end - p_start) n where public.leave_is_working_day(p_start + n)
$$;

-- pending + approved leave days a person has inside one calendar month
create or replace function public.leave_days_in_month(p_member uuid, p_month date, p_exclude bigint default null)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.leave_requests r, lateral generate_series(0, r.end_date - r.start_date) n
  where r.member_id = p_member and r.status in ('pending', 'approved') and (p_exclude is null or r.id <> p_exclude)
    and (r.start_date + n) >= date_trunc('month', p_month::timestamp)::date
    and (r.start_date + n) <  (date_trunc('month', p_month::timestamp) + interval '1 month')::date
    and public.leave_is_working_day(r.start_date + n)
$$;

-- The one place every leave rule lives. Returns the number of days, or refuses with a plain-words reason.
create or replace function public.leave_check(p_member uuid, p_start date, p_end date, p_exclude bigint default null)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  pol record; yr int; d int; used int; pend int; adj int; remaining int; m date; in_month int; new_in_month int;
begin
  select * into pol from public.app_settings where id = true;
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

-- live check for the screen: never raises, always answers
create or replace function public.leave_preview(p_start date, p_end date, p_member uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare who uuid := coalesce(p_member, auth.uid()); d int;
begin
  if who is distinct from auth.uid() and not public.is_director() then
    return json_build_object('ok', false, 'message', 'Only the Director can check leave for someone else.', 'days', null);
  end if;
  begin
    d := public.leave_check(who, p_start, p_end, null);
  exception when others then
    return json_build_object('ok', false, 'message', sqlerrm,
      'days', case when p_start is null or p_end is null or p_end < p_start then null else public.leave_working_days(p_start, p_end) end);
  end;
  return json_build_object('ok', true, 'days', d, 'message', null);
end $$;
grant execute on function public.leave_preview(date, date, uuid) to authenticated;

create or replace function public.leave_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_dir boolean := public.is_director();
begin
  new.leave_year := public.leave_year_of(new.start_date);
  new.days := public.leave_working_days(new.start_date, new.end_date);      -- never trust the browser's count
  if me is not null then
    if new.member_id <> me and not is_dir then raise exception 'You can only apply for your own leave.'; end if;
    new.created_by := me;
    if is_dir then
      if new.member_id = me then new.status := 'approved'; end if;           -- the Director's own leave needs no one else
      if new.status in ('approved', 'rejected') then new.decided_by := me; new.decided_at := now(); end if;
    else
      new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null;
      new.cancelled_by := null; new.cancelled_at := null;
      if new.start_date < current_date then raise exception 'Leave cannot start in the past. Ask the Director to record it.'; end if;
    end if;
  end if;
  -- history recorded by the Director is not re-judged against today's rules
  if new.status in ('pending', 'approved') and not ((is_dir or me is null) and new.status = 'approved' and new.end_date < current_date) then
    perform public.leave_check(new.member_id, new.start_date, new.end_date, null);
  end if;
  return new;
end $$;
drop trigger if exists trg_leave_before_insert on public.leave_requests;
create trigger trg_leave_before_insert before insert on public.leave_requests
  for each row execute function public.leave_before_insert();

create or replace function public.leave_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_dir boolean := public.is_director();
begin
  if me is null then return new; end if;                                      -- the SQL editor can always correct things
  if new.member_id is distinct from old.member_id or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date or new.leave_year is distinct from old.leave_year
     or new.reason is distinct from old.reason or new.requested_at is distinct from old.requested_at
     or new.created_by is distinct from old.created_by then
    raise exception 'A leave request cannot be edited. Cancel it and send a new one.';
  end if;
  if new.status = old.status then
    if new.decision_note is distinct from old.decision_note or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at or new.cancelled_by is distinct from old.cancelled_by then
      if not is_dir then raise exception 'Only the Director can change a decision.'; end if;
    end if;
    new.days := old.days;
    return new;
  end if;
  if old.status in ('rejected', 'cancelled') then raise exception 'This request is already closed.'; end if;
  if new.status = 'pending' then raise exception 'A decided request cannot go back to pending.'; end if;
  if new.status in ('approved', 'rejected') then
    if old.status <> 'pending' then raise exception 'Only a pending request can be approved or rejected.'; end if;
    if not is_dir then raise exception 'Only the Director can approve or reject leave.'; end if;
    new.decided_by := me; new.decided_at := now();
    if new.status = 'approved' then
      new.days := public.leave_working_days(new.start_date, new.end_date);    -- counted again with today's holidays
      perform public.leave_check(new.member_id, new.start_date, new.end_date, new.id);
    else
      new.days := old.days;
    end if;
  elsif new.status = 'cancelled' then
    if old.status = 'pending' then
      if not (old.member_id = me or is_dir) then raise exception 'You can only cancel your own request.'; end if;
    elsif old.status = 'approved' then
      if not (is_dir or (old.member_id = me and old.start_date > current_date)) then
        raise exception 'Approved leave that has already started can only be cancelled by the Director.';
      end if;
    end if;
    new.days := old.days; new.cancelled_by := me; new.cancelled_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_leave_before_update on public.leave_requests;
create trigger trg_leave_before_update before update on public.leave_requests
  for each row execute function public.leave_before_update();

-- one person's numbers for the current leave year (the member's own, or anyone's for an admin)
create or replace function public.leave_summary(p_member uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare who uuid := coalesce(p_member, auth.uid()); pol record; yr int; used int; adj int; pend int;
begin
  if who is distinct from auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into pol from public.app_settings where id = true;
  yr := public.leave_year_of(current_date);
  select coalesce(sum(days), 0) into used from public.leave_requests where member_id = who and leave_year = yr and status = 'approved';
  select coalesce(sum(days), 0) into pend from public.leave_requests where member_id = who and leave_year = yr and status = 'pending';
  select coalesce(sum(days), 0) into adj  from public.leave_adjustments where member_id = who and leave_year = yr;
  return json_build_object('leave_year', yr, 'entitlement', pol.annual_leave_days, 'used_requests', used, 'adjustments', adj,
    'used', used + adj, 'pending', pend, 'remaining', pol.annual_leave_days - used - adj - pend,
    'month_cap', pol.max_leave_days_per_month, 'month_used', public.leave_days_in_month(who, current_date),
    'on_leave_today', exists (select 1 from public.leave_requests r where r.member_id = who and r.status = 'approved' and current_date between r.start_date and r.end_date));
end $$;
grant execute on function public.leave_summary(uuid) to authenticated;

create or replace function public.leave_overview()
returns table (member_id uuid, leave_year int, entitlement int, used_requests int, adjustments int, pending int, remaining int, month_used int, on_leave_today boolean)
language plpgsql stable security definer set search_path = public as $$
declare yr int := public.leave_year_of(current_date); ent int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select annual_leave_days into ent from public.app_settings where id = true;
  return query
    select x.id, yr, ent, x.used, x.adj, x.pend, ent - x.used - x.adj - x.pend, public.leave_days_in_month(x.id, current_date), x.away
    from (select p.id,
            coalesce((select sum(r.days) from public.leave_requests r where r.member_id = p.id and r.leave_year = yr and r.status = 'approved'), 0)::int as used,
            coalesce((select sum(a.days) from public.leave_adjustments a where a.member_id = p.id and a.leave_year = yr), 0)::int as adj,
            coalesce((select sum(r.days) from public.leave_requests r where r.member_id = p.id and r.leave_year = yr and r.status = 'pending'), 0)::int as pend,
            exists (select 1 from public.leave_requests r where r.member_id = p.id and r.status = 'approved' and current_date between r.start_date and r.end_date) as away
          from public.profiles p) x;
end $$;
revoke all on function public.leave_overview() from public, anon;
grant execute on function public.leave_overview() to authenticated;

-- Days already used before the system existed (leave year starting August 2026). Applied only when the
-- name matches exactly one person; otherwise the Director sets it from Leave > Adjust days.
do $$
declare r record; n int; pid uuid;
begin
  for r in select * from (values ('gideon', 6), ('alex', 5)) as v(first_name, used) loop
    select count(*), (array_agg(id))[1] into n, pid from public.profiles
      where lower(full_name) like r.first_name || '%' or lower(username) like r.first_name || '%';
    if n = 1 then
      if not exists (select 1 from public.leave_adjustments where member_id = pid and leave_year = 2026 and note like 'Opening balance%') then
        insert into public.leave_adjustments (member_id, leave_year, days, note, created_by)
        values (pid, 2026, r.used, 'Opening balance: days already used before this system', null);
      end if;
    else
      raise notice 'Opening leave balance for "%" not applied (% people match). Set it from Leave > Adjust days.', r.first_name, n;
    end if;
  end loop;
end $$;

-- ---- 4. retrieved routers -----------------------------------------------------------------------------
create table if not exists public.retrieved_routers (
  id                 bigint generated always as identity primary key,
  retrieved_date     date not null default current_date,
  customer_id        bigint references public.customers(id) on delete set null,
  customer_name      text not null,
  customer_contact   text,
  location           text,
  router_model       text not null,
  serial_number      text,
  reason             text not null check (reason in ('customer_requested', 'failed_to_pay', 'other')),
  reason_notes       text,
  amount_owed        numeric(12, 2) check (amount_owed is null or amount_owed >= 0),
  condition          text not null default 'working' check (condition in ('working', 'faulty', 'damaged')),
  accessories        text,
  status             text not null default 'in_store' check (status in ('in_store', 'reissued', 'under_repair', 'written_off')),
  status_note        text,
  status_updated_at  timestamptz,
  status_updated_by  uuid references public.profiles(id) on delete set null,
  retrieved_by       uuid references public.profiles(id) on delete set null,
  recorded_by        uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint retrieved_other_needs_notes check (reason <> 'other' or coalesce(btrim(reason_notes), '') <> '')
);
create index if not exists retrieved_routers_customer_idx on public.retrieved_routers (customer_id);
create index if not exists retrieved_routers_serial_idx on public.retrieved_routers (lower(serial_number));
alter table public.retrieved_routers enable row level security;
drop policy if exists "rr_select" on public.retrieved_routers;
create policy "rr_select" on public.retrieved_routers for select
  using (public.is_admin() or recorded_by = auth.uid() or retrieved_by = auth.uid());
drop policy if exists "rr_insert" on public.retrieved_routers;
create policy "rr_insert" on public.retrieved_routers for insert
  with check (public.is_admin() or (public.is_technical_or_admin() and recorded_by = auth.uid()));
drop policy if exists "rr_update" on public.retrieved_routers;
create policy "rr_update" on public.retrieved_routers for update
  using (public.is_admin() or (recorded_by = auth.uid() and status = 'in_store'))
  with check (public.is_admin() or (recorded_by = auth.uid() and status = 'in_store'));
drop policy if exists "rr_delete" on public.retrieved_routers;
create policy "rr_delete" on public.retrieved_routers for delete using (public.is_admin());

create or replace function public.retrieved_routers_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'in_store'; new.status_note := null; new.status_updated_at := null; new.status_updated_by := null;
      if new.retrieved_by is null then new.retrieved_by := auth.uid(); end if;
    else
      if new.status is distinct from old.status or new.status_note is distinct from old.status_note then
        raise exception 'Only an admin can change what happened to a router';
      end if;
      if new.recorded_by is distinct from old.recorded_by then raise exception 'Not allowed'; end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.status_note is distinct from old.status_note) then
    new.status_updated_at := now(); new.status_updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_retrieved_routers_rules on public.retrieved_routers;
create trigger trg_retrieved_routers_rules before insert or update on public.retrieved_routers
  for each row execute function public.retrieved_routers_rules();

-- ---- 5. customers: who recorded them, and imports never earn commission ------------------------------
alter table public.customers add column if not exists commission_exempt boolean not null default false;
-- customers added by the customer-list import were stamped "commission settled" at the moment they were added
update public.customers set commission_exempt = true
  where not commission_exempt and commission_paid_at is not null
    and abs(extract(epoch from (commission_paid_at - created_at))) < 900;

create or replace function public.protect_customer_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.commission_exempt := false; new.commission_paid_at := null;
    else
      if new.recorded_by is distinct from old.recorded_by then raise exception 'Only an admin can change who recorded a customer'; end if;
      if new.commission_paid_at is distinct from old.commission_paid_at or new.commission_exempt is distinct from old.commission_exempt then
        raise exception 'Only an admin can change commission status';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_customer_privileges on public.customers;
create trigger trg_protect_customer_privileges before insert or update on public.customers
  for each row execute function public.protect_customer_privileges();

create or replace function public.assign_customers_to_member(p_ids bigint[], p_member uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.profiles where id = p_member) then raise exception 'That team member does not exist'; end if;
  update public.customers set recorded_by = p_member where id = any (p_ids) and recorded_by is distinct from p_member;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.assign_customers_to_member(bigint[], uuid) from public, anon;
grant execute on function public.assign_customers_to_member(bigint[], uuid) to authenticated;

notify pgrst, 'reload schema';
