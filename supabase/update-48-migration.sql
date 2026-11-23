-- ============================================================================
-- UPDATE 48 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   Receipts for customers, and Active / Inactive customers
--   * Under Customers, an admin opens a customer, presses "Send receipt", pastes the M-Pesa message and sends the
--     receipt to the customer's WhatsApp. Every receipt that is sent is kept here, with the exact date and time of the
--     payment taken from the M-Pesa message.
--   * A customer is ACTIVE while they have a receipt whose 30 days have not run out, and INACTIVE otherwise (or if no
--     receipt was ever sent). The 30 days count from the moment of the payment. The database works out the end date
--     ("valid_until") itself when the receipt is saved, so it cannot be set wrongly from the screen. The Active /
--     Inactive status is worked out from these rows every time it is shown, so nobody has to switch it on or off.
--
--   Who may do what
--   * Only admins can see receipts and send them. Staff who are not admins see nothing.
--   * A receipt can never be changed after it is sent (there is no edit). A mistake is put right by deleting the
--     receipt and sending a new one, and ONLY THE DIRECTOR can delete a receipt.
--   * One M-Pesa payment can only ever have one receipt, and an invoice number can only be used once, so pasting the
--     same message twice cannot switch a customer on twice or double a record.
--   * A receipt stays on record if its customer is later deleted (it is just no longer linked to anyone).
--
--   The receipt PDF is kept in a new storage folder, "customer-receipts", under a long random name, so the link sent
--   on WhatsApp opens for the customer without a login but cannot be guessed. Only admins can add files to it, and a
--   file can only be removed once no receipt uses it.
-- ============================================================================

-- ---- 1. the receipts ----------------------------------------------------------------------------------------
create table if not exists public.customer_receipts (
  id                bigint generated always as identity primary key,
  customer_id       bigint references public.customers(id) on delete set null,
  customer_name     text not null,
  customer_contact  text,
  receipt_no        text not null,
  mpesa_code        text not null,
  amount            numeric(12, 2) not null check (amount > 0),
  paid_at           timestamptz not null,
  days_covered      integer not null default 30 check (days_covered between 1 and 366),
  valid_until       timestamptz not null,
  payer_name        text,
  account_ref       text,
  mpesa_message     text,
  file_path         text,
  sent_via          text not null default 'whatsapp' check (sent_via in ('whatsapp', 'email')),
  sent_by           uuid default auth.uid() references public.profiles(id) on delete set null,
  sent_at           timestamptz not null default now(),
  constraint customer_receipts_no_filled check (btrim(receipt_no) <> ''),
  constraint customer_receipts_code_format check (mpesa_code ~ '^[A-Z0-9]{6,20}$')
);
create unique index if not exists customer_receipts_mpesa_code_key on public.customer_receipts (mpesa_code);
create unique index if not exists customer_receipts_receipt_no_key on public.customer_receipts (receipt_no);
create index if not exists customer_receipts_customer_idx on public.customer_receipts (customer_id, paid_at desc);

-- Tidies what was typed, refuses a payment time that is in the future, and works out when the 30 days end:
-- exactly days_covered x 24 hours after the payment, whatever time zone the database is set to.
create or replace function public.customer_receipts_rules()
returns trigger language plpgsql set search_path = public as $$
begin
  new.mpesa_code    := upper(btrim(new.mpesa_code));
  new.receipt_no    := btrim(new.receipt_no);
  new.customer_name := btrim(new.customer_name);
  if new.paid_at > now() + interval '30 minutes' then
    raise exception 'The payment time is in the future';
  end if;
  new.valid_until := new.paid_at + make_interval(hours => new.days_covered * 24);
  return new;
end $$;
drop trigger if exists trg_customer_receipts_rules on public.customer_receipts;
create trigger trg_customer_receipts_rules before insert on public.customer_receipts
  for each row execute function public.customer_receipts_rules();

alter table public.customer_receipts enable row level security;
drop policy if exists "receipts_select_admin" on public.customer_receipts;
create policy "receipts_select_admin" on public.customer_receipts for select using (public.is_admin());
drop policy if exists "receipts_insert_admin" on public.customer_receipts;
create policy "receipts_insert_admin" on public.customer_receipts for insert with check (public.is_admin());
drop policy if exists "receipts_delete_director" on public.customer_receipts;
create policy "receipts_delete_director" on public.customer_receipts for delete using (public.is_director());
-- there is deliberately no update policy: a sent receipt is never edited
revoke all on public.customer_receipts from anon;
revoke update, truncate on public.customer_receipts from authenticated;

-- an admin's screen updates the moment another admin sends a receipt (RLS still limits it to admins)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_receipts') then
    alter publication supabase_realtime add table public.customer_receipts;
  end if;
end $$;

-- ---- 2. where the receipt PDFs are kept -------------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('customer-receipts', 'customer-receipts', true, 1048576, array['application/pdf'])
    on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['application/pdf'];
  end if;
end $$;

drop policy if exists "customer_receipts_files_insert_admin" on storage.objects;
create policy "customer_receipts_files_insert_admin" on storage.objects for insert
  with check (bucket_id = 'customer-receipts' and public.is_admin());
drop policy if exists "customer_receipts_files_select_admin" on storage.objects;
create policy "customer_receipts_files_select_admin" on storage.objects for select
  using (bucket_id = 'customer-receipts' and public.is_admin());
-- A file can be removed only when no receipt points at it any more: when a receipt could not be saved, or after the
-- Director has deleted the receipt. A receipt that is still on record can never lose its PDF.
drop policy if exists "customer_receipts_files_delete_unused" on storage.objects;
create policy "customer_receipts_files_delete_unused" on storage.objects for delete
  using (bucket_id = 'customer-receipts' and public.is_admin()
         and not exists (select 1 from public.customer_receipts r where r.file_path = objects.name));

notify pgrst, 'reload schema';
