-- Koobi 0700: money. Payments and the hold (§4.7, §8.3), provider webhook events (§9.7),
-- the double-entry append-only ledger (§4.8), payouts (§4.9), refunds, reconciliation runs.
-- KES inside, USD at the edge (§6.4 rule 7): only payments carry charge_currency/charge_amount.

create type public.payment_status as enum ('initiated', 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'charged_back');
create type public.hold_status as enum ('held', 'released', 'credited', 'refunded', 'clawback');
create type public.payout_status as enum ('pending_approval', 'approved', 'excluded', 'sending', 'sent', 'failed', 'parked', 'cancelled');
create type public.ledger_side as enum ('debit', 'credit');
create type public.ledger_account as enum (
  'cash_provider', 'client_funds_held', 'guardian_credits', 'teacher_payable', 'withholding_payable', 'vat_payable',
  'revenue_commission', 'revenue_managed_plan', 'revenue_teacher_pro', 'expense_payment_fees', 'expense_payout_fees',
  'expense_trial_subsidy', 'expense_verification', 'fx_difference', 'refunds_out', 'adjustments');

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  payer_user_id     uuid not null default auth.uid() references public.profiles (id),
  booking_id        uuid references public.bookings (id),
  package_id        uuid references public.packages (id),
  provider          text not null default 'paystack' check (provider in ('paystack', 'intasend', 'flutterwave', 'daraja')),
  method            text not null default 'mpesa_stk' check (method in ('mpesa_stk', 'card', 'payment_link')),
  -- idempotency key and provider reference (§6.4 rule 2)
  platform_ref      text not null unique default ('KB' || to_char(now() at time zone 'UTC', 'YYMMDD') || '-'
                      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  provider_ref      text,
  amount_kes        integer not null check (amount_kes > 0),  -- KES list price held
  fee_kes           integer not null default 0 check (fee_kes >= 0),
  discount_kes      integer not null default 0 check (discount_kes >= 0),
  charge_currency   text not null default 'KES' check (charge_currency in ('KES', 'USD')),
  charge_amount     numeric(12, 2) check (charge_amount > 0),  -- what the payer saw, in charge_currency
  settled_kes       integer check (settled_kes >= 0),
  reference_rate    numeric(14, 6) check (reference_rate > 0),
  fx_difference_kes integer,
  payer_country     text check (payer_country ~ '^[A-Z]{2}$'),
  status            public.payment_status not null default 'initiated',
  hold_status       public.hold_status,
  failure_reason    text,
  succeeded_at      timestamptz,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint payments_one_target check (num_nonnulls(booking_id, package_id) = 1),
  constraint payments_usd_amount check (charge_currency = 'KES' or charge_amount is not null),
  constraint payments_provider_ref_unique unique (provider, provider_ref)
);
create unique index payments_one_success_per_booking on public.payments (booking_id) where status = 'succeeded' and booking_id is not null;
create unique index payments_one_success_per_package on public.payments (package_id) where status = 'succeeded' and package_id is not null;
create index payments_payer_idx on public.payments (payer_user_id, created_at desc);

-- The amount held is the server price, never a client value.
create or replace function private.payment_amount(p_booking uuid, p_package uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.price_kes - b.discount_kes from public.bookings b where b.id = p_booking and b.status = 'awaiting_payment'),
    (select p.price_kes from public.packages p where p.id = p_package and p.status = 'pending_payment'))
$$;

create or replace function private.payments_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_system() then
    return new;
  end if;
  new.amount_kes := private.payment_amount(new.booking_id, new.package_id);
  if new.amount_kes is null or new.amount_kes <= 0 then
    raise exception 'nothing to pay: the booking must be awaiting payment or the package pending payment'
      using errcode = 'check_violation';
  end if;
  new.payer_user_id := auth.uid();
  new.fee_kes := 0;
  new.discount_kes := 0;
  return new;
end
$$;

create or replace function private.stamp_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'succeeded' and old.status is distinct from 'succeeded' then
    new.succeeded_at := coalesce(new.succeeded_at, now());
  end if;
  return new;
end
$$;

create trigger payments_05_amount before insert on public.payments
  for each row execute function private.payments_amount();
create trigger payments_10_transition before insert or update of status on public.payments
  for each row execute function private.enforce_transition('payment', 'status');
create trigger payments_11_hold_transition before insert or update of hold_status on public.payments
  for each row execute function private.enforce_transition('payment_hold', 'hold_status');
create trigger payments_20_stamp before update of status on public.payments
  for each row execute function private.stamp_payment();
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Provider events: raw webhook storage and deduplication (§9.7 rules 1-6)
-- ---------------------------------------------------------------------------
create table public.provider_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('paystack', 'intasend', 'flutterwave', 'daraja', 'smile_id', 'didit',
                                                     'youverify', 'africas_talking', 'whatsapp', 'resend')),
  event_id        text not null,  -- vendor event id, or sha256 of the raw body when the vendor has none
  event_type      text,
  raw_body        text not null,
  headers         jsonb not null default '{}',
  signature_valid boolean,
  status          text not null default 'received' check (status in ('received', 'processing', 'processed', 'ignored', 'parked', 'failed')),
  attempts        integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error      text,
  payment_id      uuid references public.payments (id),
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  constraint provider_events_dedupe unique (provider, event_id)
);
create index provider_events_pending_idx on public.provider_events (received_at) where status in ('received', 'failed');
create trigger provider_events_updated_at before update on public.provider_events
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ledger (§4.8). Double-entry: every journal (ledger_transactions row) balances, checked at commit.
-- Append-only: no UPDATE or DELETE, corrections are reversing journals under dual control.
-- ---------------------------------------------------------------------------
create table public.ledger_accounts (
  code         public.ledger_account primary key,
  account_type text not null check (account_type in ('asset', 'liability', 'revenue', 'expense', 'contra_revenue', 'mixed')),
  normal_side  public.ledger_side not null,
  description  text not null
);

insert into public.ledger_accounts (code, account_type, normal_side, description) values
  ('cash_provider',         'asset',          'debit',  'Money at the payment provider (collection balance)'),
  ('client_funds_held',     'liability',      'credit', 'Payer money held against bookings and package credits'),
  ('guardian_credits',      'liability',      'credit', 'Credits owed to payers from cancellations and dispute outcomes'),
  ('teacher_payable',       'liability',      'credit', 'Net entitlements owed to teachers, pending payout'),
  ('withholding_payable',   'liability',      'credit', 'Withholding on teacher gross, owed to KRA'),
  ('vat_payable',           'liability',      'credit', 'VAT on the platform fee, once VAT-registered'),
  ('revenue_commission',    'revenue',        'credit', 'Platform fee earned on confirmed sessions'),
  ('revenue_managed_plan',  'revenue',        'credit', 'Platform fee at the managed-plan rate'),
  ('revenue_teacher_pro',   'revenue',        'credit', 'Teacher Pro subscriptions (later)'),
  ('expense_payment_fees',  'expense',        'debit',  'STK and card collection fees'),
  ('expense_payout_fees',   'expense',        'debit',  'Transfer fees'),
  ('expense_trial_subsidy', 'expense',        'debit',  'Difference between the trial price and the teacher''s full rate'),
  ('expense_verification',  'expense',        'debit',  'Identity checks and test payouts'),
  ('fx_difference',         'mixed',          'debit',  'KES list price held for a USD charge versus KES settled net of fees'),
  ('refunds_out',           'contra_revenue', 'debit',  'Cash refunds executed'),
  ('adjustments',           'mixed',          'debit',  'Manual corrections, dual control only');

create table public.ledger_transactions (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('payment_hold', 'session_release', 'seat_release', 'trial_release',
                       'vat_on_fee', 'cancel_to_credit', 'credit_used', 'cash_refund', 'payout_sent', 'withholding_remitted',
                       'test_payout', 'chargeback', 'clawback', 'adjustment', 'reversal')),
  idempotency_key    text not null unique,  -- e.g. 'hold:<payment_id>', 'release:<session_id>'
  memo               text,
  parameter_version  text,
  reversal_of_txn_id uuid references public.ledger_transactions (id),
  posted_by          text not null default 'system',  -- 'system:<job>' or 'user:<uuid>'
  requested_by       uuid references public.profiles (id),
  approved_by        uuid references public.profiles (id),
  posted_at          timestamptz not null default now(),
  created_txid       bigint not null default txid_current(),
  constraint ledger_dual_control check (kind not in ('adjustment', 'reversal')
    or (requested_by is not null and approved_by is not null and requested_by <> approved_by)),
  constraint ledger_reversal_reference check ((kind = 'reversal') = (reversal_of_txn_id is not null))
);

create table public.ledger_entries (
  id                   uuid primary key default gen_random_uuid(),
  txn_id               uuid not null references public.ledger_transactions (id),
  account              public.ledger_account not null references public.ledger_accounts (code),
  side                 public.ledger_side not null,
  amount_kes           integer not null check (amount_kes > 0),
  payment_id           uuid references public.payments (id),
  booking_id           uuid references public.bookings (id),
  session_id           uuid references public.sessions (id),
  attendance_id        uuid references public.attendance (id),
  run_id               uuid references public.runs (id),
  package_id           uuid references public.packages (id),
  payout_id            uuid,  -- FK added below
  dispute_id           uuid,  -- FK added in 0800
  refund_id            uuid,  -- FK added below
  counterparty_user_id uuid references public.profiles (id),  -- teacher or payer the liability belongs to
  commission_rate      numeric(6, 4) check (commission_rate between 0 and 1),
  withholding_rate     numeric(6, 4) check (withholding_rate between 0 and 1),
  vat_rate             numeric(6, 4) check (vat_rate between 0 and 1),
  parameter_version    text,
  posted_at            timestamptz not null default now()
);
create index ledger_entries_txn_idx on public.ledger_entries (txn_id);
create index ledger_entries_account_idx on public.ledger_entries (account, posted_at);
create index ledger_entries_counterparty_idx on public.ledger_entries (counterparty_user_id, account) where counterparty_user_id is not null;
create index ledger_entries_payment_idx on public.ledger_entries (payment_id) where payment_id is not null;
create index ledger_entries_session_idx on public.ledger_entries (session_id) where session_id is not null;

-- Entries may only be added in the database transaction that created the journal, so a posted
-- journal can never be extended later.
create or replace function private.ledger_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txid bigint;
begin
  select t.created_txid into v_txid from public.ledger_transactions t where t.id = new.txn_id;
  if v_txid is distinct from txid_current() then
    raise exception 'ledger journal % is closed; entries can only be added in the transaction that created it', new.txn_id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Debits equal credits per journal, with at least two legs (FR-LEDGER-6). Runs at commit.
create or replace function private.ledger_assert_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn    uuid := case when tg_table_name = 'ledger_transactions' then (to_jsonb(new) ->> 'id')::uuid
                        else (to_jsonb(new) ->> 'txn_id')::uuid end;
  v_debit  bigint;
  v_credit bigint;
  v_legs   integer;
begin
  select coalesce(sum(e.amount_kes) filter (where e.side = 'debit'), 0),
         coalesce(sum(e.amount_kes) filter (where e.side = 'credit'), 0),
         count(*)
    into v_debit, v_credit, v_legs
    from public.ledger_entries e
   where e.txn_id = v_txn;
  if v_legs < 2 or v_debit <> v_credit then
    raise exception 'unbalanced ledger journal %: debits % credits % over % legs', v_txn, v_debit, v_credit, v_legs
      using errcode = 'check_violation';
  end if;
  return null;
end
$$;

create trigger ledger_entries_05_guard before insert on public.ledger_entries
  for each row execute function private.ledger_entry_guard();
create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.ledger_assert_balanced();
create constraint trigger ledger_transactions_balanced after insert on public.ledger_transactions
  deferrable initially deferred
  for each row execute function private.ledger_assert_balanced();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.forbid_mutation();
create trigger ledger_transactions_append_only before update or delete on public.ledger_transactions
  for each row execute function private.forbid_mutation();
create trigger ledger_entries_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.forbid_mutation();
create trigger ledger_transactions_no_truncate before truncate on public.ledger_transactions
  for each statement execute function private.forbid_mutation();

-- Finance console corrections: one staff member requests, a different one approves (dual control).
create table public.ledger_adjustment_requests (
  id                 uuid primary key default gen_random_uuid(),
  requested_by       uuid not null default auth.uid() references public.profiles (id),
  approved_by        uuid references public.profiles (id),
  status             text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'posted')),
  reason             text not null check (char_length(reason) between 5 and 1000),
  proposed_entries   jsonb not null,  -- [{account, side, amount_kes, ...}], must balance when posted
  reversal_of_txn_id uuid references public.ledger_transactions (id),
  posted_txn_id      uuid references public.ledger_transactions (id),
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ledger_adjustment_two_people check (approved_by is null or approved_by <> requested_by)
);
create trigger ledger_adjustment_requests_updated_at before update on public.ledger_adjustment_requests
  for each row execute function private.set_updated_at();

-- Balances, readable through RLS on ledger_entries (finance and admin see all; teachers their own).
create view public.ledger_account_balances with (security_invoker = true) as
select e.account,
       a.account_type,
       e.counterparty_user_id,
       sum(case when e.side = a.normal_side then e.amount_kes else -e.amount_kes end)::bigint as balance_kes
  from public.ledger_entries e
  join public.ledger_accounts a on a.code = e.account
 group by e.account, a.account_type, e.counterparty_user_id;

-- ---------------------------------------------------------------------------
-- Payouts (§4.9, §8.3)
-- ---------------------------------------------------------------------------
create table public.payout_batches (
  id              uuid primary key default gen_random_uuid(),
  week_start      date not null unique,
  cutoff_at       timestamptz not null,
  status          text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'sending', 'completed', 'cancelled')),
  teacher_count   integer not null default 0,
  gross_kes       bigint not null default 0,
  withholding_kes bigint not null default 0,
  net_kes         bigint not null default 0,
  fees_kes        bigint not null default 0,
  approved_by     uuid references public.profiles (id),
  second_approver uuid references public.profiles (id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payout_batches_two_approvers check (second_approver is null or second_approver <> approved_by)
);
create trigger payout_batches_updated_at before update on public.payout_batches
  for each row execute function private.set_updated_at();

create table public.payouts (
  id               uuid primary key default gen_random_uuid(),  -- also the idempotent transfer reference
  teacher_id       uuid not null references public.teachers (id),
  batch_id         uuid references public.payout_batches (id),
  gross_kes        integer not null check (gross_kes >= 0),
  platform_fee_kes integer not null default 0 check (platform_fee_kes >= 0),
  withholding_kes  integer not null default 0 check (withholding_kes >= 0),
  net_kes          integer not null check (net_kes >= 0),
  transfer_fee_kes integer not null default 0 check (transfer_fee_kes >= 0),
  provider         text not null default 'paystack' check (provider in ('paystack', 'intasend', 'daraja')),
  provider_ref     text,
  status           public.payout_status not null default 'pending_approval',
  exclusion_reason text,
  attempts         integer not null default 0 check (attempts >= 0),
  last_error       text,
  approved_by      uuid references public.profiles (id),
  second_approver  uuid references public.profiles (id),
  sent_at          timestamptz,
  statement_key    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint payouts_one_per_batch unique (batch_id, teacher_id),
  constraint payouts_two_approvers check (second_approver is null or second_approver <> approved_by),
  constraint payouts_excluded_reason check (status <> 'excluded' or exclusion_reason is not null),
  constraint payouts_provider_ref_unique unique (provider, provider_ref)
);
create index payouts_teacher_idx on public.payouts (teacher_id, created_at desc);
create trigger payouts_10_transition before insert or update of status on public.payouts
  for each row execute function private.enforce_transition('payout', 'status');
create trigger payouts_updated_at before update on public.payouts
  for each row execute function private.set_updated_at();

-- One statement line per confirmed session or released seat; an entitlement is paid out once.
create table public.payout_lines (
  id              uuid primary key default gen_random_uuid(),
  payout_id       uuid not null references public.payouts (id) on delete cascade,
  ledger_entry_id uuid not null unique references public.ledger_entries (id),  -- the teacher_payable credit
  booking_id      uuid references public.bookings (id),
  session_id      uuid references public.sessions (id),
  attendance_id   uuid references public.attendance (id),
  run_id          uuid references public.runs (id),
  gross_kes       integer not null check (gross_kes >= 0),
  commission_rate numeric(6, 4) not null check (commission_rate between 0 and 1),
  commission_kes  integer not null check (commission_kes >= 0),
  withholding_kes integer not null check (withholding_kes >= 0),
  net_kes         integer not null check (net_kes >= 0),
  created_at      timestamptz not null default now()
);

alter table public.ledger_entries
  add constraint ledger_entries_payout_fk foreign key (payout_id) references public.payouts (id);

-- ---------------------------------------------------------------------------
-- Refunds (cash back to the payer; credits are ledger-only)
-- ---------------------------------------------------------------------------
create table public.refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments (id),
  booking_id   uuid references public.bookings (id),
  package_id   uuid references public.packages (id),
  dispute_id   uuid,  -- FK added in 0800
  amount_kes   integer not null check (amount_kes > 0),
  fee_kes      integer not null default 0 check (fee_kes >= 0),
  method       text not null default 'provider_refund' check (method in ('provider_refund', 'transfer')),
  platform_ref text not null unique default ('KR' || to_char(now() at time zone 'UTC', 'YYMMDD') || '-'
                 || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  provider_ref text,
  status       text not null default 'requested' check (status in ('requested', 'approved', 'pending', 'succeeded', 'failed', 'cancelled')),
  reason       text not null check (char_length(reason) between 3 and 1000),
  requested_by uuid default auth.uid() references public.profiles (id),
  approved_by  uuid references public.profiles (id),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);
create trigger refunds_10_transition before insert or update of status on public.refunds
  for each row execute function private.enforce_transition('refund', 'status');
create trigger refunds_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();

alter table public.ledger_entries
  add constraint ledger_entries_refund_fk foreign key (refund_id) references public.refunds (id);

-- Daily reconciliation results (FR-LEDGER-6, §9.7 rule 9).
create table public.reconciliation_runs (
  id          uuid primary key default gen_random_uuid(),
  run_on      date not null,
  status      text not null check (status in ('passed', 'failed')),
  findings    jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index reconciliation_runs_day_idx on public.reconciliation_runs (run_on desc);

insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  ('payment', '[*]',                'initiated',          '{any}',    'checkout creates payment with platform reference'),
  ('payment', 'initiated',          'pending',            '{system}', 'STK push sent or card page opened'),
  ('payment', 'initiated',          'failed',             '{system}', 'provider refused the request'),
  ('payment', 'pending',            'succeeded',          '{system}', 'webhook verified and transaction re-fetched'),
  ('payment', 'pending',            'failed',             '{system}', 'cancelled, timed out or declined'),
  ('payment', 'failed',             'initiated',          '{system}', 'payer retries, new attempt same booking'),
  ('payment', 'succeeded',          'refunded',           '{system}', 'full cash refund executed'),
  ('payment', 'succeeded',          'partially_refunded', '{system}', 'partial cash refund executed'),
  ('payment', 'partially_refunded', 'refunded',           '{system}', 'remainder refunded'),
  ('payment', 'succeeded',          'charged_back',       '{system}', 'card chargeback reported, dispute opened'),

  ('payment_hold', '[*]',      'held',     '{system}', 'hold entry posted to client funds at the KES list price'),
  ('payment_hold', 'held',     'released', '{system}', 'session confirmed, commission and entitlement posted'),
  ('payment_hold', 'held',     'credited', '{system}', 'cancellation or dispute moves amount to payer credits'),
  ('payment_hold', 'held',     'refunded', '{system}', 'cash refund executed'),
  ('payment_hold', 'credited', 'held',     '{system}', 'credit applied to a new booking'),
  ('payment_hold', 'released', 'clawback', '{system}', 'post-release dispute upheld, recovered from next payout'),

  ('payout', '[*]',              'pending_approval', '{system}',        'weekly batch computed from teacher payable'),
  ('payout', '[*]',              'excluded',         '{system}',        'missing KRA PIN, unverified payout number or hold'),
  ('payout', 'pending_approval', 'approved',         '{finance,admin}', 'finance approves, second approver above limit'),
  ('payout', 'pending_approval', 'excluded',         '{system}',        'missing KRA PIN, unverified payout number or hold'),
  ('payout', 'excluded',         'pending_approval', '{system}',        'blocker cleared before next batch'),
  ('payout', 'approved',         'sending',          '{system}',        'transfer requested with payout id as reference'),
  ('payout', 'sending',          'sent',             '{system}',        'provider webhook confirms, ledger posted'),
  ('payout', 'sending',          'failed',           '{system}',        'provider reports failure'),
  ('payout', 'failed',           'sending',          '{system}',        'automatic retry, up to three over 24 hours'),
  ('payout', 'failed',           'parked',           '{system}',        'retries exhausted, teacher notified'),
  ('payout', 'parked',           'sending',          '{finance,admin}', 'finance retries after fix'),
  ('payout', 'parked',           'cancelled',        '{finance,admin}', 'finance cancels, balance stays payable'),

  ('refund', '[*]',       'requested', '{finance,admin}', 'refund requested'),
  ('refund', 'requested', 'approved',  '{finance,admin}', 'approved'),
  ('refund', 'requested', 'cancelled', '{finance,admin}', 'withdrawn'),
  ('refund', 'approved',  'pending',   '{system}',        'sent to provider with platform_ref as idempotency key'),
  ('refund', 'pending',   'succeeded', '{system}',        'provider confirms, ledger posted'),
  ('refund', 'pending',   'failed',    '{system}',        'provider reports failure'),
  ('refund', 'failed',    'pending',   '{system}',        'retry');
