-- =============================================================================
-- SNS Job Cards -- REBUILD for a NEW, EMPTY Supabase project.
--
-- Paste the whole file into the SQL editor of the new project and run it once.
-- It builds every table, rule, trigger and the receipts bucket, plus the stock
-- catalogue. The first person to sign up becomes the admin, and staff need the
-- access code SNS-TEAM-2026 (change it in Settings afterwards).
--
-- Safety: it refuses to run if the database already has tables.
-- =============================================================================
do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.jobs') is not null then
    raise exception 'This database already has tables. Run this file only in a NEW, empty Supabase project.';
  end if;
end $$;

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
  -- auth.uid() is null in the SQL editor, so roles can always be fixed there. Anyone using the
  -- app or API is still checked.
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
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
-- Added for the rebuild: this column is created again further down, but the policy below
-- reads it, so on an empty database it has to exist first.
alter table public.jobs add column if not exists raised_by uuid references public.profiles(id);

create policy "jobs_select_own_raised_or_admin"
  on public.jobs for select
  using (member_id = auth.uid() or raised_by = auth.uid() or public.is_admin());

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
-- MIGRATION — added later: a job's transport can now cover multiple stops
-- (Office -> Site A -> Site B -> ...), not just one destination.
--
-- transport_to changes from a single value to an array. Existing jobs each
-- had exactly one destination, so this converts every existing value into a
-- one-element array -- no data is lost, every past job just becomes "a trip
-- with one stop", which is accurate.
-- ============================================================================
alter table public.jobs alter column transport_to type text[] using (
  case when transport_to is null then null else array[transport_to] end
);

-- ============================================================================
-- MIGRATION — added later: complaint handling.
--
-- A complaint is deliberately its own thing, not a job or a customer record
-- -- it has no technician dispatch, no transport, no visit date. Sales &
-- Marketing and Technical members can both raise one; Admin and Technical
-- can both see and work the shared queue. This is the first place in the
-- system where a regular member sees something beyond their own
-- records -- Technical needs the WHOLE team's complaints, not just ones
-- they personally raised, since resolving them is a shared responsibility.
--
-- Nothing is ever deleted when a complaint is resolved -- it just stops
-- appearing in the active queue everyone works from day to day, the same
-- way a completed job doesn't vanish, it just isn't "Pending" anymore. The
-- historical record stays intact for admin to review later if needed.
-- ============================================================================
create table public.complaints (
  id                    bigint generated always as identity primary key,
  complainant_name      text not null,
  location              text not null,
  contact               text not null,
  complaint_type        text not null,
  complaint_type_other  text,
  details               text not null,
  is_recurring          boolean not null default false,
  status                text not null default 'New' check (status in ('New', 'In Progress', 'Resolved')),
  resolution_notes      text,
  raised_by             uuid not null references public.profiles(id) on delete cascade,
  resolved_by           uuid references public.profiles(id),
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index complaints_status_idx on public.complaints(status);

alter table public.complaints enable row level security;

-- Anyone can raise a complaint under their own name (the UI restricts this
-- to Sales & Marketing and Technical, same "UI convention, not a hard DB
-- wall" approach already used elsewhere in this schema).
create policy "complaints_insert_self"
  on public.complaints for insert
  with check (raised_by = auth.uid());

-- Only admins and Technical department members can see the queue.
create policy "complaints_select_admin_or_technical"
  on public.complaints for select
  using (
    public.is_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and department = 'technical')
  );

-- Same two groups can update status and add resolution notes as they work
-- a complaint toward resolution.
create policy "complaints_update_admin_or_technical"
  on public.complaints for update
  using (
    public.is_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and department = 'technical')
  );

-- Deleting a complaint record entirely (as opposed to resolving it) is
-- admin-only, same as customers.
create policy "complaints_delete_admin"
  on public.complaints for delete
  using (public.is_admin());

-- Technical members viewing the complaints queue need to see who raised
-- each one, but can't see the full profiles table (RLS correctly blocks
-- that -- contact numbers and usernames aren't any member's business but
-- their own). This exposes only id + name + department, safe for any
-- signed-in member -- also reused for the co-technician picker below, so
-- a member filing a job can see which colleagues are Technical without
-- needing broader profile access.
create or replace function public.member_names()
returns table(id uuid, full_name text, department text) as $$
  select p.id, p.full_name, p.department from public.profiles p;
$$ language sql security definer stable set search_path = public;

grant execute on function public.member_names() to authenticated;

-- ============================================================================
-- MIGRATION — added later: a job's original raiser keeps visibility into it
-- even after it's reassigned to someone else.
--
-- Previously, once admin reassigned a job away from whoever it started
-- under (e.g. a Sales member's auto-created follow-up job, handed to a
-- technician), the original person lost all visibility -- RLS blocked
-- them from even seeing it, regardless of raised_by being set. This is
-- specifically what makes "the sales person sees it marked Complete
-- without doing anything" possible: they're reading the exact same row
-- the technician is updating, not a copy.
-- ============================================================================
drop policy if exists "jobs_select_own_or_admin" on public.jobs;
drop policy if exists "jobs_select_own_raised_or_admin" on public.jobs;
create policy "jobs_select_own_raised_or_admin"
  on public.jobs for select
  using (member_id = auth.uid() or raised_by = auth.uid() or public.is_admin());

-- ============================================================================
-- MIGRATION — added later: co-attending technicians, member email (for
-- notifications), and transport payment tracking.
--
-- co_technicians: in practice, one, two, or three technicians often attend
-- the same visit together, but each job card is still one row filed by one
-- person. Without this, if two techs each filed their own card for the
-- same visit, "Jobs by Type" would double-count a single job. This lets
-- the filer note who else was there, on the SAME row, so a co-attended
-- visit is still exactly one job, one count -- and everyone who actually
-- worked it gets fair credit in their own job-count, not just whoever
-- happened to file the paperwork.
--
-- profiles.email: needed so admin can notify a member by email when
-- assigning a job. auth.users has this, but it isn't queryable from the
-- client the way profiles is -- mirroring it here at signup makes it
-- available the same way everything else about a member already is.
-- ============================================================================
alter table public.jobs add column if not exists co_technicians uuid[];

alter table public.profiles add column if not exists email text;

-- Backfill existing members -- this only works because the SQL Editor runs
-- with full database privileges, including read access to auth.users. New
-- signups get this from the trigger update below, going forward.
update public.profiles set email = (select u.email from auth.users u where u.id = profiles.id) where email is null;

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

  insert into public.profiles (id, username, full_name, contact, role, title, department, email)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'contact',
    case when first_user then 'admin' else 'member' end,
    new.raw_user_meta_data->>'title',
    coalesce(new.raw_user_meta_data->>'department', 'technical'),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Transport payments: tracks when a job's transport cost was actually paid
-- out to the member, same non-destructive pattern as commission -- nothing
-- is ever deleted, a job just stops showing as "unpaid" once marked.
alter table public.jobs add column if not exists transport_paid_at timestamptz;

-- member_names() gains a department column, for the co-technician picker.
-- Postgres won't let CREATE OR REPLACE change a function's return type, so
-- existing databases need it dropped first -- this is a no-op on a fresh
-- install where it doesn't exist yet.
drop function if exists public.member_names();
create or replace function public.member_names()
returns table(id uuid, full_name text, department text) as $$
  select p.id, p.full_name, p.department from public.profiles p;
$$ language sql security definer stable set search_path = public;

grant execute on function public.member_names() to authenticated;

-- ============================================================================
-- MIGRATION — added later: expense/purchase tracking with receipt uploads.
--
-- Anyone can submit a purchase or expense with a receipt photo. Admin
-- reviews and approves (or rejects) it, then separately marks it paid once
-- reimbursed -- the same "approve, then pay" two-step most real expense
-- workflows actually use, not one flag doing double duty.
--
-- This is the first feature in the app that stores an actual file, not
-- just data -- so it needs a Storage bucket alongside the usual table.
-- The bucket is private: receipts aren't public URLs, they're only
-- reachable via a signed link the app generates for someone who's
-- actually allowed to see that specific receipt.
-- ============================================================================
create table public.expenses (
  id                   bigint generated always as identity primary key,
  description          text not null,
  amount               numeric(10,2) not null,
  category             text not null,
  purchase_date        date,
  receipt_path         text,
  receipt_uploaded_at  timestamptz,
  status               text not null default 'Requested' check (status in ('Requested', 'Approved', 'Rejected', 'Purchased', 'Paid')),
  admin_notes          text,
  submitted_by         uuid not null references public.profiles(id) on delete cascade,
  reviewed_by          uuid references public.profiles(id),
  reviewed_at          timestamptz,
  paid_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index expenses_status_idx on public.expenses(status);

alter table public.expenses enable row level security;

create policy "expenses_insert_self"
  on public.expenses for insert
  with check (submitted_by = auth.uid());

create policy "expenses_select_own_or_admin"
  on public.expenses for select
  using (submitted_by = auth.uid() or public.is_admin());

-- Approving, rejecting, and marking paid are all admin actions -- a member
-- submits and can see their own submission's status change, but can't
-- move it through the workflow themselves.
create policy "expenses_update_admin"
  on public.expenses for update
  using (public.is_admin());

-- A member can withdraw their own submission only before anyone's acted on
-- it -- once admin has reviewed it, deleting it would erase the record of
-- that decision, so only admin can remove it from that point on.
create policy "expenses_delete_own_pending_or_admin"
  on public.expenses for delete
  using ((submitted_by = auth.uid() and status = 'Submitted') or public.is_admin());

-- --- Storage bucket for receipt photos ---
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Receipts are stored under a path starting with the uploader's own user
-- id (e.g. "{user_id}/167..._receipt.jpg"), which is what these policies
-- check against -- the same own-record-or-admin shape used everywhere
-- else, just expressed through a file path instead of a table column.
create policy "receipts_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "receipts_select_own_or_admin"
  on storage.objects for select
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "receipts_delete_own_or_admin"
  on storage.objects for delete
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================================
-- MIGRATION — added later: expenses become Team Lead + Director only.
--
-- Two new flags on top of the existing role system, not a replacement for
-- it -- a Team Lead is still a regular member, just one admin has marked
-- as trusted to make purchases. A Director is still an admin, just the
-- specific one the owner has designated to approve them. Both are
-- deliberately independent of role/department, since "who can approve
-- purchases" isn't the same question as "who is an admin".
--
-- Only one Director should exist at a time (setting a new one clears any
-- previous one) -- multiple admins can still see the queue for oversight,
-- but only the Director can actually approve, reject, or mark paid.
-- ============================================================================
alter table public.profiles add column if not exists is_team_lead boolean not null default false;
alter table public.profiles add column if not exists is_director boolean not null default false;

drop policy if exists "expenses_insert_self" on public.expenses;
create policy "expenses_insert_team_lead_or_admin"
  on public.expenses for insert
  with check (
    submitted_by = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.profiles where id = auth.uid() and is_team_lead = true)
    )
  );

-- Approving, rejecting, and marking paid are Director-only now -- not
-- just any admin. Viewing the queue (select) stays open to every admin,
-- so the rest of the admin team keeps visibility even though only one
-- person can act on it.
drop policy if exists "expenses_update_admin" on public.expenses;
create policy "expenses_update_director"
  on public.expenses for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_director = true));

-- ============================================================================
-- MIGRATION — added later: purchases become request-first, not
-- reimbursement-after-the-fact.
--
-- Previously a submission already had a receipt attached (buy first,
-- report after). Now the first submission is a REQUEST -- no receipt yet,
-- just what's needed and roughly how much. Only once the Director
-- approves does the person go buy it, then come back and attach the
-- receipt as proof. Paying out only happens after that proof exists, not
-- before -- the whole point of asking first is that money doesn't move
-- without approval, so nothing should be markable "Paid" before a receipt
-- backs it up.
--
-- Existing "Submitted" rows are treated as already having been requests,
-- and renamed to "Requested" so the status vocabulary stays consistent
-- going forward, rather than leaving old and new naming mixed together.
-- ============================================================================
alter table public.expenses alter column receipt_path drop not null;
alter table public.expenses alter column purchase_date drop not null;
alter table public.expenses add column if not exists receipt_uploaded_at timestamptz;

update public.expenses set status = 'Requested' where status = 'Submitted';

alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check
  check (status in ('Requested', 'Approved', 'Rejected', 'Purchased', 'Paid'));
alter table public.expenses alter column status set default 'Requested';

-- A request can only be withdrawn by its own submitter while it's still
-- just a request -- once the Director has acted on it (approved or
-- rejected), that decision is a record worth keeping.
drop policy if exists "expenses_delete_own_pending_or_admin" on public.expenses;
create policy "expenses_delete_own_pending_or_admin"
  on public.expenses for delete
  using ((submitted_by = auth.uid() and status = 'Requested') or public.is_admin());

-- The one narrow thing a submitter can do themselves: once their own
-- request is Approved, move it to Purchased by attaching the receipt.
-- The USING clause only allows touching a row they own that's currently
-- Approved; the WITH CHECK clause only allows the result to be Purchased
-- -- so this exact transition is all it permits. They still can't approve
-- their own request, jump straight to Paid, or touch anyone else's row.
create policy "expenses_update_submitter_attach_receipt"
  on public.expenses for update
  using (submitted_by = auth.uid() and status = 'Approved')
  with check (submitted_by = auth.uid() and status = 'Purchased');

-- ============================================================================
-- MIGRATION — added later: employee statutory details, locking edited-once
-- records, and expenses gaining a Services type alongside Purchases.
--
-- Jobs: once transport for a job has been paid, or the job is both
-- Completed and its visit date is in the past, a member can no longer
-- edit it -- admin keeps override ability, since fixing a genuine mistake
-- should still be possible for the people responsible for the records.
--
-- Expenses: a Service (paying an outside person -- e.g. a cleaner who
-- isn't SNS staff) is a different shape of thing than a Purchase. It has
-- no receipt at all, so it skips the attach-receipt step entirely and
-- goes straight from Approved to Paid. Only admin can file one, since the
-- provider isn't a Team Lead making their own purchase.
-- ============================================================================
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists id_number text;
alter table public.profiles add column if not exists kra_pin text;
alter table public.profiles add column if not exists sha_number text;

drop policy if exists "jobs_update_own_or_admin" on public.jobs;
create policy "jobs_update_own_or_admin"
  on public.jobs for update
  using (
    public.is_admin()
    or (
      member_id = auth.uid()
      and transport_paid_at is null
      and not (status = 'Completed' and visit_date < current_date)
    )
  );

alter table public.expenses add column if not exists entry_type text not null default 'purchase' check (entry_type in ('purchase', 'service'));
alter table public.expenses add column if not exists provider_name text;
alter table public.expenses add column if not exists provider_contact text;

-- A Purchase can be filed by a Team Lead or any admin (unchanged). A
-- Service can only be filed by admin, since it's paying someone who
-- isn't SNS staff and has no Team Lead status to check.
drop policy if exists "expenses_insert_team_lead_or_admin" on public.expenses;
create policy "expenses_insert_team_lead_or_service_admin"
  on public.expenses for insert
  with check (
    submitted_by = auth.uid()
    and (
      (entry_type = 'purchase' and (public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and is_team_lead = true)))
      or (entry_type = 'service' and public.is_admin())
    )
  );

-- The submitter's one narrow allowed move is attaching a receipt
-- (Approved -> Purchased, from an earlier migration) -- this closes the
-- gap where that same update could also sneak in a changed amount. Admin
-- and the Director are untouched by this, since it only fires for the
-- row's own submitter acting as a non-admin.
create or replace function public.expenses_lock_amount_for_submitter()
returns trigger as $$
begin
  if old.submitted_by = auth.uid() and not public.is_admin() then
    if new.amount is distinct from old.amount then
      raise exception 'Amount cannot be changed when attaching a receipt.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists expenses_lock_amount_for_submitter_trigger on public.expenses;
create trigger expenses_lock_amount_for_submitter_trigger
  before update on public.expenses
  for each row execute function public.expenses_lock_amount_for_submitter();

-- ============================================================================
-- MIGRATION — added later: Stock/Inventory tracking, admin and Director only.
--
-- Mirrors the structure of the existing Swahili_Net_Solution_Stock_Tracker
-- spreadsheet: an Item Master feeding Stock In (purchases) and Stock Out
-- (usage) logs, with current stock levels computed from the two logs
-- rather than stored -- same "compute from the raw data" approach already
-- used for commission and transport totals elsewhere in this app, so
-- current stock can never drift out of sync with its own history.
--
-- Restricted to admin only -- Director doesn't need a separate carve-out
-- here the way expense approval does, since a Director is already an
-- admin; "admin and Director" both being able to see this is already
-- satisfied by a single admin-only restriction.
--
-- Seeded below with the real item catalog and stock history from the
-- existing spreadsheet, so current stock levels start accurate rather
-- than at zero -- not example data, this is the actual inventory.
-- ============================================================================
create table public.stock_items (
  id             bigint generated always as identity primary key,
  item_code      text not null unique,
  item_name      text not null,
  category       text,
  unit           text not null,
  reorder_level  numeric not null default 0,
  unit_cost      numeric(10,2) not null default 0,
  supplier       text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table public.stock_in (
  id            bigint generated always as identity primary key,
  item_id       bigint not null references public.stock_items(id) on delete restrict,
  purchase_date date not null,
  quantity      numeric not null,
  unit_cost     numeric(10,2) not null,
  supplier      text,
  invoice_no    text,
  received_by   text,
  recorded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table public.stock_out (
  id            bigint generated always as identity primary key,
  item_id       bigint not null references public.stock_items(id) on delete restrict,
  issue_date    date not null,
  quantity      numeric not null,
  issued_to     text,
  purpose       text,
  reference_no  text,
  issued_by     text,
  recorded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index stock_in_item_idx on public.stock_in(item_id);
create index stock_out_item_idx on public.stock_out(item_id);

alter table public.stock_items enable row level security;
create policy "stock_items_admin_only" on public.stock_items for all using (public.is_admin()) with check (public.is_admin());

alter table public.stock_in enable row level security;
create policy "stock_in_admin_only" on public.stock_in for all using (public.is_admin()) with check (public.is_admin());

alter table public.stock_out enable row level security;
create policy "stock_out_admin_only" on public.stock_out for all using (public.is_admin()) with check (public.is_admin());

-- Seed data: the actual item catalog and stock history from
-- Swahili_Net_Solution_Stock_Tracker.xlsx, imported so current stock
-- levels reflect real history rather than starting at zero.
insert into public.stock_items (item_code, item_name, category, unit, reorder_level, unit_cost, supplier, notes) values
  ('ITM-001', 'Drop Cable 1KM', 'Networking', 'box', 1, 9500, 'Data Connect Technology', 'Outdoor installations | ISP rollout'),
  ('ITM-002', 'CAT 6 Indoor', 'Networking', 'roll', 1, 3700, 'Data Connect Technology', 'Indoor cabling'),
  ('ITM-003', 'POE 48V', 'Power & Adapters', 'pack', 5, 500, 'Data Connect Technology', 'Compatible with Mikrotik routers'),
  ('ITM-004', 'POE 24V', 'Power & Adapters', 'pcs', 5, 500, 'Data Connect Technology', 'Compatible with TP Link routers'),
  ('ITM-005', 'Adapter', 'Power & Adapters', 'pcs', 5, 500, 'Data Connect Technology', 'Universal use'),
  ('ITM-006', 'Router (ONU)', 'Networking', 'pcs', 3, 1500, 'Data Connect Technology', 'Client installations'),
  ('ITM-007', 'Cable Tester', 'Accessories', 'pcs', 1, 500, 'Data Connect Technology', 'Works with RJ45 cables'),
  ('ITM-008', 'Strap', 'Accessories', 'pack', 1, 2300, 'Data Connect Technology', 'Cable management | Site installations'),
  ('ITM-009', 'TP Link', 'Networking', 'pcs', 2, 1850, 'Data Connect Technology', 'General networking | Small office/home'),
  ('ITM-010', 'Tensioner PA 1500', 'Accessories', 'pcs', 5, 300, 'Data Connect Technology', 'Fiber cable tensioning | Outdoor projects'),
  ('ITM-011', 'Hose clamp', 'Accessories', 'pcs', 5, 300, 'Data Connect Technology', 'General fastening | Site installations'),
  ('ITM-012', 'XPON Router', 'Networking', 'pcs', 2, 1300, 'Data Connect Technology', 'Client installations'),
  ('ITM-013', 'Splitters 1x4', 'Splitters', 'pcs', 1, 200, 'Data Connect Technology', 'Fiber optic distribution | Small client setups'),
  ('ITM-014', 'Splitters 1x8', 'Splitters', 'pcs', 1, 300, 'Data Connect Technology', 'Fiber optic distribution | Medium client setups'),
  ('ITM-015', 'Splitters 1x16', 'Splitters', 'pcs', 1, 400, 'Data Connect Technology', 'Fiber optic distribution | Large client setups'),
  ('ITM-016', 'RJ 45', 'Connectors', 'pack', 1, 500, 'Data Connect Technology', 'Works with Cat6 cables'),
  ('ITM-017', 'Cable tie', 'Accessories', 'pack', 2, 200, 'Data Connect Technology', 'Cable management | Office & field use'),
  ('ITM-018', 'UPBS', 'Power & Adapters', 'pcs', 1, 250, 'Data Connect Technology', 'Compatible with routers | Backup power'),
  ('ITM-020', 'Dome Closure 48 core', 'Networking', 'pcs', 1, 3300, 'Data Connect Technology', 'Fiber optic splicing | Outdoor installations'),
  ('ITM-021', 'Ruijies 6202G', 'Networking', 'pcs', 1, 17500, 'Data Connect Technology', 'Gigabit router'),
  ('ITM-022', 'Ruijies 620D', 'Networking', 'pcs', 1, 14000, 'Data Connect Technology', 'Dual-band router'),
  ('ITM-023', 'ATBS', 'Power & Adapters', 'pcs', 1, 50, 'Data Connect Technology', 'Power backup systems | ISP setups'),
  ('ITM-024', 'Patch Cords (SC-SC)', 'Connectors', 'pcs', 1, 130, 'Data Connect Technology', 'Fiber optic systems | Client installations'),
  ('ITM-025', 'J hook small', 'Accessories', 'pcs', 5, 250, 'Data Connect Technology', 'Cable routing | Indoor installations'),
  ('ITM-026', 'Buckles', 'Accessories', 'pcs', 10, 15, 'Data Connect Technology', 'General fastening | Site installations');

-- (The opening stock movements were here. They need an admin account to exist, so they are in
-- job-card-restore-stock-history.sql, to run after the first admin has signed up.)

-- Employee numbers (SNS001, SNS002, ...). Nullable so sign-ups work before numbers are assigned.
alter table public.profiles add column if not exists employee_number text;
create unique index if not exists profiles_employee_number_key on public.profiles (employee_number) where employee_number is not null;

-- ============================================================================
-- Done. Next: Authentication -> Providers -> make sure Email is enabled,
-- and add your local + Netlify URLs under Authentication -> URL Configuration
-- -> Redirect URLs (needed for the "forgot password" link to work).
-- See README.md for the full walkthrough.
-- ============================================================================

-- ===== UPDATE 35 (devices, field visits, restore support) =====
-- 1. XPON router / ONU: record "new installation" or "replacement" -------------------------------
alter table public.stock_items add column if not exists is_device boolean not null default false;
update public.stock_items set is_device = true
  where item_name ilike '%onu%' or item_name ilike '%xpon%';

alter table public.stock_out add column if not exists install_type text;
alter table public.stock_out drop constraint if exists stock_out_install_type_check;
alter table public.stock_out add constraint stock_out_install_type_check
  check (install_type in ('new_installation', 'replacement'));
alter table public.stock_out add column if not exists customer_id bigint
  references public.customers(id) on delete set null;
alter table public.stock_out add column if not exists device_serial text;
create index if not exists stock_out_customer_idx on public.stock_out(customer_id);

create or replace function public.stock_out_device_rules()
returns trigger language plpgsql as $$
begin
  if new.install_type = 'replacement' and new.customer_id is null then
    raise exception 'A replacement must record the customer the device was replaced for.';
  end if;
  return new;
end $$;
drop trigger if exists trg_stock_out_device_rules on public.stock_out;
create trigger trg_stock_out_device_rules before insert on public.stock_out
  for each row execute function public.stock_out_device_rules();

-- 2. Field visits for the Sales & Marketing team ---------------------------------------------------
create or replace function public.is_sales_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and (role = 'admin' or department = 'sales'))
$$;

create table if not exists public.places (
  id          bigint generated always as identity primary key,
  name        text not null,
  area        text,
  category    text not null default 'other'
              check (category in ('estate', 'hotel', 'school', 'business', 'village', 'market', 'other')),
  notes       text,
  active      boolean not null default true,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists places_name_area_key
  on public.places (lower(name), lower(coalesce(area, '')));

create table if not exists public.visits (
  id              bigint generated always as identity primary key,
  place_id        bigint not null references public.places(id) on delete cascade,
  visit_date      date not null,
  purpose         text not null check (purpose in ('marketing', 'site_survey', 'both')),
  outcome         text not null check (outcome in
                    ('interested', 'follow_up', 'no_one_available', 'not_interested', 'survey_done', 'converted', 'other')),
  leads           int not null default 0 check (leads >= 0),
  follow_up_date  date,
  notes           text,
  visited_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists visits_place_idx on public.visits(place_id);
create index if not exists visits_by_idx on public.visits(visited_by);
create index if not exists visits_date_idx on public.visits(visit_date);

alter table public.places enable row level security;
alter table public.visits enable row level security;

drop policy if exists "places_select" on public.places;
create policy "places_select" on public.places for select using (public.is_sales_or_admin());
drop policy if exists "places_insert" on public.places;
create policy "places_insert" on public.places for insert
  with check (public.is_admin() or (public.is_sales_or_admin() and created_by = auth.uid()));
drop policy if exists "places_update" on public.places;
create policy "places_update" on public.places for update
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());
drop policy if exists "places_delete" on public.places;
create policy "places_delete" on public.places for delete using (public.is_admin());

drop policy if exists "visits_select" on public.visits;
create policy "visits_select" on public.visits for select using (public.is_sales_or_admin());
drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert" on public.visits for insert
  with check (public.is_admin() or (public.is_sales_or_admin() and visited_by = auth.uid()));
drop policy if exists "visits_update" on public.visits;
create policy "visits_update" on public.visits for update
  using (public.is_admin() or visited_by = auth.uid())
  with check (public.is_admin() or visited_by = auth.uid());
drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete" on public.visits for delete
  using (public.is_admin() or visited_by = auth.uid());

-- 3. Backup restore support ---------------------------------------------------------------------------
-- A restore is done by an admin on behalf of the staff who originally recorded each row.
drop policy if exists "customers_insert_admin" on public.customers;
create policy "customers_insert_admin" on public.customers for insert with check (public.is_admin());
drop policy if exists "complaints_insert_admin" on public.complaints;
create policy "complaints_insert_admin" on public.complaints for insert with check (public.is_admin());
drop policy if exists "expenses_insert_admin" on public.expenses;
create policy "expenses_insert_admin" on public.expenses for insert with check (public.is_admin());

-- After restored jobs are loaded (with their original JC- codes), move the counter past them
-- so the next new job does not collide with a restored one.
create or replace function public.bump_job_code_seq()
returns void language plpgsql security definer set search_path = public as $$
declare highest bigint;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select coalesce(max(regexp_replace(job_code, '\D', '', 'g')::bigint), 0)
    into highest from public.jobs where job_code ~ '^JC-[0-9]+$';
  perform setval('public.job_code_seq', greatest(highest, 1), highest >= 1);
end $$;
revoke all on function public.bump_job_code_seq() from public, anon;
grant execute on function public.bump_job_code_seq() to authenticated;

-- ===== UPDATE 36 (employee numbers) =====
-- Employee numbers (SNS001, SNS002, ...) ----------------------------------------------------------------
-- SNS001 = the Director, SNS002 = the admin who runs the assignment, everyone else gets a random
-- number from SNS003. Numbers are unique and only an admin can change one.
alter table public.profiles add column if not exists employee_number text;
create unique index if not exists profiles_employee_number_key
  on public.profiles (employee_number) where employee_number is not null;

create or replace function public.protect_employee_number()
returns trigger language plpgsql as $$
begin
  -- auth.uid() is null in the SQL editor, so numbers can always be corrected there
  if auth.uid() is not null and new.employee_number is distinct from old.employee_number and not public.is_admin() then
    raise exception 'Only an admin can change employee numbers';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_employee_number on public.profiles;
create trigger trg_protect_employee_number before update on public.profiles
  for each row execute function public.protect_employee_number();

create or replace function public.highest_employee_number()
returns int language sql stable as $$
  select coalesce(max(substring(employee_number from '^SNS([0-9]+)$')::int), 0) from public.profiles
$$;

-- Gives a number to every team member who has none. Numbers already given are never changed,
-- so it is safe to press again whenever someone new has joined. Returns how many were given.
create or replace function public.assign_employee_numbers()
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
  made int := 0;
  got int;
  r record;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  perform pg_advisory_xact_lock(7036001);

  if not exists (select 1 from public.profiles where employee_number = 'SNS001') then
    update public.profiles set employee_number = 'SNS001'
      where id = (select id from public.profiles where is_director and employee_number is null limit 1);
    get diagnostics got = row_count; made := made + got;
  end if;

  if not exists (select 1 from public.profiles where employee_number = 'SNS002') then
    update public.profiles set employee_number = 'SNS002'
      where id = me and employee_number is null and not is_director;
    get diagnostics got = row_count; made := made + got;
  end if;

  n := greatest(public.highest_employee_number(), 2);
  for r in select id from public.profiles where employee_number is null order by random() loop
    n := n + 1;
    update public.profiles set employee_number = 'SNS' || lpad(n::text, 3, '0') where id = r.id;
    made := made + 1;
  end loop;
  return made;
end $$;
revoke all on function public.assign_employee_numbers() from public, anon;
grant execute on function public.assign_employee_numbers() to authenticated;
