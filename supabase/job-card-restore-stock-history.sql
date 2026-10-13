-- =============================================================================
-- SNS Job Cards -- restore the stock movements recorded up to 26 Sept 2026.
-- Run ONCE, after the first admin has signed up in the rebuilt system.
-- =============================================================================
do $$ begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Create the first admin account in the app first, then run this file.';
  end if;
  if exists (select 1 from public.stock_in) or exists (select 1 from public.stock_out) then
    raise exception 'Stock movements already exist. This is a one-time restore and would duplicate them.';
  end if;
end $$;

insert into public.stock_in (item_id, purchase_date, quantity, unit_cost, supplier, invoice_no, received_by, recorded_by) values
  ((select id from public.stock_items where item_name = 'Drop Cable 1KM'), '2026-08-01', 1, 8500, 'Data Connect Technology', 'INV-1023', 'John K.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-08', 7, 1300, 'Data Connect Technology', null, 'Muthama G.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'CAT 6 Indoor'), '2026-08-08', 2, 3700, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'POE 48V'), '2026-08-08', 7, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'POE 24V'), '2026-08-08', 3, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Adapter'), '2026-08-08', 13, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Router (ONU)'), '2026-08-08', 7, 1500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Cable Tester'), '2026-08-08', 1, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Strap'), '2026-08-08', 2, 2300, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'TP Link'), '2026-08-08', 2, 1850, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Tensioner PA 1500'), '2026-08-08', 9, 300, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Hose clamp'), '2026-08-08', 8, 15, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Splitters 1x4'), '2026-08-08', 5, 200, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Splitters 1x8'), '2026-08-08', 17, 300, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Splitters 1x16'), '2026-08-08', 14, 400, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'RJ 45'), '2026-08-08', 2, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Cable tie'), '2026-08-08', 5, 200, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'UPBS'), '2026-08-08', 3, 250, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Dome Closure 48 core'), '2026-08-08', 3, 500, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Ruijies 6202G'), '2026-08-08', 1, 10000, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Ruijies 620D'), '2026-08-08', 1, 10000, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'ATBS'), '2026-08-08', 8, 50, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Patch Cords (SC-SC)'), '2026-08-08', 3, 130, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'J hook small'), '2026-08-08', 12, 250, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Buckles'), '2026-08-08', 63, 15, 'Data Connect Technology', null, null, (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-09-26', 7, 1300, 'Data Connect Technology', null, 'Muthama G.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1));

insert into public.stock_out (item_id, issue_date, quantity, issued_to, purpose, reference_no, issued_by, recorded_by) values
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-08', 2, 'ukunda/kona chifu - langat', 'Site installation', 'JOB-045', 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-10', 1, 'kona beach-Langat', 'Site installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-11', 2, 'Hassan', 'Site installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-12', 2, 'Hassan', 'Site installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Splitters 1x4'), '2026-08-12', 1, 'Langat', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Splitters 1x8'), '2026-08-12', 1, 'Langat', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Patch Cords (SC-SC)'), '2026-08-12', 1, 'Langat', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'ATBS'), '2026-08-12', 1, 'Langat', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-09-26', 1, 'Hassan', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'ATBS'), '2026-08-20', 2, 'Hassan–Msikiti nuru', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-20', 1, 'Hassan–mskiti nuru', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'Patch Cords (SC-SC)'), '2026-08-20', 1, 'Hassan', 'installation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1)),
  ((select id from public.stock_items where item_name = 'XPON Router'), '2026-08-24', 1, 'LANGAT', 'INSTAllation', null, 'REHEMA M.', (select id from public.profiles where role = 'admin' order by created_at asc limit 1));
