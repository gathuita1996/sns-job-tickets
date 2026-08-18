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
  requested_by       text not null,
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
-- 5. AUTO-CREATE PROFILE ON SIGNUP + FIRST USER = ADMIN
-- Supabase Auth creates the auth.users row when someone signs up; this
-- trigger creates the matching profiles row from the metadata the app sends
-- (username/full_name/contact/title), and makes the very first signup an
-- admin so there's always a way in.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  first_user boolean;
begin
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

create policy "jobs_insert_self"
  on public.jobs for insert
  with check (member_id = auth.uid());

create policy "jobs_update_own_or_admin"
  on public.jobs for update
  using (member_id = auth.uid() or public.is_admin());

create policy "jobs_delete_own_or_admin"
  on public.jobs for delete
  using (member_id = auth.uid() or public.is_admin());

-- ============================================================================
-- Done. Next: Authentication -> Providers -> make sure Email is enabled,
-- and add your local + Netlify URLs under Authentication -> URL Configuration
-- -> Redirect URLs (needed for the "forgot password" link to work).
-- See README.md for the full walkthrough.
-- ============================================================================
