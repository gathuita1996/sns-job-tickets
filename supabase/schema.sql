-- ============================================================================
-- Swahili Net Solution — Job Cards
-- Supabase schema: tables, auto-numbering, first-user-is-admin, and RLS.
--
-- HOW TO RUN THIS:
-- Supabase dashboard -> your project -> SQL Editor -> New query
-- Paste this whole file -> Run.
-- Safe to run once on a fresh project. Re-running on an existing project
-- will error on "already exists" — that's expected, not a problem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- One row per app user, linked 1:1 to Supabase's built-in auth.users table.
-- role is 'member' or 'admin'. The very first person to ever sign up becomes
-- admin automatically (see handle_new_user() below) — no hardcoded code to
-- leak, no manual dashboard edit required for the first admin.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  full_name   text not null,
  contact     text not null,
  role        text not null default 'member' check (role in ('member', 'admin')),
  title       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. JOBS
-- job_code (e.g. JC-0001) is generated server-side by a sequence, so two
-- people filing at the same moment can never collide — a real backend gets
-- you this for free, which the old client-only version couldn't guarantee.
-- ----------------------------------------------------------------------------
create table public.jobs (
  id                 bigint generated always as identity primary key,
  job_code           text not null unique,
  job_type           text not null,
  location           text not null,
  requested_by       text,
  requester_contact  text,
  visit_date         date,
  transport_amount   numeric(10,2) not null default 0,
  status             text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  notes              text,
  member_id          uuid not null references public.profiles(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index jobs_member_id_idx on public.jobs(member_id);
create index jobs_status_idx on public.jobs(status);

-- ----------------------------------------------------------------------------
-- 3. AUTO JOB_CODE (JC-0001, JC-0002, ...)
-- ----------------------------------------------------------------------------
create sequence public.job_code_seq start 1;

create or replace function public.set_job_code()
returns trigger as $$
begin
  if new.job_code is null then
    new.job_code := 'JC-' || lpad(nextval('public.job_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_job_code
before insert on public.jobs
for each row execute function public.set_job_code();

-- ----------------------------------------------------------------------------
-- 4. AUTO updated_at ON JOBS
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_touch_updated_at
before update on public.jobs
for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. AUTO-CREATE PROFILE ON SIGNUP + FIRST USER = ADMIN + TEAM ACCESS CODE
-- Supabase Auth creates the auth.users row when someone signs up; this
-- trigger creates the matching profiles row from the metadata the app sends
-- (username/full_name/contact/title), and makes the very first signup an
-- admin so there's always a way in.
--
-- It also rejects any signup whose access_code doesn't match the value
-- below — this is what keeps random visitors from signing up. Change
-- 'SNS-TEAM-2026' to something only your team knows, then re-run this
-- CREATE OR REPLACE FUNCTION block (just this block, not the whole file)
-- in the Supabase SQL Editor any time you want to rotate the code. This
-- check lives in the database, not in the website's code, so someone
-- inspecting the site's JavaScript cannot find the real code here.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  first_user boolean;
begin
  if new.raw_user_meta_data->>'access_code' is distinct from 'SNS-TEAM-2026' then
    raise exception 'invalid_access_code';
  end if;

  select not exists(select 1 from public.profiles) into first_user;

  insert into public.profiles (id, username, full_name, contact, role, title)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'contact',
    case when first_user then 'admin' else 'member' end,
    new.raw_user_meta_data->>'title'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. is_admin() HELPER
-- security definer so it can check role without re-triggering RLS on
-- profiles (which would otherwise recurse into itself).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

-- ----------------------------------------------------------------------------
-- 7. PREVENT SELF ROLE ESCALATION
-- Without this, the "update your own profile" policy below would let any
-- member call the API directly and set their own role to 'admin'. Only an
-- existing admin may change someone's role (e.g. to promote a member).
-- ----------------------------------------------------------------------------
create or replace function public.prevent_role_escalation()
returns trigger as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a user''s role.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_role_escalation();

-- ----------------------------------------------------------------------------
-- 8. ENABLE RLS
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;

-- ----------------------------------------------------------------------------
-- 9. PROFILES POLICIES
-- Everyone can read their own profile; admins can read everyone's (needed
-- for the Team tab). Everyone can update their own profile; admins can
-- update anyone's (role changes are still gated by the trigger above).
-- ----------------------------------------------------------------------------
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. JOBS POLICIES
-- Members only ever see/touch rows where member_id = themselves. Admins see
-- and manage every row. Filing (insert) always attaches the job to whoever
-- is signed in — the app's UI only shows the "new job" action to members,
-- matching the original spec that admins view/manage but don't file.
-- ----------------------------------------------------------------------------
create policy "jobs_select_own_or_admin"
  on public.jobs for select
  using (member_id = auth.uid() or public.is_admin());

create policy "jobs_insert_self_or_admin"
  on public.jobs for insert
  with check (member_id = auth.uid() or public.is_admin());

create policy "jobs_update_own_or_admin"
  on public.jobs for update
  using (member_id = auth.uid() or public.is_admin());

create policy "jobs_delete_own_or_admin"
  on public.jobs for delete
  using (member_id = auth.uid() or public.is_admin());

-- ============================================================================
-- MIGRATION — added later: ticketing-system fields (Other job type detail,
-- priority, overdue reason). Safe to run on an existing, populated database:
-- purely additive, existing rows just get NULL / the default for these.
-- ============================================================================
alter table public.jobs add column if not exists job_type_other text;
alter table public.jobs add column if not exists overdue_reason text;
alter table public.jobs add column if not exists priority text not null default 'Normal'
  check (priority in ('Low', 'Normal', 'High', 'Urgent'));

-- ============================================================================
-- MIGRATION — added later: move the signup access code into a real,
-- admin-manageable table instead of a hardcoded value inside the trigger
-- function. Only admins can read or change it (enforced by RLS below), so
-- it's still invisible to members and to anyone outside the app entirely —
-- but now an admin can actually find and rotate it from the Settings tab
-- instead of needing to come back to the SQL Editor every time.
--
-- IMPORTANT: change 'SNS-TEAM-2026' in the insert below to whatever you
-- ACTUALLY set your access code to earlier. If you never changed it from
-- the original placeholder, leave it as SNS-TEAM-2026.
-- ============================================================================
create table public.app_settings (
  id boolean primary key default true,
  signup_access_code text not null,
  constraint app_settings_single_row check (id)
);

alter table public.app_settings enable row level security;

create policy "app_settings_select_admin"
  on public.app_settings for select
  using (public.is_admin());

create policy "app_settings_update_admin"
  on public.app_settings for update
  using (public.is_admin());

insert into public.app_settings (id, signup_access_code) values (true, 'SNS-TEAM-2026');

create or replace function public.handle_new_user()
returns trigger as $$
declare
  first_user boolean;
  required_code text;
begin
  select signup_access_code into required_code from public.app_settings where id = true;

  if new.raw_user_meta_data->>'access_code' is distinct from required_code then
    raise exception 'invalid_access_code';
  end if;

  select not exists(select 1 from public.profiles) into first_user;

  insert into public.profiles (id, username, full_name, contact, role, title)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'contact',
    case when first_user then 'admin' else 'member' end,
    new.raw_user_meta_data->>'title'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- MIGRATION — added later: departments, new-customer tracking, commissions.
--
-- Every member now belongs to a department (Sales & Marketing, Technical,
-- or Admin), chosen at signup. This is purely descriptive/organisational —
-- it has no effect on system permissions (that's still the separate `role`
-- column, controlled only by the first-signup-is-admin rule and admin
-- promotion). Existing profiles default to 'technical' since that's what
-- this system was originally built around; an admin can correct any
-- member's department afterwards from the Team tab.
--
-- Sales & Marketing and Technical members both earn a KSh 500 commission
-- per new customer they record — there's no separate "commission" balance
-- stored anywhere; it's always computed as (customer count × 500), so it
-- can never drift out of sync with the underlying customer records.
-- ============================================================================
alter table public.profiles add column if not exists department text not null default 'technical'
  check (department in ('sales', 'technical', 'admin'));

create table public.customers (
  id                 bigint generated always as identity primary key,
  full_name          text not null,
  contact            text not null,
  location           text not null,
  interested_package text,
  notes              text,
  recorded_by        uuid not null references public.profiles(id) on delete cascade,
  created_at         timestamptz not null default now()
);

create index customers_recorded_by_idx on public.customers(recorded_by);

alter table public.customers enable row level security;

-- Any signed-in member can see all customers (needed so a technician can
-- pick a lead sales recorded when filing a New Installation). Adding,
-- editing, or deleting is still restricted to whoever recorded it, or an
-- admin -- only visibility is open.
create policy "customers_select_all_authenticated"
  on public.customers for select
  using (auth.role() = 'authenticated');

create policy "customers_insert_self"
  on public.customers for insert
  with check (recorded_by = auth.uid());

create policy "customers_update_own_or_admin"
  on public.customers for update
  using (recorded_by = auth.uid() or public.is_admin());

create policy "customers_delete_own_or_admin"
  on public.customers for delete
  using (recorded_by = auth.uid() or public.is_admin());

-- Signup trigger now also captures department (defaults to 'technical' if
-- somehow missing from the signup payload, rather than failing the signup).
create or replace function public.handle_new_user()
returns trigger as $$
declare
  first_user boolean;
  required_code text;
begin
  select signup_access_code into required_code from public.app_settings where id = true;

  if new.raw_user_meta_data->>'access_code' is distinct from required_code then
    raise exception 'invalid_access_code';
  end if;

  select not exists(select 1 from public.profiles) into first_user;

  insert into public.profiles (id, username, full_name, contact, role, title, department)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'contact',
    case when first_user then 'admin' else 'member' end,
    new.raw_user_meta_data->>'title',
    coalesce(new.raw_user_meta_data->>'department', 'technical')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- MIGRATION — added later: a way for the signup form to check the access
-- code BEFORE attempting signup, with a clear answer either way.
--
-- Why this is needed: when the trigger's own check rejects a bad code,
-- Supabase's Auth API only ever returns a generic "Database error saving
-- new user" to the browser — it does not forward the specific reason. That
-- meant a wrong access code and an unrelated database problem looked
-- identical to the person signing up.
--
-- This function fixes that by letting the app ask "is this code right?"
-- as a normal, clean call — returning only true/false, never the actual
-- stored code — so a wrong code can be caught and explained clearly
-- before signup is ever attempted. The trigger's own check (above) still
-- does the real enforcement; this is purely for a better error message.
-- ============================================================================
create or replace function public.check_access_code(candidate text)
returns boolean as $$
  select exists (
    select 1 from public.app_settings
    where id = true and signup_access_code = candidate
  );
$$ language sql security definer stable set search_path = public;

grant execute on function public.check_access_code(text) to anon, authenticated;

-- ============================================================================
-- MIGRATION — added later: customer status + first/last name, commission
-- clearing (paid tracking), transport as a From -> To journey, and a
-- configurable commission rate.
-- ============================================================================

-- --- Customers: split full_name into first_name/last_name, add status ------
alter table public.customers add column if not exists first_name text;
alter table public.customers add column if not exists last_name text;
update public.customers set
  first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), ''), 'Unknown'),
  last_name = coalesce(last_name, nullif(substring(full_name from position(' ' in full_name) + 1), ''), '-')
where first_name is null or last_name is null;
alter table public.customers alter column first_name set not null;
alter table public.customers alter column last_name set not null;
alter table public.customers drop column if exists full_name;

alter table public.customers add column if not exists status text not null default 'New'
  check (status in ('New', 'Contacted', 'Converted', 'Not Interested'));

-- Tracks when a customer's commission was paid out. NULL = still owed.
-- Never delete customer records to "clear" a commission -- that would
-- destroy the underlying business record. This column is the only thing
-- that changes when a commission is paid.
alter table public.customers add column if not exists commission_paid_at timestamptz;

-- --- Jobs: transport becomes a From -> To journey instead of a flat
-- round-trip figure. transport_amount now means "this one leg", not
-- "both ways combined".
alter table public.jobs add column if not exists transport_from text;
alter table public.jobs add column if not exists transport_to text;

-- --- A configurable commission rate, alongside the existing access code --
alter table public.app_settings add column if not exists commission_per_customer numeric not null default 500;

-- app_settings itself stays admin-only (it holds the access code), but
-- members need to know the commission rate too. This exposes just that one
-- number, the same safe pattern as check_access_code above.
create or replace function public.get_commission_rate()
returns numeric as $$
  select commission_per_customer from public.app_settings where id = true;
$$ language sql security definer stable set search_path = public;

grant execute on function public.get_commission_rate() to anon, authenticated;

-- ============================================================================
-- MIGRATION — added later: admin job assignment, and potential-customer
-- scheduling (a lead who wants service on a specific future date).
--
-- Note on profile self-editing: no schema change is needed for this — the
-- existing profiles_update_own and profiles_update_admin policies already
-- allow a member to update their own name/contact/username, and an admin
-- to update anyone's, at the database level. That gap was UI-only.
-- ============================================================================

-- --- Admin job assignment ---------------------------------------------------
-- Tracks which admin assigned a job, if any (NULL = the member self-filed it,
-- same as every job before this update).
alter table public.jobs add column if not exists assigned_by uuid references public.profiles(id);

-- The original insert policy required member_id to be your own id, which
-- correctly stopped a regular member from filing a job under someone else's
-- name, but also blocked an admin from assigning a job TO someone else.
-- This replaces it: members still can only insert for themselves, admins can
-- insert for anyone.
drop policy if exists "jobs_insert_self" on public.jobs;
drop policy if exists "jobs_insert_self_or_admin" on public.jobs;
create policy "jobs_insert_self_or_admin"
  on public.jobs for insert
  with check (member_id = auth.uid() or public.is_admin());

-- --- Potential-customer scheduling ------------------------------------------
-- The date a prospective customer wants service, if they gave one (e.g.
-- "wants installation next Monday"). When this is set, the app also creates
-- a linked, future-dated Pending job card automatically, so the follow-up
-- is never just a note that gets forgotten — it's a real tracked job.
alter table public.customers add column if not exists desired_date date;

-- Links an auto-created job back to the customer record it came from.
alter table public.jobs add column if not exists customer_id bigint references public.customers(id) on delete set null;

-- ============================================================================
-- MIGRATION — added later: tracks which team member originally raised or
-- reported an issue that an admin is now assigning to a technician. This is
-- separate from "Requested by" (the actual client's name) and from
-- assigned_by (which admin did the assigning) — this is "who on the team
-- heard about it first."
-- ============================================================================
alter table public.jobs add column if not exists raised_by uuid references public.profiles(id);

-- ============================================================================
-- MIGRATION — added later: customer status is no longer its own tracked
-- field (New/Contacted/Converted/Not Interested). It's now derived live from
-- whichever job is linked to the customer (Pending/In Progress/Completed —
-- the same statuses a job already has), or "Pending" if no job has been
-- created for them yet. Nothing to keep in sync manually, nothing to drift.
-- ============================================================================
alter table public.customers drop column if exists status;

-- ============================================================================
-- MIGRATION — added later: refining the assign-a-job workflow.
--
-- - raised_by: which team member reported/raised the issue an admin is
--   assigning, separate from who it's assigned TO and who filed it.
-- - Customers become visible to every signed-in member (not just whoever
--   recorded them), because filing a "New Installation" now needs to let
--   any member pick from customers ANYONE recorded — a technician
--   installing for a lead that sales found needs to see that lead.
--   Adding/editing/deleting a customer record is still restricted to
--   whoever recorded it (or an admin), same as before -- only SELECT
--   changes.
-- - customers_with_jobs(): a narrowly-scoped, safe way for the installation
--   picker to know which customers already have a job linked, without
--   needing to expose the full jobs table more broadly than it already is.
-- ============================================================================

alter table public.jobs add column if not exists raised_by uuid references public.profiles(id);

drop policy if exists "customers_select_own_or_admin" on public.customers;
drop policy if exists "customers_select_all_authenticated" on public.customers;
create policy "customers_select_all_authenticated"
  on public.customers for select
  using (auth.role() = 'authenticated');

create or replace function public.customers_with_jobs()
returns table(customer_id bigint) as $$
  select distinct j.customer_id from public.jobs j where j.customer_id is not null;
$$ language sql security definer stable set search_path = public;

grant execute on function public.customers_with_jobs() to authenticated;

-- ============================================================================
-- MIGRATION — added later: requested_by becomes optional.
--
-- Sales & Marketing members often file a job for a general field visit with
-- no specific client requester -- Technical still requires it, since their
-- work is normally tied to who asked for it (enforced in the app, not here).
-- The database just needs to stop rejecting an empty value outright.
-- ============================================================================
alter table public.jobs alter column requested_by drop not null;

-- ============================================================================
-- Done. Next: Authentication -> Providers -> make sure Email is enabled,
-- and add your local + Netlify URLs under Authentication -> URL Configuration
-- -> Redirect URLs (needed for the "forgot password" link to work).
-- See README.md for the full walkthrough.
-- ============================================================================
