-- =============================================================================
-- SNS Job Cards -- UPDATE 36.  Run once in the SQL editor of your live project (safe to re-run).
--   Employee numbers: SNS001 = Director, SNS002 = the admin who runs "Assign employee numbers",
--   everyone else a random number from SNS003. Only an admin can change a number.
-- (Run update-35-migration.sql first if you have not already.)
-- =============================================================================

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
