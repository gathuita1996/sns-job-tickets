-- ============================================================================
-- UPDATE 53 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   "Other" keeps "Job details", like New Installation and Site Survey
--      * Update 52 asked for a reported fault and how it was solved on every job type except New Installation and Site
--        Survey, and the database refused a member's NEW job of those types when either was empty. "Other" was one of them.
--      * From now on three job types keep "Job details" and are never asked for the two: New Installation, Site Survey and
--        Other. The database follows the app: public.job_fault_report_missing(job type, fault, resolution) answers with an
--        empty list for all three, so a member's new "Other" job is accepted with "Job details" alone. Network
--        Troubleshooting, Router / Equipment Repair, Routine Maintenance, Fibre / Cable Repair and Equipment Upgrade still
--        need both texts, exactly as before ("Empty" still means nothing but spaces, tabs and line breaks).
--      * Everything else about the rule is as in update 52: only a member's NEW job is held back (with the message "Please
--        describe the reported fault and how it was solved.", hint: fault_resolution_required); admins, the server's own key
--        and the SQL editor are not; editing, completing or deleting a job is never blocked.
--      * No job is changed. An "Other" job that was filed under update 52 with a reported fault and a resolution keeps both
--        (the app shows them, read-only, and never erases them).
--      * This file is complete in itself: it also carries the two columns, the two functions and the trigger of update 52, so
--        it works whether or not update 52 was run first. If it was, this replaces its two functions and its trigger with the
--        rule above and changes nothing else.
--
--   The same list of job types is in the app (src/lib/faultReport.js). A test fails if the two ever differ.
--
--   The rest of Update 53 (the Director's 5:31 pm email on every day of the week, Custom mode as the default colour mode)
--   needs nothing in the database.
-- ============================================================================

-- ---- 1. the two columns (as in update 52; nothing happens if they are already there) ---------------------------------------
alter table public.jobs add column if not exists reported_fault text;
alter table public.jobs add column if not exists resolution     text;

-- ---- 2. which of the two is empty for this job type -----------------------------------------------------------------
-- Returns the names, in this order: {} | {reported_fault} | {resolution} | {reported_fault,resolution}.
create or replace function public.job_fault_report_missing(p_job_type text, p_fault text, p_resolution text)
returns text[] language sql immutable as $$
  select case
    when p_job_type in ('New Installation', 'Site Survey', 'Other') then array[]::text[]
    else array_remove(array[
      case when coalesce(p_fault, '')      ~ '^[ \t\r\n]*$' then 'reported_fault' end,
      case when coalesce(p_resolution, '') ~ '^[ \t\r\n]*$' then 'resolution'     end
    ], null)
  end
$$;

-- ---- 3. the guard on new jobs ---------------------------------------------------------------------------------------
create or replace function public.require_fault_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  missing text[];
begin
  -- Nobody signed in (the server's own key, the SQL editor) and admins are not held to it.
  if auth.uid() is null or public.is_admin() then return new; end if;
  missing := public.job_fault_report_missing(new.job_type, new.reported_fault, new.resolution);
  if coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'Please describe the reported fault and how it was solved.'
      using detail = 'Still empty: ' || array_to_string(missing, ', '),
            hint = 'fault_resolution_required';
  end if;
  return new;
end $$;

drop trigger if exists trg_require_fault_report on public.jobs;
create trigger trg_require_fault_report before insert on public.jobs
  for each row execute function public.require_fault_report();

-- The two functions are the database's own business: nobody signed in to the app needs to call them.
revoke all on function public.job_fault_report_missing(text, text, text) from public, anon, authenticated;
grant execute on function public.job_fault_report_missing(text, text, text) to service_role;
revoke all on function public.require_fault_report() from public, anon, authenticated;

notify pgrst, 'reload schema';
