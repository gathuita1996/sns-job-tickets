-- ============================================================================
-- UPDATE 52 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   A job card says what the customer reported and how it was solved
--      * Two new columns on jobs: reported_fault (what the customer reported) and resolution (how it was solved). Both are
--        plain text and empty for every job that exists today. Nothing in an existing job changes: "Job details" that were
--        already written stay exactly where they are.
--      * New Installation and Site Survey keep "Job details". Every other job type (Network Troubleshooting, Router /
--        Equipment Repair, Routine Maintenance, Fibre / Cable Repair, Equipment Upgrade, Other) asks for the two new things
--        instead, and they are required. public.job_fault_report_missing(job type, fault, resolution) says which of the two is
--        empty for a job type, as a list of names (an empty list when nothing is missing, and always for the two types above).
--        "Empty" means nothing but spaces, tabs and line breaks, the same as the profile check of Update 50.
--      * A trigger on jobs stops a member from filing a NEW job of one of those types when either is empty, with the message
--        "Please describe the reported fault and how it was solved." (hint: fault_resolution_required). It protects the
--        screen's own check, so an out-of-date copy of the app, or anything else that talks to the database, cannot get
--        round it.
--      * Admins are not held to it, and neither are the server's own key or the SQL editor (nobody is signed in there). An
--        admin can still hand a member a job with guidance only.
--      * Only filing a NEW job is held back. Editing, completing or deleting a job a member already has is not.
--
--   The same list of job types is in the app (src/lib/faultReport.js). A test fails if the two ever differ.
--
--   The rest of Update 52 (the Director's 5:31 pm email, Custom mode, two cards removed from the members' portal) needs
--   nothing in the database.
-- ============================================================================

-- ---- 1. the two new columns -----------------------------------------------------------------------------------------
alter table public.jobs add column if not exists reported_fault text;
alter table public.jobs add column if not exists resolution     text;

-- ---- 2. which of the two is empty for this job type -----------------------------------------------------------------
-- Returns the names, in this order: {} | {reported_fault} | {resolution} | {reported_fault,resolution}.
create or replace function public.job_fault_report_missing(p_job_type text, p_fault text, p_resolution text)
returns text[] language sql immutable as $$
  select case
    when p_job_type in ('New Installation', 'Site Survey') then array[]::text[]
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
