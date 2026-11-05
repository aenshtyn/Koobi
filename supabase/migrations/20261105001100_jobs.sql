-- Koobi 1100: scheduled job bodies. Scheduling itself is in 1200 (pg_cron, when available).
-- Pattern: a job detects due work in SQL and writes an idempotent outbox event; the Edge Function
-- that consumes the event does the money or messaging work in its own transaction (§6.4 rule 1).
-- Every job sets app.actor = 'system:<job>' so history and audit rows name it (§2.1 System).

-- Outbox relay. TODO(edge): delivery belongs in the `outbox-relay` Edge Function, which claims rows
-- with private.outbox_claim(), calls the handler for each topic, then private.outbox_ack() or
-- private.outbox_fail(). This SQL body only returns stale claims to the queue so a crashed relay
-- never strands events; once pg_net is enabled it can also POST to the Edge Function.
create or replace function private.job_outbox_relay()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requeued integer;
begin
  perform set_config('app.actor', 'system:outbox_relay', true);
  update public.outbox
     set status = 'pending', locked_at = null, locked_by = null,
         last_error = coalesce(last_error, 'claim expired')
   where status = 'processing' and locked_at < now() - interval '5 minutes';
  get diagnostics v_requeued = row_count;
  return v_requeued;
end
$$;

-- Paid bookings the teacher has not accepted within the response window (FR-BOOK-3).
-- TODO(edge): the `booking.response_window_lapsed` handler moves the booking paid -> lapsed and posts
-- client_funds_held -> guardian_credits in one transaction, then offers the payer an alternative.
create or replace function private.job_lapse_unanswered_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours numeric := coalesce((private.param('teacher_response_window_hours') #>> '{}')::numeric, 12);
  v_count integer := 0;
  r record;
begin
  perform set_config('app.actor', 'system:lapse_unanswered_bookings', true);
  for r in
    select b.id from public.bookings b
     where b.status = 'paid' and b.paid_at < now() - make_interval(secs => v_hours * 3600)
  loop
    if private.enqueue('booking.response_window_lapsed', 'bookings', r.id,
                       jsonb_build_object('booking_id', r.id, 'window_hours', v_hours),
                       'lapse:' || r.id::text, 3) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- Sessions and seats with a filed note and no payer answer within the confirmation window (FR-SESS-4).
-- TODO(edge): the `session.auto_confirm_due` handler confirms with confirmed_by = 'auto', posts the
-- release (commission, teacher_payable, withholding) and tells the payer they can still dispute.
create or replace function private.job_auto_confirm()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours numeric := coalesce((private.param('auto_confirm_window_hours') #>> '{}')::numeric, 48);
  v_count integer := 0;
  r record;
begin
  perform set_config('app.actor', 'system:auto_confirm', true);
  for r in
    select s.id as session_id, null::uuid as attendance_id
      from public.sessions s
      join public.lesson_notes n on n.session_id = s.id
     where s.booking_id is not null
       and s.status = 'awaiting_confirmation'
       and s.checked_out_at is not null
       and n.filed_at < now() - make_interval(secs => v_hours * 3600)
    union all
    select a.session_id, a.id
      from public.attendance a
      join public.lesson_notes n on n.session_id = a.session_id
     where a.confirmed_at is null
       and a.release_status = 'held'
       and n.filed_at < now() - make_interval(secs => v_hours * 3600)
  loop
    if private.enqueue('session.auto_confirm_due', 'sessions', r.session_id,
                       jsonb_build_object('session_id', r.session_id, 'attendance_id', r.attendance_id),
                       'auto_confirm:' || r.session_id::text || ':' || coalesce(r.attendance_id::text, 'pair'), 3) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- Weekly payout batch (FR-PAYOUT-1). TODO(edge): the `payout.batch_due` handler computes each
-- teacher's teacher_payable balance before the cut-off, applies the threshold and exclusions
-- (KRA PIN, payout ownership, holds), creates payout_batches/payouts/payout_lines for Finance approval.
-- It must not run while reconciliation has unresolved findings older than 24 hours (§9.7 rule 9).
create or replace function private.job_weekly_payout_batch()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Africa/Nairobi')::date;
  v_blocked boolean;
begin
  perform set_config('app.actor', 'system:weekly_payout_batch', true);
  select exists (select 1 from public.reconciliation_runs rr
                  where rr.status = 'failed' and rr.created_at < now() - interval '24 hours'
                    and rr.run_on = (select max(x.run_on) from public.reconciliation_runs x))
    into v_blocked;
  if v_blocked then
    perform private.enqueue('payout.batch_blocked', 'payout_batches', null,
                            jsonb_build_object('week_start', v_week), 'payout-blocked:' || v_week::text, 5);
    return null;
  end if;
  return private.enqueue('payout.batch_due', 'payout_batches', null,
                         jsonb_build_object('week_start', v_week,
                                            'threshold_kes', coalesce((private.param('payout_min_threshold_kes') #>> '{}')::integer, 500)),
                         'payout-batch:' || v_week::text, 3);
end
$$;

-- Daily reconciliation (FR-LEDGER-6). Runs the invariants the database can check by itself and records
-- the result; provider settlement and balance comparisons need the provider API.
-- TODO(edge): the `reconciliation.provider_check` handler compares provider settlement reports and
-- balances with payments, payouts and cash_provider, and appends its findings.
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

  -- every succeeded payment has exactly one hold journal
  for r in
    select p.id, count(distinct t.id) as holds
      from public.payments p
      left join public.ledger_entries e on e.payment_id = p.id
      left join public.ledger_transactions t on t.id = e.txn_id and t.kind = 'payment_hold'
     where p.status = 'succeeded'
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

  -- every released present seat has exactly one entitlement line
  for r in
    select a.id, count(e.id) as lines
      from public.attendance a
      left join public.ledger_entries e on e.attendance_id = a.id and e.account = 'teacher_payable' and e.side = 'credit'
     where a.release_status = 'released' and a.status in ('present', 'late')
     group by a.id
    having count(e.id) <> 1
  loop
    v_findings := v_findings || jsonb_build_object('check', 'seat_has_one_entitlement', 'attendance_id', r.id, 'lines', r.lines);
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

-- Founding-member waitlist release (FR-OFF-5): on each track whose dated parameter
-- marketing_start_date has arrived, waitlisted teachers are released. The transition trigger writes
-- state_history and the `waitlist.released` outbox event; the handler notifies the teacher.
create or replace function private.job_release_waitlist()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_count integer;
  r record;
begin
  perform set_config('app.actor', 'system:release_waitlist', true);
  for r in select tr.code from public.tracks tr where tr.is_active loop
    if (private.param('marketing_start_date', r.code) #>> '{}')::date <= (now() at time zone 'Africa/Nairobi')::date then
      update public.teacher_tracks
         set waitlist_status = 'released', released_at = now()
       where track = r.code and waitlist_status = 'waitlisted';
      get diagnostics v_count = row_count;
      v_total := v_total + v_count;
    end if;
  end loop;
  return v_total;
end
$$;

revoke all on function private.job_outbox_relay(), private.job_lapse_unanswered_bookings(), private.job_auto_confirm(),
                       private.job_weekly_payout_batch(), private.job_daily_reconciliation(), private.job_release_waitlist()
  from public, anon, authenticated;
grant execute on function private.job_outbox_relay(), private.job_lapse_unanswered_bookings(), private.job_auto_confirm(),
                          private.job_weekly_payout_batch(), private.job_daily_reconciliation(), private.job_release_waitlist()
  to service_role;
