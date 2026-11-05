-- Koobi sprint 6: weekly payouts with statements and withholding (PRD §4.9, FR-PAYOUT-1..4), the
-- verification ladder and badges (§4.2, FR-VER-1..6), daily reconciliation (FR-LEDGER-6) and the
-- teacher's payout settings.
--
-- Payouts: computed from teacher_payable entries not yet on a statement, one statement line per
-- released lesson, two different Finance approvers, the transfer is recorded only after the provider
-- confirms it. Verification: teachers start and submit checks; reviewers pass or fail them with the
-- minutes logged; tiers and the bookable gate are derived here, never set by hand.

-- ---------------------------------------------------------------------------
-- 1. Reconciliation
-- ---------------------------------------------------------------------------
create or replace function private.job_daily_reconciliation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_findings jsonb := '[]'::jsonb;
  v_id uuid;
  v_client bigint;
  v_cash bigint;
  r record;
begin
  perform set_config('app.actor', 'system:daily_reconciliation', true);

  -- debits equal credits per journal (also enforced at commit; this catches disabled triggers)
  for r in
    select e.txn_id,
           sum(e.amount_kes) filter (where e.side = 'debit') as debits,
           sum(e.amount_kes) filter (where e.side = 'credit') as credits
      from public.ledger_entries e
     group by e.txn_id
    having coalesce(sum(e.amount_kes) filter (where e.side = 'debit'), 0)
        <> coalesce(sum(e.amount_kes) filter (where e.side = 'credit'), 0)
  loop
    v_findings := v_findings || jsonb_build_object('check', 'journal_balanced', 'txn_id', r.txn_id,
                                                   'debits', r.debits, 'credits', r.credits);
  end loop;

  -- client money is never spent: liabilities to clients, teachers and KRA <= cash at the provider
  select coalesce(sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end), 0)
    into v_client
    from public.ledger_entries e
   where e.account in ('client_funds_held', 'guardian_credits', 'teacher_payable', 'withholding_payable', 'vat_payable');
  select coalesce(sum(case when e.side = 'debit' then e.amount_kes else -e.amount_kes end), 0)
    into v_cash
    from public.ledger_entries e
   where e.account = 'cash_provider';
  if v_client > v_cash then
    v_findings := v_findings || jsonb_build_object('check', 'client_money_covered', 'liabilities_kes', v_client, 'cash_kes', v_cash);
  end if;

  -- every succeeded payment put its money on hold exactly once (cash or credit)
  for r in
    select p.id, count(distinct t.id) as holds
      from public.payments p
      left join public.ledger_entries e on e.payment_id = p.id and e.account = 'client_funds_held' and e.side = 'credit'
      left join public.ledger_transactions t on t.id = e.txn_id and t.kind in ('payment_hold', 'credit_used')
     where p.status in ('succeeded', 'refunded', 'partially_refunded')
     group by p.id
    having count(distinct t.id) <> 1
  loop
    v_findings := v_findings || jsonb_build_object('check', 'payment_has_one_hold', 'payment_id', r.id, 'holds', r.holds);
  end loop;

  -- every confirmed one-to-one session has exactly one entitlement line
  for r in
    select s.id, count(e.id) as lines
      from public.sessions s
      left join public.ledger_entries e on e.session_id = s.id and e.account = 'teacher_payable' and e.side = 'credit'
     where s.status = 'confirmed' and s.booking_id is not null
     group by s.id
    having count(e.id) <> 1
  loop
    v_findings := v_findings || jsonb_build_object('check', 'session_has_one_entitlement', 'session_id', r.id, 'lines', r.lines);
  end loop;

  -- every sent payout has exactly one payout journal, for its net amount
  for r in
    select po.id, po.net_kes,
           coalesce(sum(e.amount_kes) filter (where e.account = 'teacher_payable' and e.side = 'debit'), 0) as debited
      from public.payouts po
      left join public.ledger_entries e on e.payout_id = po.id
     where po.status = 'sent'
     group by po.id, po.net_kes
    having coalesce(sum(e.amount_kes) filter (where e.account = 'teacher_payable' and e.side = 'debit'), 0) <> po.net_kes
  loop
    v_findings := v_findings || jsonb_build_object('check', 'payout_posted_once', 'payout_id', r.id, 'net_kes', r.net_kes, 'debited_kes', r.debited);
  end loop;

  -- no teacher is owed a negative amount
  for r in
    select e.counterparty_user_id, sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end) as balance
      from public.ledger_entries e
     where e.account = 'teacher_payable'
     group by e.counterparty_user_id
    having sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end) < 0
  loop
    v_findings := v_findings || jsonb_build_object('check', 'teacher_payable_not_negative', 'user_id', r.counterparty_user_id, 'balance_kes', r.balance);
  end loop;

  insert into public.reconciliation_runs (run_on, status, findings)
  values ((now() at time zone 'Africa/Nairobi')::date,
          case when jsonb_array_length(v_findings) = 0 then 'passed' else 'failed' end,
          v_findings)
  returning id into v_id;

  perform private.enqueue('reconciliation.provider_check', 'reconciliation_runs', v_id,
                          jsonb_build_object('reconciliation_run_id', v_id), 'recon-provider:' || v_id::text, 5);
  if jsonb_array_length(v_findings) > 0 then
    perform private.enqueue('reconciliation.failed', 'reconciliation_runs', v_id,
                            jsonb_build_object('reconciliation_run_id', v_id, 'findings', jsonb_array_length(v_findings)),
                            'recon-failed:' || v_id::text, 5);
  end if;
  return v_id;
end
$$;

-- Finance can run it on demand (S15).
create or replace function public.run_reconciliation()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  return private.job_daily_reconciliation();
end
$$;

-- The newest run failed: payouts wait until Finance clears it (§9.7 rule 9).
create or replace function private.reconciliation_blocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rr.status = 'failed' from public.reconciliation_runs rr order by rr.created_at desc limit 1), false)
$$;

-- Dual-control correction or funding (§9.7): one person requests, a different person posts it.
-- Typical use: Koobi tops up the provider balance to cover trial subsidies and fees
-- (cash_provider debit, adjustments credit), which clears the client_money_covered finding.
create or replace function public.approve_adjustment(p_request uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r       public.ledger_adjustment_requests%rowtype;
  e       jsonb;
  v_dr    bigint := 0;
  v_cr    bigint := 0;
  v_txn   uuid;
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.ledger_adjustment_requests where id = p_request for update;
  if not found or r.status <> 'requested' then
    raise exception 'this adjustment is not waiting for approval' using errcode = 'check_violation';
  end if;
  if r.requested_by = auth.uid() then
    raise exception 'a second person must approve this adjustment' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(r.proposed_entries) <> 'array' or jsonb_array_length(r.proposed_entries) not between 2 and 20 then
    raise exception 'an adjustment has 2 to 20 lines' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(r.proposed_entries) loop
    if not exists (select 1 from public.ledger_accounts a where a.code::text = e ->> 'account')
       or (e ->> 'side') not in ('debit', 'credit') or coalesce((e ->> 'amount_kes')::integer, 0) <= 0 then
      raise exception 'each line needs an account, a side and a positive amount' using errcode = 'check_violation';
    end if;
    if e ->> 'side' = 'debit' then v_dr := v_dr + (e ->> 'amount_kes')::integer; else v_cr := v_cr + (e ->> 'amount_kes')::integer; end if;
  end loop;
  if v_dr <> v_cr then
    raise exception 'debits % and credits % do not balance', v_dr, v_cr using errcode = 'check_violation';
  end if;
  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by, requested_by, approved_by)
  values ('adjustment', 'adjustment:' || r.id::text, left(r.reason, 500), 'user:' || auth.uid()::text, r.requested_by, auth.uid())
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, counterparty_user_id)
  select v_txn, (x ->> 'account')::public.ledger_account, (x ->> 'side')::public.ledger_side, (x ->> 'amount_kes')::integer,
         nullif(x ->> 'counterparty_user_id', '')::uuid
    from jsonb_array_elements(r.proposed_entries) x;
  update public.ledger_adjustment_requests
     set status = 'posted', approved_by = auth.uid(), decided_at = now(), posted_txn_id = v_txn
   where id = r.id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'ledger.adjustment', 'ledger_adjustment_requests', r.id,
          jsonb_build_object('txn_id', v_txn, 'amount_kes', v_dr), r.reason);
  return v_txn;
end
$$;

create or replace function public.reject_adjustment(p_request uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  update public.ledger_adjustment_requests
     set status = 'rejected', approved_by = auth.uid(), decided_at = now(),
         reason = left(reason || ' | rejected: ' || coalesce(btrim(p_reason), ''), 1000)
   where id = p_request and status = 'requested' and requested_by <> auth.uid();
  if not found then
    raise exception 'only someone else can reject a waiting adjustment' using errcode = 'check_violation';
  end if;
end
$$;

-- Requests are decided only through approve_adjustment and reject_adjustment.
revoke update (status, approved_by, decided_at) on public.ledger_adjustment_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Payout batches (FR-PAYOUT-1, -2, -3)
-- ---------------------------------------------------------------------------
-- Transfer fee absorbed by the platform, from the dated tier table.
create or replace function private.transfer_fee(p_net integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (t ->> 'fee_kes')::integer
      from jsonb_array_elements(coalesce(private.param('payout_transfer_fee_tiers'), '[]'::jsonb)) t
     where (t ->> 'up_to_kes') is null or p_net <= (t ->> 'up_to_kes')::integer
     order by coalesce((t ->> 'up_to_kes')::integer, 2147483647)
     limit 1), 0)
$$;

-- Builds (or rebuilds, until the first approval) the batch for one week. Entries posted after the
-- cut-off wait for next week; balances under the threshold carry over; a teacher with no KRA PIN, an
-- unproven payout number or an account on hold is listed as excluded and keeps the balance.
create or replace function private.compute_payout_batch(p_week date, p_cutoff timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch  public.payout_batches%rowtype;
  v_min    integer := private.num_param('payout_min_threshold_kes', 500)::integer;
  v_payout uuid;
  v_reason text;
  t        record;
begin
  perform set_config('app.actor', 'system:payout_batch', true);

  -- Older batches nobody approved are withdrawn so their lessons are paid in this one.
  delete from public.payouts po using public.payout_batches pb
   where po.batch_id = pb.id and pb.week_start < p_week and pb.status in ('draft', 'pending_approval') and pb.approved_by is null;
  update public.payout_batches set status = 'cancelled'
   where week_start < p_week and status in ('draft', 'pending_approval') and approved_by is null;

  select * into v_batch from public.payout_batches where week_start = p_week for update;
  if found then
    if v_batch.status not in ('draft', 'pending_approval') or v_batch.approved_by is not null then
      return v_batch.id;  -- approved or sending: never recomputed
    end if;
    delete from public.payouts where batch_id = v_batch.id;
    update public.payout_batches set cutoff_at = p_cutoff, status = 'draft' where id = v_batch.id;
  else
    insert into public.payout_batches (week_start, cutoff_at) values (p_week, p_cutoff) returning * into v_batch;
  end if;

  for t in
    select tc.id as teacher_id, tc.user_id, tc.kra_pin_enc, tc.payout_ownership_status, tc.status, sum(e.amount_kes)::integer as net
      from public.ledger_entries e
      join public.ledger_transactions x on x.id = e.txn_id
      join public.teachers tc on tc.user_id = e.counterparty_user_id
     where e.account = 'teacher_payable' and e.side = 'credit' and x.posted_at <= p_cutoff
       and not exists (select 1 from public.payout_lines pl where pl.ledger_entry_id = e.id)
     group by tc.id, tc.user_id, tc.kra_pin_enc, tc.payout_ownership_status, tc.status
  loop
    continue when t.net < v_min;
    v_reason := case when t.status in ('suspended', 'offboarded') then 'Account on hold'
                     when t.kra_pin_enc is null then 'KRA PIN missing'
                     when t.payout_ownership_status <> 'passed' then 'Payout number not verified' end;
    insert into public.payouts (teacher_id, batch_id, gross_kes, net_kes, transfer_fee_kes, status, exclusion_reason)
    values (t.teacher_id, v_batch.id, t.net, t.net, private.transfer_fee(t.net),
            case when v_reason is null then 'pending_approval' else 'excluded' end::public.payout_status, v_reason)
    returning id into v_payout;
    continue when v_reason is not null;

    insert into public.payout_lines (payout_id, ledger_entry_id, booking_id, session_id, gross_kes, commission_rate,
                                     commission_kes, withholding_kes, net_kes)
    select v_payout, e.id, e.booking_id, e.session_id,
           e.amount_kes + coalesce(w.v, 0) + coalesce(c.v, 0), coalesce(e.commission_rate, 0), coalesce(c.v, 0), coalesce(w.v, 0), e.amount_kes
      from public.ledger_entries e
      join public.ledger_transactions x on x.id = e.txn_id
      left join lateral (select sum(y.amount_kes)::integer v from public.ledger_entries y
                          where y.txn_id = e.txn_id and y.account = 'withholding_payable' and y.side = 'credit'
                            and y.booking_id is not distinct from e.booking_id) w on true
      left join lateral (select sum(y.amount_kes)::integer v from public.ledger_entries y
                          where y.txn_id = e.txn_id and y.account = 'revenue_commission' and y.side = 'credit'
                            and y.booking_id is not distinct from e.booking_id) c on true
     where e.account = 'teacher_payable' and e.side = 'credit' and e.counterparty_user_id = t.user_id and x.posted_at <= p_cutoff
       and not exists (select 1 from public.payout_lines pl where pl.ledger_entry_id = e.id);

    update public.payouts po
       set gross_kes = s.g, platform_fee_kes = s.c, withholding_kes = s.w, net_kes = s.n
      from (select sum(gross_kes)::integer g, sum(commission_kes)::integer c, sum(withholding_kes)::integer w, sum(net_kes)::integer n
              from public.payout_lines where payout_id = v_payout) s
     where po.id = v_payout;
  end loop;

  update public.payout_batches pb
     set status = 'pending_approval', teacher_count = s.n, gross_kes = s.g, withholding_kes = s.w, net_kes = s.net, fees_kes = s.f
    from (select count(*)::integer n, coalesce(sum(gross_kes), 0) g, coalesce(sum(withholding_kes), 0) w,
                 coalesce(sum(net_kes), 0) net, coalesce(sum(transfer_fee_kes), 0) f
            from public.payouts where batch_id = v_batch.id and status = 'pending_approval') s
   where pb.id = v_batch.id;
  return v_batch.id;
end
$$;

create or replace function private.job_weekly_payout_batch()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Africa/Nairobi')::date;
  v_id   uuid;
begin
  perform set_config('app.actor', 'system:weekly_payout_batch', true);
  if private.reconciliation_blocked() then
    perform private.enqueue('payout.batch_blocked', 'payout_batches', null,
                            jsonb_build_object('week_start', v_week), 'payout-blocked:' || v_week::text, 5);
    return null;
  end if;
  v_id := private.compute_payout_batch(v_week, now());
  perform private.enqueue('payout.batch_ready', 'payout_batches', v_id, jsonb_build_object('week_start', v_week),
                          'payout-batch:' || v_week::text, 3);
  return v_id;
end
$$;

-- Finance: build this week's batch now (S13).
create or replace function public.compute_payout_batch()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  if private.reconciliation_blocked() then
    raise exception 'the latest reconciliation failed; clear it before paying anyone' using errcode = 'check_violation';
  end if;
  return private.compute_payout_batch(date_trunc('week', now() at time zone 'Africa/Nairobi')::date, now());
end
$$;

-- Two different people approve every batch (S13). Returns 'first' or 'approved'.
create or replace function public.approve_payout_batch(p_batch uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.payout_batches%rowtype;
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.payout_batches where id = p_batch for update;
  if not found or b.status <> 'pending_approval' then
    raise exception 'this batch is not waiting for approval' using errcode = 'check_violation';
  end if;
  if private.reconciliation_blocked() then
    raise exception 'the latest reconciliation failed; clear it before paying anyone' using errcode = 'check_violation';
  end if;
  if b.teacher_count = 0 then
    raise exception 'there is nobody to pay in this batch' using errcode = 'check_violation';
  end if;
  if b.approved_by is null then
    update public.payout_batches set approved_by = auth.uid() where id = b.id;
    insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
    values (auth.uid(), 'user:' || auth.uid()::text, 'payout.approve_first', 'payout_batches', b.id, jsonb_build_object('net_kes', b.net_kes));
    return 'first';
  end if;
  if b.approved_by = auth.uid() then
    raise exception 'a second person must approve this batch' using errcode = 'check_violation';
  end if;
  update public.payout_batches set second_approver = auth.uid(), approved_at = now(), status = 'approved' where id = b.id;
  update public.payouts set status = 'approved', approved_by = b.approved_by, second_approver = auth.uid()
   where batch_id = b.id and status = 'pending_approval';
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'payout.approve_second', 'payout_batches', b.id, jsonb_build_object('net_kes', b.net_kes));
  return 'approved';
end
$$;

-- Finance takes one teacher out of a batch before approval; the balance waits for next week.
create or replace function public.exclude_payout(p_payout uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'say why this payout is held' using errcode = 'check_violation';
  end if;
  select * into po from public.payouts where id = p_payout for update;
  if not found or po.status <> 'pending_approval'
     or exists (select 1 from public.payout_batches b where b.id = po.batch_id and b.approved_by is not null) then
    raise exception 'only a payout in an unapproved batch can be held back' using errcode = 'check_violation';
  end if;
  delete from public.payout_lines where payout_id = po.id;
  update public.payouts set status = 'excluded', exclusion_reason = left(btrim(p_reason), 300) where id = po.id;
  update public.payout_batches pb
     set teacher_count = s.n, gross_kes = s.g, withholding_kes = s.w, net_kes = s.net, fees_kes = s.f
    from (select count(*)::integer n, coalesce(sum(gross_kes), 0) g, coalesce(sum(withholding_kes), 0) w,
                 coalesce(sum(net_kes), 0) net, coalesce(sum(transfer_fee_kes), 0) f
            from public.payouts where batch_id = po.batch_id and status = 'pending_approval') s
   where pb.id = po.batch_id;
end
$$;

-- Service role: the transfer was requested (payout id is the provider reference).
create or replace function public.mark_payout_sending(p_payout uuid, p_provider_ref text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
begin
  perform set_config('app.actor', 'system:payout', true);
  update public.payouts
     set status = 'sending', attempts = attempts + 1, provider_ref = coalesce(p_provider_ref, provider_ref), last_error = null
   where id = p_payout and status in ('approved', 'failed', 'parked')
  returning batch_id into v_batch;
  update public.payout_batches set status = 'sending' where id = v_batch and status = 'approved';
end
$$;

-- Service role, after the provider confirms: the payout journal (FR-LEDGER-2).
create or replace function public.record_payout_sent(p_payout uuid, p_provider_ref text, p_fee_kes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  po      public.payouts%rowtype;
  v_owner uuid;
  v_fee   integer;
  v_txn   uuid;
begin
  perform set_config('app.actor', 'system:payout', true);
  select * into po from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'payout % not found', p_payout using errcode = 'no_data_found';
  end if;
  if po.status = 'sent' then
    return false;
  end if;
  if po.status <> 'sending' then
    raise exception 'payout % is %, not sending', po.id, po.status using errcode = 'check_violation';
  end if;
  v_fee := greatest(coalesce(p_fee_kes, po.transfer_fee_kes), 0);
  select user_id into v_owner from public.teachers where id = po.teacher_id;
  update public.payouts set status = 'sent', sent_at = now(), transfer_fee_kes = v_fee, provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = po.id;

  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values ('payout_sent', 'payout:' || po.id::text, 'Weekly payout to M-Pesa', 'system:payout')
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, payout_id, counterparty_user_id)
  values (v_txn, 'teacher_payable', 'debit', po.net_kes, po.id, v_owner),
         (v_txn, 'cash_provider', 'credit', po.net_kes + v_fee, po.id, null);
  if v_fee > 0 then
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payout_id)
    values (v_txn, 'expense_payout_fees', 'debit', v_fee, po.id);
  end if;

  update public.payout_batches set status = 'completed'
   where id = po.batch_id
     and not exists (select 1 from public.payouts x where x.batch_id = po.batch_id and x.status not in ('sent', 'excluded', 'cancelled'));
  return true;
end
$$;

-- Service role: the provider refused or reversed it. Three attempts, then it is parked for Finance.
create or replace function public.record_payout_failure(p_payout uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', 'system:payout', true);
  update public.payouts set status = 'failed', last_error = left(coalesce(p_reason, 'unknown'), 500)
   where id = p_payout and status = 'sending';
  update public.payouts set status = 'parked' where id = p_payout and status = 'failed' and attempts >= 3;
end
$$;

-- Finance gives up on a parked payout; the balance stays payable and joins the next batch.
create or replace function public.cancel_payout(p_payout uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance only' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'say why' using errcode = 'check_violation';
  end if;
  delete from public.payout_lines where payout_id = p_payout
     and exists (select 1 from public.payouts po where po.id = p_payout and po.status = 'parked');
  update public.payouts set status = 'cancelled', last_error = left(btrim(p_reason), 500) where id = p_payout and status = 'parked';
  if not found then
    raise exception 'only a parked payout can be cancelled' using errcode = 'check_violation';
  end if;
end
$$;

-- The teacher's money at a glance (T22).
create or replace function public.my_earnings()
returns table (held_kes integer, owed_kes integer, in_payout_kes integer, paid_kes integer, threshold_kes integer, next_payout_on date)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select t.id, t.user_id from public.teachers t where t.user_id = (select auth.uid()))
  select
    coalesce((select sum(p.amount_kes) from public.payments p join public.bookings b on b.id = p.booking_id
               where b.teacher_id = (select id from me) and p.hold_status = 'held'), 0)::integer,
    coalesce((select sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end) from public.ledger_entries e
               where e.account = 'teacher_payable' and e.counterparty_user_id = (select user_id from me)), 0)::integer,
    coalesce((select sum(po.net_kes) from public.payouts po
               where po.teacher_id = (select id from me) and po.status in ('pending_approval', 'approved', 'sending', 'failed', 'parked')), 0)::integer,
    coalesce((select sum(po.net_kes) from public.payouts po where po.teacher_id = (select id from me) and po.status = 'sent'), 0)::integer,
    private.num_param('payout_min_threshold_kes', 500)::integer,
    ((now() at time zone 'Africa/Nairobi')::date + ((5 - extract(isodow from now() at time zone 'Africa/Nairobi')::integer + 7) % 7))::date
  where exists (select 1 from me)
$$;

-- ---------------------------------------------------------------------------
-- 3. Verification ladder (FR-VER-1..6)
-- ---------------------------------------------------------------------------
-- Teachers also see why a check did not pass, and which attempt it is.
create or replace view public.my_verification_checks with (security_invoker = false) as
select vc.id, vc.teacher_id, vc.offering_id, vc.track, vc.tier, vc.check_type, ct.label as check_label,
       ct.badge_label, vc.status, vc.passed_at, vc.expires_at, vc.created_at, vc.updated_at,
       vc.failure_reason, vc.attempt_no
  from public.verification_checks vc
  join public.check_types ct on ct.code = vc.check_type
 where vc.teacher_id = (select public.my_teacher_id())
    or (select public.has_any_role('{concierge,reviewer,admin}'));

-- Tier per track (FR-VER-1): tier k needs a passed, current check at every level up to k; tier 1 is
-- the identity check. The bookable gate needs tier 1 somewhere and a proven payout number.
create or replace function private.recompute_tiers(p_teacher uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r      record;
  v_tier smallint;
  v_gate boolean;
  t      public.teachers%rowtype;
begin
  insert into public.teacher_tracks (teacher_id, track)
  select distinct p_teacher, o.track from public.offerings o where o.teacher_id = p_teacher
  on conflict (teacher_id, track) do nothing;

  for r in select tt.track from public.teacher_tracks tt where tt.teacher_id = p_teacher loop
    v_tier := 0;
    for k in 1..5 loop
      exit when not exists (
        select 1 from public.verification_checks vc
          join public.check_types ct on ct.code = vc.check_type
         where vc.teacher_id = p_teacher and vc.status = 'passed' and vc.badge_suspended_at is null
           and (vc.expires_at is null or vc.expires_at > now())
           and ct.default_tier = k and (vc.track is null or vc.track = r.track)
           and (k <> 1 or vc.check_type = 'identity_iprs'));
      v_tier := k;
    end loop;
    update public.teacher_tracks set tier = v_tier where teacher_id = p_teacher and track = r.track and tier <> v_tier;
  end loop;

  select * into t from public.teachers where id = p_teacher;
  v_gate := t.payout_ownership_status = 'passed'
            and exists (select 1 from public.teacher_tracks tt where tt.teacher_id = p_teacher and tt.tier >= 1);
  if v_gate and t.status = 'applied' then
    update public.teachers set status = 'bookable' where id = p_teacher;
  elsif not v_gate and t.status = 'bookable' then
    update public.teachers set status = 'applied' where id = p_teacher;
  end if;
end
$$;

-- Admin lifts a suspension; the bookable gate is then recomputed from the checks (S18).
create or replace function public.reinstate_teacher(p_teacher uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'write the reason' using errcode = 'check_violation';
  end if;
  update public.teachers set status = 'applied', status_reason = left(btrim(p_reason), 300) where id = p_teacher and status = 'suspended';
  if not found then
    raise exception 'only a suspended teacher can be reinstated' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'teacher.reinstate', 'teachers', p_teacher, left(btrim(p_reason), 300));
  perform private.recompute_tiers(p_teacher);
end
$$;

-- The teacher starts a check (or gets back the one already open). Track record is earned, not asked for.
create or replace function public.start_check(p_type text, p_offering uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.my_teacher_id();
  ct        public.check_types%rowtype;
  v_track   text;
  v_id      uuid;
  v_attempt integer;
  v_max     integer := private.num_param('verification_max_attempts', 3)::integer;
begin
  if v_teacher is null then
    raise exception 'apply as a teacher first' using errcode = 'check_violation';
  end if;
  select * into ct from public.check_types where code = p_type and is_active;
  if not found or p_type = 'track_record' then
    raise exception 'this check cannot be requested' using errcode = 'check_violation';
  end if;
  if p_offering is not null then
    select o.track into v_track from public.offerings o where o.id = p_offering and o.teacher_id = v_teacher;
    if not found then
      raise exception 'not your offer' using errcode = 'insufficient_privilege';
    end if;
  end if;
  select id into v_id from public.verification_checks
   where teacher_id = v_teacher and check_type = p_type and offering_id is not distinct from p_offering and status in ('pending', 'in_review')
   order by created_at desc limit 1;
  if found then
    return v_id;
  end if;
  if exists (select 1 from public.verification_checks
              where teacher_id = v_teacher and check_type = p_type and offering_id is not distinct from p_offering
                and status = 'passed' and (expires_at is null or expires_at > now())) then
    raise exception 'this check has already passed' using errcode = 'check_violation';
  end if;
  select coalesce(max(attempt_no), 0) + 1 into v_attempt from public.verification_checks
   where teacher_id = v_teacher and check_type = p_type and offering_id is not distinct from p_offering and status = 'failed';
  if v_attempt > v_max then
    raise exception 'no attempts left for this check; message the concierge' using errcode = 'check_violation';
  end if;
  insert into public.verification_checks (teacher_id, offering_id, track, tier, check_type, attempt_no)
  values (v_teacher, p_offering, v_track, ct.default_tier, p_type, v_attempt)
  returning id into v_id;
  return v_id;
end
$$;

-- The teacher sends a check for review once the documents or details are in.
create or replace function public.submit_check(p_check uuid, p_details jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.verification_checks%rowtype;
  d jsonb := coalesce(p_details, '{}'::jsonb);
begin
  select * into c from public.verification_checks where id = p_check for update;
  if not found or c.teacher_id is distinct from public.my_teacher_id() then
    raise exception 'not your check' using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'pending' then
    raise exception 'this check is %, not waiting for you', c.status using errcode = 'check_violation';
  end if;
  if char_length(d::text) > 4000 then
    raise exception 'too much detail; keep it short' using errcode = 'check_violation';
  end if;
  if c.check_type = 'payout_ownership' then
    raise exception 'the test payout completes this check' using errcode = 'check_violation';
  end if;
  if c.check_type in ('identity_iprs', 'certificate_kcse', 'certificate_degree', 'certificate_tsc', 'good_conduct',
                      'credential_professional', 'experience_evidence', 'portfolio', 'work_history')
     and not exists (select 1 from public.verification_documents vd where vd.check_id = c.id and vd.deleted_at is null) then
    raise exception 'upload the document first' using errcode = 'check_violation';
  end if;
  if c.check_type = 'demo_lesson' and coalesce(d ->> 'video_url', '') !~ '^https://[^ ]{8,300}$' then
    raise exception 'add the link to your recorded lesson' using errcode = 'check_violation';
  end if;
  if c.check_type = 'identity_iprs' and coalesce(d ->> 'id_number', '') !~ '^[0-9]{6,9}$' then
    raise exception 'enter your ID number as it appears on the card' using errcode = 'check_violation';
  end if;
  if c.check_type = 'tsc_lookup' and coalesce(d ->> 'tsc_number', '') !~ '^[0-9]{4,8}$' then
    raise exception 'enter your TSC number' using errcode = 'check_violation';
  end if;
  if c.check_type in ('teaching_reference', 'reference') and jsonb_array_length(coalesce(d -> 'references', '[]'::jsonb)) < 2 then
    raise exception 'add two references' using errcode = 'check_violation';
  end if;
  update public.verification_checks
     set status = 'in_review', result_summary = result_summary || jsonb_build_object('submitted', d, 'submitted_at', now())
   where id = c.id;
end
$$;

-- Reviewer decision (S4). Logged minutes, optional expiry, tier and gate recomputed.
create or replace function public.review_check(p_check uuid, p_pass boolean, p_note text, p_minutes integer, p_expires_on date default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.verification_checks%rowtype;
begin
  if not (select public.has_any_role('{reviewer,admin}')) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.verification_checks where id = p_check for update;
  if not found or c.status <> 'in_review' then
    raise exception 'this check is not waiting for review' using errcode = 'check_violation';
  end if;
  if not p_pass and (p_note is null or char_length(btrim(p_note)) < 5) then
    raise exception 'say why it did not pass; the teacher sees this' using errcode = 'check_violation';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'log the minutes spent' using errcode = 'check_violation';
  end if;
  if p_expires_on is not null and p_expires_on <= current_date then
    raise exception 'the expiry date must be in the future' using errcode = 'check_violation';
  end if;
  update public.verification_checks
     set status = case when p_pass then 'passed' else 'failed' end::public.verification_status,
         failure_reason = case when p_pass then null else left(btrim(p_note), 300) end,
         staff_minutes = staff_minutes + p_minutes, reviewer_id = auth.uid(), reviewed_at = now(),
         expires_at = case when p_pass and p_expires_on is not null then (p_expires_on::timestamp at time zone 'Africa/Nairobi') else expires_at end,
         result_summary = result_summary || jsonb_build_object('review_note', left(coalesce(btrim(p_note), ''), 500))
   where id = c.id;
  insert into public.staff_time_log (staff_user_id, subject_type, subject_id, minutes, note)
  values (auth.uid(), 'verification', c.id, p_minutes, left(coalesce(btrim(p_note), ''), 1000));
  if c.check_type = 'payout_ownership' then
    update public.teachers set payout_ownership_status = case when p_pass then 'passed' else 'failed' end where id = c.teacher_id;
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'verification.review', 'verification_checks', c.id,
          jsonb_build_object('check_type', c.check_type, 'passed', p_pass));
  perform private.recompute_tiers(c.teacher_id);
end
$$;

-- Uploads go to the teacher's own check while it is still waiting for them. The sprint 1 policy read
-- verification_checks under the teacher's row-level security, which hides checks from teachers.
create or replace function public.can_upload_to_check(p_check uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.verification_checks c
                  where c.id = p_check and c.teacher_id = public.my_teacher_id() and c.status = 'pending')
$$;
drop policy if exists verification_documents_upload_own on public.verification_documents;
create policy verification_documents_upload_own on public.verification_documents for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id()) and public.can_upload_to_check(check_id));

-- Documents: the teacher sees what was uploaded (kind and date), never storage keys.
create or replace function public.my_check_documents()
returns table (check_id uuid, kind text, uploaded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.check_id, d.kind, d.created_at from public.verification_documents d
   where d.teacher_id = (select public.my_teacher_id()) and d.deleted_at is null
   order by d.created_at
$$;

-- Reviewers list a check's documents; opening one is logged and returns the key for a signed URL.
create or replace function public.check_documents(p_check uuid)
returns table (id uuid, kind text, uploaded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_any_role('{reviewer,admin}')) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  return query select d.id, d.kind, d.created_at from public.verification_documents d
                where d.check_id = p_check and d.deleted_at is null order by d.created_at;
end
$$;

create or replace function public.open_document(p_document uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.verification_documents%rowtype;
begin
  if not (select public.has_any_role('{reviewer,admin}')) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.verification_documents where id = p_document and deleted_at is null;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'document.view', 'verification_documents', d.id, 'verification review');
  return d.storage_key;
end
$$;

-- Payout number (T4, T28): a new number starts a new ownership check and closes the gate until it passes.
create or replace function public.set_payout_number(p_phone_enc text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.my_teacher_id();
  v_id      uuid;
begin
  if v_teacher is null then
    raise exception 'apply as a teacher first' using errcode = 'check_violation';
  end if;
  if p_phone_enc is null or char_length(p_phone_enc) < 20 then
    raise exception 'payout number missing' using errcode = 'check_violation';
  end if;
  perform set_config('app.actor', 'teacher:' || auth.uid()::text, true);
  update public.teachers set payout_phone_enc = p_phone_enc, payout_ownership_status = 'pending' where id = v_teacher;
  update public.verification_checks set status = 'expired', expires_at = now()
   where teacher_id = v_teacher and check_type = 'payout_ownership' and status = 'passed';
  select id into v_id from public.verification_checks
   where teacher_id = v_teacher and check_type = 'payout_ownership' and status = 'pending' order by created_at desc limit 1;
  if v_id is null then
    insert into public.verification_checks (teacher_id, tier, check_type, attempt_no)
    values (v_teacher, 1, 'payout_ownership',
            coalesce((select max(attempt_no) from public.verification_checks where teacher_id = v_teacher and check_type = 'payout_ownership'), 0) + 1)
    returning id into v_id;
  end if;
  perform private.recompute_tiers(v_teacher);
  return v_id;
end
$$;

-- Service role: the test payout landed. The reviewer compares the M-Pesa name with the ID.
create or replace function public.record_test_payout(p_check uuid, p_amount_kes integer, p_fee_kes integer, p_provider_ref text, p_recipient_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c     public.verification_checks%rowtype;
  v_txn uuid;
  v_all integer := greatest(coalesce(p_amount_kes, 0), 0) + greatest(coalesce(p_fee_kes, 0), 0);
begin
  perform set_config('app.actor', 'system:test_payout', true);
  select * into c from public.verification_checks where id = p_check for update;
  if not found or c.check_type <> 'payout_ownership' or c.status <> 'pending' then
    return false;
  end if;
  if v_all > 0 then
    insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
    values ('test_payout', 'test-payout:' || c.id::text, 'Test payout to prove the payout number', 'system:test_payout')
    returning id into v_txn;
    insert into public.ledger_entries (txn_id, account, side, amount_kes)
    values (v_txn, 'expense_verification', 'debit', v_all), (v_txn, 'cash_provider', 'credit', v_all);
  end if;
  update public.verification_checks
     set status = 'in_review', vendor = 'paystack', vendor_ref = p_provider_ref, cost_kes = v_all,
         result_summary = result_summary || jsonb_build_object('recipient_name', left(coalesce(p_recipient_name, ''), 120),
                                                               'amount_kes', p_amount_kes, 'sent_at', now())
   where id = c.id;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Storage for verification documents (private bucket; signed URLs only)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('verification', 'verification', false)
    on conflict (id) do nothing;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.reconciliation_blocked(), private.transfer_fee(integer), private.compute_payout_batch(date, timestamptz),
  private.recompute_tiers(uuid) from public, anon, authenticated;

revoke all on function public.approve_adjustment(uuid), public.reject_adjustment(uuid, text), public.run_reconciliation(), public.compute_payout_batch(), public.approve_payout_batch(uuid),
  public.exclude_payout(uuid, text), public.cancel_payout(uuid, text), public.my_earnings(), public.start_check(text, uuid),
  public.submit_check(uuid, jsonb), public.review_check(uuid, boolean, text, integer, date), public.my_check_documents(),
  public.check_documents(uuid), public.open_document(uuid), public.set_payout_number(text), public.can_upload_to_check(uuid), public.reinstate_teacher(uuid, text) from public, anon;
grant execute on function public.approve_adjustment(uuid), public.reject_adjustment(uuid, text), public.run_reconciliation(), public.compute_payout_batch(), public.approve_payout_batch(uuid),
  public.exclude_payout(uuid, text), public.cancel_payout(uuid, text), public.my_earnings(), public.start_check(text, uuid),
  public.submit_check(uuid, jsonb), public.review_check(uuid, boolean, text, integer, date), public.my_check_documents(),
  public.check_documents(uuid), public.open_document(uuid), public.set_payout_number(text), public.can_upload_to_check(uuid), public.reinstate_teacher(uuid, text) to authenticated, service_role;

revoke all on function public.mark_payout_sending(uuid, text), public.record_payout_sent(uuid, text, integer),
  public.record_payout_failure(uuid, text), public.record_test_payout(uuid, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.mark_payout_sending(uuid, text), public.record_payout_sent(uuid, text, integer),
  public.record_payout_failure(uuid, text), public.record_test_payout(uuid, integer, integer, text, text) to service_role;

-- Teachers set their own payout number only through set_payout_number (it resets the ownership check).
revoke insert (payout_phone_enc), update (payout_phone_enc) on public.teachers from authenticated;
