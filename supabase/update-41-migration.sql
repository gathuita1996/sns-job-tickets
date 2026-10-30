-- ============================================================================
-- UPDATE 41 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   A retrieved router adds to the stock list the moment it is recorded.
--   * recording one          -> a Stock In of 1 (marked "Retrieved from <customer>", cost KSh 0)
--   * correcting one         -> the Stock In follows (date, customer, which router)
--   * marking it Written off -> a Stock Out of 1 (and it comes back if you change your mind)
--   * deleting the record    -> its Stock In (and any write-off) is removed
--   Re-issuing a router to a new customer is still an ordinary Stock Out, so it shows in the ONU / Router log.
--   Technicians cannot read or write stock themselves; the database does this for them, and only for router items.
-- ============================================================================

alter table public.retrieved_routers add column if not exists stock_item_id bigint references public.stock_items(id) on delete set null;
-- plain links (no foreign key): the trigger below removes these rows itself, and a key would fight it
alter table public.retrieved_routers add column if not exists stock_in_id bigint;
alter table public.retrieved_routers add column if not exists writeoff_stock_out_id bigint;
create index if not exists retrieved_routers_item_idx on public.retrieved_routers (stock_item_id);

-- the router items a technician can choose from (they cannot read the stock list itself)
create or replace function public.device_items()
returns table (id bigint, item_name text) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_technical_or_admin() then raise exception 'Not allowed'; end if;
  return query select i.id, i.item_name from public.stock_items i where i.is_device order by i.item_name;
end $$;
revoke all on function public.device_items() from public, anon;
grant execute on function public.device_items() to authenticated;

create or replace function public.retrieved_routers_stock_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid bigint; oid bigint; who text; label text;
begin
  if tg_op = 'DELETE' then
    if old.stock_in_id is not null then delete from public.stock_in where id = old.stock_in_id; end if;
    if old.writeoff_stock_out_id is not null then delete from public.stock_out where id = old.writeoff_stock_out_id; end if;
    return old;
  end if;

  -- nobody but the database decides which stock rows belong to a retrieved router
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then new.stock_in_id := null; new.writeoff_stock_out_id := null;
    else new.stock_in_id := old.stock_in_id; new.writeoff_stock_out_id := old.writeoff_stock_out_id; end if;
  end if;

  if new.stock_item_id is not null and not exists (select 1 from public.stock_items where id = new.stock_item_id and is_device) then
    raise exception 'That item is not a router in the stock list';
  end if;

  select full_name into who from public.profiles where id = coalesce(new.retrieved_by, new.recorded_by);
  label := 'Retrieved from ' || new.customer_name;

  -- 1. the Stock In
  if new.stock_item_id is not null then
    if new.stock_in_id is not null and exists (select 1 from public.stock_in where id = new.stock_in_id) then
      update public.stock_in set item_id = new.stock_item_id, purchase_date = new.retrieved_date, supplier = label, received_by = coalesce(who, '')
        where id = new.stock_in_id
          and (item_id, purchase_date, supplier, received_by) is distinct from (new.stock_item_id, new.retrieved_date, label, coalesce(who, ''));
    else
      insert into public.stock_in (item_id, purchase_date, quantity, unit_cost, supplier, invoice_no, received_by, recorded_by)
      values (new.stock_item_id, new.retrieved_date, 1, 0, label, 'RETRIEVED', coalesce(who, ''), new.recorded_by)
      returning id into sid;
      new.stock_in_id := sid;
    end if;
  elsif tg_op = 'UPDATE' and old.stock_in_id is not null then
    delete from public.stock_in where id = old.stock_in_id;
    new.stock_in_id := null;
  end if;

  -- 2. written off: the router leaves the store, and returns if the status is changed back
  if tg_op = 'UPDATE' then
    if new.status = 'written_off' and old.status is distinct from 'written_off' and new.stock_item_id is not null then
      insert into public.stock_out (item_id, issue_date, quantity, issued_to, purpose, reference_no, recorded_by)
      values (new.stock_item_id, current_date, 1, 'Written off',
              'Retrieved router written off' || coalesce(': ' || nullif(btrim(new.status_note), ''), ''), 'RETRIEVED-' || new.id, coalesce(auth.uid(), new.recorded_by))
      returning id into oid;
      new.writeoff_stock_out_id := oid;
    elsif new.status is distinct from 'written_off' and old.status = 'written_off' and old.writeoff_stock_out_id is not null then
      delete from public.stock_out where id = old.writeoff_stock_out_id;
      new.writeoff_stock_out_id := null;
    end if;
  end if;
  return new;
end $$;

-- named so it runs after the existing rules trigger (alphabetical order)
drop trigger if exists trg_retrieved_routers_stock on public.retrieved_routers;
create trigger trg_retrieved_routers_stock before insert or update on public.retrieved_routers
  for each row execute function public.retrieved_routers_stock_sync();
drop trigger if exists trg_retrieved_routers_stock_del on public.retrieved_routers;
create trigger trg_retrieved_routers_stock_del after delete on public.retrieved_routers
  for each row execute function public.retrieved_routers_stock_sync();

notify pgrst, 'reload schema';
