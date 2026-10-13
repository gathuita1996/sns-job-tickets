-- =============================================================================
-- SNS Job Cards -- UPDATE 35.  Run once in the SQL editor of your live project (safe to re-run).
--   1. XPON router / ONU: record "new installation" or "replacement" (with the customer)
--   2. Field visits for the Sales & Marketing team
--   3. Backup and restore support
--   4. Remove "Pigtails" from the item list
-- =============================================================================

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

-- 4. Remove "Pigtails" from the item list (any stock movements recorded against it go with it) -----------
delete from public.stock_out where item_id in (select id from public.stock_items where item_name ilike 'pigtail%');
delete from public.stock_in  where item_id in (select id from public.stock_items where item_name ilike 'pigtail%');
delete from public.stock_items where item_name ilike 'pigtail%';
