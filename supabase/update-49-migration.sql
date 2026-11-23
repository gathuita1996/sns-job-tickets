-- ============================================================================
-- UPDATE 49 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   1. The subscription now ends on an EXPIRY DATE that an admin can set
--      * Every receipt has an "expires_on" date (Kenya calendar). The customer is Active through the END of that day and
--        Inactive from the next midnight. The app suggests the date (30 days after the payment, or 30 days after the end of
--        what was left when the customer pays early) and the admin can change it before the receipt is sent.
--      * The database still works out "valid_until" (the moment the subscription ends: midnight at the end of the expiry
--        date, Kenya time) itself, so the two can never disagree. A receipt sent without an expiry date (an older copy of
--        the app) gets the payment date + days_covered.
--      * Receipts sent under update 48 (which ran to an exact time of day) are moved to the Kenya date they ended on.
--      * Invoice numbers are kept in capitals (SNS/26/1008), so "sns/26/1008" and "SNS/26/1008" are the same number.
--      * A sent receipt is still never edited. Only the Director deletes one.
--
--   2. Receipts sent through the WhatsApp Business API
--      * "receipt_messages" keeps one row for every message the server hands to WhatsApp for a receipt: who it went to,
--        the id WhatsApp gave it, and how far it got (accepted, sent, delivered, read, or failed with the reason).
--      * Only the server (the Netlify functions, with the service key) writes these rows. Admins can read them. Nobody
--        else can see or change them, and no logged-in user can call the functions that move a message on.
-- ============================================================================

-- ---- 1. the expiry date ---------------------------------------------------------------------------------------------
alter table public.customer_receipts add column if not exists expires_on date;
-- a receipt sent under update 48 ran to an exact moment; it now runs through the Kenya date that moment falls on
update public.customer_receipts
   set expires_on = ((valid_until at time zone 'UTC') + interval '3 hours')::date
 where expires_on is null;
alter table public.customer_receipts alter column expires_on set not null;

-- Tidies what was typed, refuses a payment time that is in the future, and settles the expiry: a date after the payment
-- (and not years away), with valid_until set to midnight at the end of that day in Kenya (UTC+3, no daylight saving).
create or replace function public.customer_receipts_rules()
returns trigger language plpgsql set search_path = public as $$
declare paid_day date;
begin
  new.mpesa_code    := upper(btrim(new.mpesa_code));
  new.receipt_no    := upper(btrim(new.receipt_no));
  new.customer_name := btrim(new.customer_name);
  if new.paid_at > now() + interval '30 minutes' then
    raise exception 'The payment time is in the future';
  end if;
  paid_day := ((new.paid_at at time zone 'UTC') + interval '3 hours')::date;
  if new.expires_on is null then
    new.expires_on := paid_day + new.days_covered;
  end if;
  if new.expires_on <= paid_day then
    raise exception 'The expiry date must be after the payment date';
  end if;
  if new.expires_on > paid_day + 1830 then
    raise exception 'The expiry date is too far after the payment date';
  end if;
  new.valid_until := ((new.expires_on + 1)::timestamp - interval '3 hours') at time zone 'UTC';
  return new;
end $$;
drop trigger if exists trg_customer_receipts_rules on public.customer_receipts;
create trigger trg_customer_receipts_rules before insert on public.customer_receipts
  for each row execute function public.customer_receipts_rules();

-- receipts from update 48: valid_until moves from the exact moment to the end of the expiry date
update public.customer_receipts
   set valid_until = ((expires_on + 1)::timestamp - interval '3 hours') at time zone 'UTC'
 where valid_until is distinct from ((expires_on + 1)::timestamp - interval '3 hours') at time zone 'UTC';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customer_receipts_expiry_after_payment' and conrelid = 'public.customer_receipts'::regclass) then
    alter table public.customer_receipts add constraint customer_receipts_expiry_after_payment
      check (expires_on > ((paid_at at time zone 'UTC') + interval '3 hours')::date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_receipts_expiry_not_far' and conrelid = 'public.customer_receipts'::regclass) then
    alter table public.customer_receipts add constraint customer_receipts_expiry_not_far
      check (expires_on <= ((paid_at at time zone 'UTC') + interval '3 hours')::date + 1830);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_receipts_valid_until_matches' and conrelid = 'public.customer_receipts'::regclass) then
    alter table public.customer_receipts add constraint customer_receipts_valid_until_matches
      check (valid_until = ((expires_on + 1)::timestamp - interval '3 hours') at time zone 'UTC');
  end if;
end $$;

-- ---- 2. receipts sent through the WhatsApp Business API --------------------------------------------------------------------
create table if not exists public.receipt_messages (
  id             uuid primary key default gen_random_uuid(),
  receipt_id     bigint not null references public.customer_receipts(id) on delete cascade,
  channel        text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  recipient      text not null check (btrim(recipient) <> ''),
  template       text,
  wa_message_id  text,
  status         text not null default 'queued' check (status in ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed')),
  error_code     integer,
  error_text     text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  sent_at        timestamptz,
  delivered_at   timestamptz,
  read_at        timestamptz,
  failed_at      timestamptz
);
create unique index if not exists receipt_messages_wamid_key on public.receipt_messages (wa_message_id) where wa_message_id is not null;
create index if not exists receipt_messages_receipt_idx on public.receipt_messages (receipt_id, created_at desc);
create index if not exists receipt_messages_user_idx on public.receipt_messages (created_by, created_at desc);

alter table public.receipt_messages enable row level security;
drop policy if exists "receipt_messages_select_admin" on public.receipt_messages;
create policy "receipt_messages_select_admin" on public.receipt_messages for select using (public.is_admin());
-- there is no insert / update / delete policy: only the server (service key, which skips these rules) writes here
revoke all on public.receipt_messages from anon;
revoke insert, update, delete, truncate on public.receipt_messages from authenticated;

-- Starts a send for a receipt. One call at a time per receipt (so a double press cannot send two messages), a message that
-- was handed over less than a minute ago blocks another, and one person cannot start more than 300 an hour.
create or replace function public.begin_receipt_message(p_receipt_id bigint, p_recipient text, p_user uuid default null, p_channel text default 'whatsapp', p_template text default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(p_receipt_id);
  -- a message nobody ever finished (the server stopped part way) is marked failed so that it cannot block the next try
  update public.receipt_messages
     set status = 'failed', error_text = 'The message was never handed to WhatsApp (the server stopped).', failed_at = now(), updated_at = now()
   where receipt_id = p_receipt_id and status = 'queued' and created_at < now() - interval '2 minutes';
  if exists (select 1 from public.receipt_messages where receipt_id = p_receipt_id and channel = p_channel and status <> 'failed' and created_at > now() - interval '60 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  if p_user is not null and (select count(*) from public.receipt_messages where created_by = p_user and created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into public.receipt_messages (receipt_id, channel, recipient, template, created_by)
  values (p_receipt_id, p_channel, p_recipient, p_template, p_user)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- The server's answer for one message: WhatsApp took it (it gave an id) or refused it (a code and a reason).
create or replace function public.finish_receipt_message(p_id uuid, p_wamid text default null, p_code integer default null, p_text text default null)
returns void language plpgsql set search_path = public as $$
begin
  if p_wamid is not null and btrim(p_wamid) <> '' then
    update public.receipt_messages
       set wa_message_id = btrim(p_wamid),
           status = case when status in ('queued', 'failed') then 'accepted' else status end,
           error_code = null, error_text = null, failed_at = null, updated_at = now()
     where id = p_id;
  else
    update public.receipt_messages
       set status = 'failed', error_code = p_code, error_text = left(p_text, 500), failed_at = now(), updated_at = now()
     where id = p_id and status in ('queued', 'failed');
  end if;
end $$;

-- WhatsApp's later news about a message (sent, delivered, read, failed). The news can arrive in any order and more than once,
-- so a message only ever moves forward: read beats delivered beats sent, a delivered or read message is never "failed", and a
-- message that was wrongly marked failed is put right by a delivered / read. Returns 'applied', 'ignored' or 'unknown'
-- (no such message yet).
create or replace function public.record_whatsapp_status(p_wamid text, p_status text, p_at timestamptz default null, p_code integer default null, p_text text default null)
returns text language plpgsql set search_path = public as $$
declare cur text; rank_cur int; rank_new int; at_ts timestamptz := coalesce(p_at, now());
begin
  if p_wamid is null or btrim(p_wamid) = '' or p_status is null or p_status not in ('sent', 'delivered', 'read', 'failed') then
    return 'ignored';
  end if;
  select status into cur from public.receipt_messages where wa_message_id = p_wamid for update;
  if not found then return 'unknown'; end if;

  if p_status = 'failed' then
    if cur in ('queued', 'accepted', 'sent') then
      update public.receipt_messages
         set status = 'failed', error_code = p_code, error_text = left(p_text, 500), failed_at = at_ts, updated_at = now()
       where wa_message_id = p_wamid;
      return 'applied';
    elsif cur = 'failed' then
      update public.receipt_messages
         set error_code = coalesce(error_code, p_code), error_text = coalesce(error_text, left(p_text, 500)), updated_at = now()
       where wa_message_id = p_wamid;
    end if;
    return 'ignored';
  end if;

  rank_cur := case cur when 'queued' then 0 when 'accepted' then 1 when 'sent' then 2 when 'failed' then 2 when 'delivered' then 3 else 4 end;
  rank_new := case p_status when 'sent' then 2 when 'delivered' then 3 else 4 end;
  if rank_new <= rank_cur then return 'ignored'; end if;
  update public.receipt_messages
     set status = p_status,
         sent_at = coalesce(sent_at, at_ts),
         delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, at_ts) else delivered_at end,
         read_at = case when p_status = 'read' then coalesce(read_at, at_ts) else read_at end,
         error_code = null, error_text = null, failed_at = null,
         updated_at = now()
   where wa_message_id = p_wamid;
  return 'applied';
end $$;

-- no logged-in user (and no visitor) can start, finish or move on a message: only the server's service key can
revoke all on function public.begin_receipt_message(bigint, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_receipt_message(bigint, text, uuid, text, text) to service_role;
revoke all on function public.finish_receipt_message(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.finish_receipt_message(uuid, text, integer, text) to service_role;
revoke all on function public.record_whatsapp_status(text, text, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_status(text, text, timestamptz, integer, text) to service_role;

-- an admin's screen shows a message moving from "sent" to "delivered" to "read" as it happens (RLS still limits it to admins)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'receipt_messages') then
    alter publication supabase_realtime add table public.receipt_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
