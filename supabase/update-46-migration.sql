-- ============================================================================
-- UPDATE 46 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   Retrieved routers and the stock list
--   * A retrieved router counts in the current stock ONLY while it is in working condition and in the store.
--     Faulty and damaged routers never count. Neither does a router that is under repair, re-issued or written off.
--   * Changing a router from working to faulty or damaged takes it off the stock list; marking a repaired one
--     as working puts it back. The database does this by itself, whoever makes the change.
--   * A retrieved working router can be used again in a new installation (or a replacement):
--     issue_retrieved_router() records the Stock Out and marks the router Re-issued in one step,
--     and undo_router_reissue() reverses it if it was a mistake.
--   * Records made under updates 41 to 45 are put right: faulty, damaged and under-repair routers that were
--     counted are taken off the stock list. Working routers that were never linked to a stock item are NOT
--     guessed at here; the Retrieved Routers tab lists them so you can link each one yourself.
-- ============================================================================

-- the Stock Out that took a re-issued router out of the store (a plain link: the code below keeps it in step)
alter table public.retrieved_routers add column if not exists reissue_stock_out_id bigint;

create or replace function public.retrieved_routers_stock_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid bigint; oid bigint; who text; label text; newdate date;
  has_in boolean; has_wo boolean; has_re boolean; counts boolean;
begin
  if tg_op = 'DELETE' then
    -- a re-issued router has left the store: its Stock In and Stock Out are history, so they stay
    if old.status is distinct from 'reissued' then
      if old.stock_in_id is not null then delete from public.stock_in where id = old.stock_in_id; end if;
      if old.writeoff_stock_out_id is not null then delete from public.stock_out where id = old.writeoff_stock_out_id; end if;
    end if;
    return old;
  end if;

  -- nobody but the database decides which stock rows belong to a retrieved router
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.stock_in_id := null; new.writeoff_stock_out_id := null; new.reissue_stock_out_id := null;
    else
      new.stock_in_id := old.stock_in_id; new.writeoff_stock_out_id := old.writeoff_stock_out_id; new.reissue_stock_out_id := old.reissue_stock_out_id;
    end if;
  end if;

  if new.stock_item_id is not null and (tg_op = 'INSERT' or new.stock_item_id is distinct from old.stock_item_id)
     and not exists (select 1 from public.stock_items where id = new.stock_item_id and is_device) then
    raise exception 'That item is not a router in the stock list';
  end if;

  -- a router that was handed to a customer from the stock list is not un-issued by editing the record
  if tg_op = 'UPDATE' and old.status = 'reissued' and new.status is distinct from 'reissued'
     and old.reissue_stock_out_id is not null and exists (select 1 from public.stock_out where id = old.reissue_stock_out_id) then
    raise exception 'This router was issued to a customer from the stock list. Use "Undo re-issue" instead.';
  end if;

  select full_name into who from public.profiles where id = coalesce(new.retrieved_by, new.recorded_by);
  label := 'Retrieved from ' || new.customer_name;

  has_in := new.stock_in_id is not null and exists (select 1 from public.stock_in where id = new.stock_in_id);
  has_wo := new.writeoff_stock_out_id is not null and exists (select 1 from public.stock_out where id = new.writeoff_stock_out_id);
  has_re := new.reissue_stock_out_id is not null and exists (select 1 from public.stock_out where id = new.reissue_stock_out_id);

  -- THE RULE: it counts in the stock list only when it is linked to a stock item, in working condition, and in the store
  counts := new.stock_item_id is not null and new.condition = 'working' and new.status = 'in_store';

  if counts then
    if has_wo then delete from public.stock_out where id = new.writeoff_stock_out_id; end if;   -- back in the store: the write-off is undone
    new.writeoff_stock_out_id := null;
    if has_in then
      newdate := case when tg_op = 'UPDATE' and new.retrieved_date is distinct from old.retrieved_date then new.retrieved_date end;
      update public.stock_in set item_id = new.stock_item_id, supplier = label, received_by = coalesce(who, ''), purchase_date = coalesce(newdate, purchase_date)
        where id = new.stock_in_id
          and (item_id, supplier, received_by, purchase_date) is distinct from (new.stock_item_id, label, coalesce(who, ''), coalesce(newdate, purchase_date));
    else
      -- a router made working again (repaired) joins the stock on that day; a plain correction keeps the retrieval date
      newdate := case when tg_op = 'UPDATE' and (old.condition is distinct from new.condition or old.status is distinct from new.status) then current_date else new.retrieved_date end;
      insert into public.stock_in (item_id, purchase_date, quantity, unit_cost, supplier, invoice_no, received_by, recorded_by)
      values (new.stock_item_id, newdate, 1, 0, label, 'RETRIEVED', coalesce(who, ''), new.recorded_by)
      returning id into sid;
      new.stock_in_id := sid;
    end if;

  elsif new.status = 'written_off' then
    -- thrown away: a counted router leaves the stock list through a write-off (its Stock In stays as history)
    if has_in and not has_wo and tg_op = 'UPDATE' and old.status is distinct from 'written_off' and new.stock_item_id is not null then
      insert into public.stock_out (item_id, issue_date, quantity, issued_to, purpose, reference_no, recorded_by)
      values (new.stock_item_id, current_date, 1, 'Written off',
              'Retrieved router written off' || coalesce(': ' || nullif(btrim(new.status_note), ''), ''), 'RETRIEVED-' || new.id, coalesce(auth.uid(), new.recorded_by))
      returning id into oid;
      new.writeoff_stock_out_id := oid;
    end if;

  elsif new.status = 'reissued' then
    -- given out again. issue_retrieved_router() records the Stock Out itself; a status set by hand gets one here
    if has_in and not has_re and tg_op = 'UPDATE' and old.status is distinct from 'reissued' and new.stock_item_id is not null then
      insert into public.stock_out (item_id, issue_date, quantity, issued_to, purpose, reference_no, recorded_by)
      values (new.stock_item_id, current_date, 1, 'Re-issued',
              'Retrieved router re-issued' || coalesce(': ' || nullif(btrim(new.status_note), ''), ''), 'RETRIEVED-' || new.id, coalesce(auth.uid(), new.recorded_by))
      returning id into oid;
      new.reissue_stock_out_id := oid;
    end if;

  else
    -- in the store but not usable (faulty, damaged, under repair), or not linked to a stock item: it does not count
    if has_wo then delete from public.stock_out where id = new.writeoff_stock_out_id; end if;
    new.writeoff_stock_out_id := null;
    if has_in then delete from public.stock_in where id = new.stock_in_id; end if;
    new.stock_in_id := null;
  end if;
  return new;
end $$;

-- deleting a router that was issued to a customer would leave that issue without its Stock In: undo the re-issue first
create or replace function public.retrieved_routers_guard_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'reissued' and old.reissue_stock_out_id is not null
     and exists (select 1 from public.stock_out where id = old.reissue_stock_out_id) then
    raise exception 'This router was issued to a customer from the stock list. Use "Undo re-issue" first, then delete the record.';
  end if;
  return old;
end $$;

drop trigger if exists trg_retrieved_routers_stock on public.retrieved_routers;
create trigger trg_retrieved_routers_stock before insert or update on public.retrieved_routers
  for each row execute function public.retrieved_routers_stock_sync();
drop trigger if exists trg_retrieved_routers_stock_del on public.retrieved_routers;
create trigger trg_retrieved_routers_stock_del after delete on public.retrieved_routers
  for each row execute function public.retrieved_routers_stock_sync();
drop trigger if exists trg_retrieved_routers_guard_del on public.retrieved_routers;
create trigger trg_retrieved_routers_guard_del before delete on public.retrieved_routers
  for each row execute function public.retrieved_routers_guard_delete();

-- Use a retrieved working router in a new installation (or a replacement): one step, all or nothing.
create or replace function public.issue_retrieved_router(
  p_router bigint, p_issue_date date, p_install_type text, p_customer bigint,
  p_issued_to text, p_purpose text, p_reference text, p_issued_by text)
returns bigint language plpgsql security definer set search_path = public as $$
declare r public.retrieved_routers; oid bigint; who text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Only an admin can issue a router from the stock list'; end if;
  if p_install_type is null or p_install_type not in ('new_installation', 'replacement') then raise exception 'Choose new installation or replacement'; end if;
  select * into r from public.retrieved_routers where id = p_router for update;
  if not found then raise exception 'That retrieved router was not found'; end if;
  if r.stock_item_id is null or r.condition <> 'working' or r.status <> 'in_store'
     or r.stock_in_id is null or not exists (select 1 from public.stock_in where id = r.stock_in_id) then
    raise exception 'Only a working retrieved router that is in the store and counted in the stock list can be issued';
  end if;
  if p_install_type = 'replacement' and p_customer is null then raise exception 'A replacement must record the customer the device was replaced for.'; end if;

  insert into public.stock_out (item_id, issue_date, quantity, install_type, customer_id, device_serial, issued_to, purpose, reference_no, issued_by, recorded_by)
  values (r.stock_item_id, coalesce(p_issue_date, current_date), 1, p_install_type, p_customer, nullif(btrim(coalesce(r.serial_number, '')), ''),
          nullif(btrim(coalesce(p_issued_to, '')), ''), coalesce(nullif(btrim(coalesce(p_purpose, '')), ''), 'Retrieved router used again'),
          nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_issued_by, '')), ''), auth.uid())
  returning id into oid;

  select btrim(c.first_name || ' ' || c.last_name) into who from public.customers c where c.id = p_customer;
  update public.retrieved_routers
     set status = 'reissued', reissue_stock_out_id = oid,
         status_note = 'Used again in ' || case p_install_type when 'new_installation' then 'a new installation' else 'a replacement' end || coalesce(' for ' || who, '')
   where id = r.id;
  return oid;
end $$;
revoke all on function public.issue_retrieved_router(bigint, date, text, bigint, text, text, text, text) from public, anon;
grant execute on function public.issue_retrieved_router(bigint, date, text, bigint, text, text, text, text) to authenticated;

-- Reverse a re-issue made by mistake: the Stock Out is removed and the router is back in the store.
create or replace function public.undo_router_reissue(p_router bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retrieved_routers;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Only an admin can undo a re-issue'; end if;
  select * into r from public.retrieved_routers where id = p_router for update;
  if not found then raise exception 'That retrieved router was not found'; end if;
  if r.status <> 'reissued' then raise exception 'That router has not been re-issued'; end if;
  if r.reissue_stock_out_id is not null then delete from public.stock_out where id = r.reissue_stock_out_id; end if;
  update public.retrieved_routers set status = 'in_store', status_note = null, reissue_stock_out_id = null where id = r.id;
end $$;
revoke all on function public.undo_router_reissue(bigint) from public, anon;
grant execute on function public.undo_router_reissue(bigint) to authenticated;

-- ---- put the existing records right -----------------------------------------------------------------------
do $$
declare n_off int; n_pair int; n_legacy int; n_unlinked int; n_resync int;
begin
  -- 1. in the store or under repair, but not working (or not linked): it must not be counted
  with bad as (
    select id, stock_in_id from public.retrieved_routers
     where status in ('in_store', 'under_repair') and stock_in_id is not null
       and not (condition = 'working' and status = 'in_store' and stock_item_id is not null)
  ), gone as (
    delete from public.stock_in s using bad where s.id = bad.stock_in_id and s.invoice_no = 'RETRIEVED' returning s.id
  )
  select count(*) into n_off from gone;
  update public.retrieved_routers set stock_in_id = null
   where status in ('in_store', 'under_repair') and stock_in_id is not null
     and not (condition = 'working' and status = 'in_store' and stock_item_id is not null);

  -- 2. written off: a faulty or damaged one never counted, so its "in" and "out" pair is simply removed (it nets to nothing);
  --    a written-off router that was counted but never taken out loses its Stock In (it is not in the store)
  with pair as (
    select id, stock_in_id, writeoff_stock_out_id from public.retrieved_routers
     where status = 'written_off' and stock_in_id is not null
       and (condition <> 'working' or writeoff_stock_out_id is null or not exists (select 1 from public.stock_out o where o.id = writeoff_stock_out_id))
  ), g1 as (
    delete from public.stock_in s using pair where s.id = pair.stock_in_id and s.invoice_no = 'RETRIEVED' returning s.id
  ), g2 as (
    delete from public.stock_out o using pair where o.id = pair.writeoff_stock_out_id and o.reference_no like 'RETRIEVED-%' returning o.id
  )
  select (select count(*) from g1) into n_pair;
  update public.retrieved_routers set stock_in_id = null, writeoff_stock_out_id = null
   where status = 'written_off' and stock_in_id is not null
     and (condition <> 'working' or writeoff_stock_out_id is null or not exists (select 1 from public.stock_out o where o.id = writeoff_stock_out_id));

  -- 3. working routers in the store that should be counted but have no Stock In: the database adds it now
  select count(*) into n_resync from public.retrieved_routers r
   where r.status = 'in_store' and r.condition = 'working' and r.stock_item_id is not null
     and (r.stock_in_id is null or not exists (select 1 from public.stock_in s where s.id = r.stock_in_id));
  update public.retrieved_routers set condition = condition
   where status = 'in_store' and condition = 'working' and stock_item_id is not null;

  -- 4. things we cannot decide for you
  select count(*) into n_legacy from public.retrieved_routers where status = 'reissued' and reissue_stock_out_id is null and stock_in_id is not null;
  select count(*) into n_unlinked from public.retrieved_routers where stock_item_id is null and condition = 'working' and status = 'in_store';
  raise notice 'Update 46: % faulty/damaged/under-repair router(s) taken off the stock list, % written-off pair(s) cleaned up, % working router(s) added.', n_off, n_pair, n_resync;
  if n_legacy > 0 then raise notice 'Update 46: % router(s) marked Re-issued under the old rules were left exactly as they were (their stock follows whatever Stock Out you recorded).', n_legacy; end if;
  if n_unlinked > 0 then raise notice 'Update 46: % working router(s) are not linked to a stock item, so they are not in the stock count. Link them from Stock > Retrieved Routers.', n_unlinked; end if;
end $$;

notify pgrst, 'reload schema';
