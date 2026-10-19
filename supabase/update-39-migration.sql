-- =============================================================================
-- SNS Job Cards -- UPDATE 39.  Run once in the SQL editor of your live project (safe to re-run).
--   Site surveys record the GPS location where the survey was done.
-- =============================================================================
-- Site surveys record where they were done (the phone's GPS position).
alter table public.jobs add column if not exists gps_lat numeric(9,6);
alter table public.jobs add column if not exists gps_lng numeric(9,6);
alter table public.jobs add column if not exists gps_accuracy numeric(8,1);     -- metres
alter table public.jobs add column if not exists gps_recorded_at timestamptz;

-- Both coordinates or neither, and real ones (latitude -90..90, longitude -180..180).
alter table public.jobs drop constraint if exists jobs_gps_check;
alter table public.jobs add constraint jobs_gps_check check (
  (gps_lat is null) = (gps_lng is null)
  and (gps_lat is null or (gps_lat between -90 and 90 and gps_lng between -180 and 180))
);

-- A member cannot file a site survey without a location, even by bypassing the app. An admin handing a survey
-- to someone is not at the site, and the SQL editor (no signed-in user) is left alone so data can be corrected.
create or replace function public.require_site_survey_gps()
returns trigger language plpgsql as $$
begin
  if new.job_type = 'Site Survey' and (new.gps_lat is null or new.gps_lng is null)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'A site survey needs a GPS location.';
  end if;
  return new;
end $$;
drop trigger if exists trg_require_site_survey_gps on public.jobs;
create trigger trg_require_site_survey_gps before insert on public.jobs
  for each row execute function public.require_site_survey_gps();
