-- Koobi sprint 5: the lesson happens and the money moves (PRD §3.7, §3.9, FR-SESS-2..4, FR-BOOK-8, FR-COMM-1..4,
-- FR-LEDGER-2..3, FR-REV-1, FR-DISP-1..4, FR-PAY-6).
--
-- Every function checks its caller. Money is posted only here, in one transaction with the state change,
-- with an idempotency key per journal. Rates and windows come from the dated parameters table and the
-- rate applied is stored on each ledger entry.

-- Transitions the sprint 4 tables lacked: an exception granted after a learner no-show refunds instead.
insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  ('booking', 'no_show_learner', 'cancelled', '{system}', 'exception granted after a learner no-show [added]'),
  ('session', 'no_show_learner', 'cancelled', '{system}', 'exception granted after a learner no-show [added]')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Parameters
-- ---------------------------------------------------------------------------
create or replace function private.num_param(p_key text, p_default numeric, p_format text default null, p_mode text default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.param(p_key, null, p_format, p_mode) #>> '{}')::numeric, p_default)
$$;

-- Commission rate for a booking (FR-COMM-1, -2, -4, -6). Online one-to-one slides with the pair's
-- confirmed paid hours before this booking; in person stays at the opening rate outside the managed plan.
create or replace function private.commission_rate(p_booking uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b       public.bookings%rowtype;
  o       public.offerings%rowtype;
  v_param jsonb;
  v_hours numeric;
  v_rate  numeric := 0.20;
  t       jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  select * into o from public.offerings where id = b.offering_id;
  if b.kind = 'trial' then
    return private.num_param('commission_rate_trial', 0, 'one_to_one');
  end if;
  v_param := private.param('commission_rate', null, o.format, case when o.format = 'one_to_one' then b.mode end);
  if v_param is null then
    return 0.20;
  end if;
  if v_param ->> 'basis' = 'flat' then
    return (v_param ->> 'rate')::numeric;
  elsif v_param ->> 'basis' = 'in_person_pair' then
    return case when b.kind = 'managed_plan_session' then (v_param ->> 'managed_plan_rate')::numeric
                else coalesce((v_param ->> 'ad_hoc_after_first_month_rate')::numeric, (v_param ->> 'first_month_rate')::numeric) end;
  elsif v_param ->> 'basis' = 'pair_paid_hours' then
    select coalesce(sum(x.duration_minutes), 0) / 60.0 into v_hours
      from public.bookings x
     where x.teacher_id = b.teacher_id and x.learner_id = b.learner_id and x.id <> b.id
       and x.status = 'confirmed' and x.kind <> 'trial' and x.starts_at < b.starts_at;
    for t in select * from jsonb_array_elements(v_param -> 'tiers') loop
      if v_hours >= (t ->> 'from_paid_hours')::numeric then
        v_rate := (t ->> 'rate')::numeric;
      end if;
    end loop;
    return v_rate;
  end if;
  return 0.20;
end
$$;

-- ---------------------------------------------------------------------------
-- Ledger postings
-- ---------------------------------------------------------------------------
-- Release a booking's hold to the teacher (FR-LEDGER-2). p_amount: release only this much of the hold
-- (a partial refund credits the rest separately). p_final: the booking's final state.
create or replace function private.release_booking(p_booking uuid, p_by text, p_amount integer default null,
                                                   p_final public.booking_status default 'confirmed')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b        public.bookings%rowtype;
  p        public.payments%rowtype;
  v_owner  uuid;
  v_rate   numeric;
  v_wrate  numeric := private.num_param('withholding_rate', 0.05);
  v_vat    boolean := coalesce((private.param('vat_registered') #>> '{}')::boolean, false);
  v_vrate  numeric := private.num_param('vat_rate', 0.16);
  v_held   integer;
  v_p      integer;
  v_c      integer;
  v_g      integer;
  v_w      integer;
  v_r      integer;
  v_txn    uuid;
  v_kind   text;
begin
  select * into b from public.bookings where id = p_booking for update;
  select * into p from public.payments where booking_id = b.id and status in ('succeeded', 'partially_refunded') order by succeeded_at desc limit 1 for update;
  if not found or p.hold_status <> 'held' then
    raise exception 'booking % has no held payment to release', p_booking using errcode = 'check_violation';
  end if;
  select user_id into v_owner from public.teachers where id = b.teacher_id;
  v_rate := private.commission_rate(b.id);
  v_held := p.amount_kes;
  v_kind := case when b.kind = 'trial' then 'trial_release' else 'session_release' end;

  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values (v_kind, 'release:' || b.id::text,
          case when p_final = 'cancelled' then 'Late cancellation released to the teacher' else 'Lesson confirmed' end,
          'system:' || p_by)
  returning id into v_txn;

  if b.kind = 'trial' and p_amount is null and p_final = 'confirmed' then
    -- Trial (FR-COMM-4): the learner paid T, the teacher earns the full rate R with no commission.
    -- A late-cancelled trial releases only what was paid (commission on trials is zero).
    v_r := b.price_kes;
    v_w := round(v_r * v_wrate)::integer;
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id, commission_rate, withholding_rate)
    values (v_txn, 'client_funds_held', 'debit', v_held, p.id, b.id, p.payer_user_id, 0, v_wrate),
           (v_txn, 'teacher_payable', 'credit', v_r - v_w, p.id, b.id, v_owner, 0, v_wrate);
    if v_r - v_held > 0 then
      insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, commission_rate)
      values (v_txn, 'expense_trial_subsidy', 'debit', v_r - v_held, p.id, b.id, 0);
    end if;
    if v_w > 0 then
      insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id, withholding_rate)
      values (v_txn, 'withholding_payable', 'credit', v_w, p.id, b.id, v_owner, v_wrate);
    end if;
    v_c := 0;
  else
    v_p := coalesce(p_amount, v_held);
    if v_p <= 0 or v_p > v_held then
      raise exception 'release amount % is outside the hold %', v_p, v_held using errcode = 'check_violation';
    end if;
    v_c := round(v_p * v_rate)::integer;
    v_g := v_p - v_c;
    v_w := round(v_g * v_wrate)::integer;
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id, commission_rate, withholding_rate)
    values (v_txn, 'client_funds_held', 'debit', v_p, p.id, b.id, p.payer_user_id, v_rate, v_wrate),
           (v_txn, 'teacher_payable', 'credit', v_g - v_w, p.id, b.id, v_owner, v_rate, v_wrate);
    if v_c > 0 then
      insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, commission_rate)
      values (v_txn, 'revenue_commission', 'credit', v_c, p.id, b.id, v_rate);
    end if;
    if v_w > 0 then
      insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id, withholding_rate)
      values (v_txn, 'withholding_payable', 'credit', v_w, p.id, b.id, v_owner, v_wrate);
    end if;
  end if;

  if v_vat and v_c > 0 and round(v_c * v_vrate)::integer > 0 then
    insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
    values ('vat_on_fee', 'vat:' || b.id::text, 'VAT on the platform fee', 'system:' || p_by)
    returning id into v_txn;
    insert into public.ledger_entries (txn_id, account, side, amount_kes, booking_id, vat_rate)
    values (v_txn, 'revenue_commission', 'debit', round(v_c * v_vrate)::integer, b.id, v_vrate),
           (v_txn, 'vat_payable', 'credit', round(v_c * v_vrate)::integer, b.id, v_vrate);
  end if;

  update public.payments set hold_status = 'released' where id = p.id;
  update public.bookings set status = p_final, cancelled_by_role = case when p_final = 'cancelled' then coalesce(cancelled_by_role, 'payer') end
   where id = b.id and status <> p_final;
  update public.sessions
     set status = case when p_final = 'cancelled' then 'cancelled'::public.session_status else 'confirmed'::public.session_status end,
         confirmed_at = case when p_final = 'confirmed' then now() else confirmed_at end,
         confirmed_by = case when p_final = 'confirmed' then case when p_by in ('payer', 'auto', 'staff') then p_by else 'staff' end end
   where booking_id = b.id and status not in ('confirmed', 'cancelled');
end
$$;

-- Move all or part of a booking's hold to the payer's credit (FR-PAY-6: credit by default).
create or replace function private.credit_booking(p_booking uuid, p_by text, p_rule text, p_amount integer default null,
                                                  p_final public.booking_status default 'cancelled')
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b     public.bookings%rowtype;
  p     public.payments%rowtype;
  v_amt integer;
  v_txn uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  select * into p from public.payments where booking_id = b.id and status = 'succeeded' and hold_status = 'held' for update;
  if not found then
    raise exception 'booking % has no held payment to credit', p_booking using errcode = 'check_violation';
  end if;
  v_amt := coalesce(p_amount, p.amount_kes);
  if v_amt <= 0 or v_amt > p.amount_kes then
    raise exception 'credit amount % is outside the hold %', v_amt, p.amount_kes using errcode = 'check_violation';
  end if;
  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values ('cancel_to_credit', case when p_amount is null then 'credit:' else 'partial-credit:' end || b.id::text, p_rule, 'system:' || p_by)
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id)
  values (v_txn, 'client_funds_held', 'debit', v_amt, p.id, b.id, p.payer_user_id),
         (v_txn, 'guardian_credits', 'credit', v_amt, p.id, b.id, p.payer_user_id);
  if p_amount is null then
    update public.payments set hold_status = 'credited' where id = p.id;
    update public.bookings
       set status = p_final, cancelled_by_role = coalesce(cancelled_by_role, case when p_by = 'payer' then 'payer'
                                                                                 when p_by = 'teacher' then 'teacher'
                                                                                 when p_by = 'staff' then 'staff' else 'system' end),
           cancellation_rule = left(p_rule, 300)
     where id = b.id and status <> p_final;
    update public.sessions set status = 'cancelled' where booking_id = b.id and status not in ('confirmed', 'cancelled');
  end if;
  return v_amt;
end
$$;

-- ---------------------------------------------------------------------------
-- Lesson day: check in, check out, note, absence (FR-SESS-2, FR-SESS-3)
-- ---------------------------------------------------------------------------
create or replace function private.my_session(p_session uuid)
returns public.sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session;
  if not found or not public.is_session_teacher(s.id) then
    raise exception 'not your lesson' using errcode = 'insufficient_privilege';
  end if;
  return s;
end
$$;

create or replace function public.teacher_check_in(p_session uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype := private.my_session(p_session);
begin
  if s.status <> 'scheduled' then
    raise exception 'this lesson is %, not waiting to start', s.status using errcode = 'check_violation';
  end if;
  if now() < s.starts_at - interval '10 minutes' then
    raise exception 'check-in opens 10 minutes before the start' using errcode = 'check_violation';
  end if;
  if now() > s.ends_at + interval '2 hours' then
    raise exception 'this lesson has ended; contact the concierge' using errcode = 'check_violation';
  end if;
  perform set_config('app.actor', 'teacher:' || auth.uid()::text, true);
  update public.sessions set status = 'in_progress', checked_in_at = now(), checkin_method = 'manual' where id = s.id;
  update public.bookings set status = 'in_progress' where id = s.booking_id and status = 'scheduled';
end
$$;

create or replace function public.teacher_check_out(p_session uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype := private.my_session(p_session);
begin
  if s.status <> 'in_progress' then
    raise exception 'check in first' using errcode = 'check_violation';
  end if;
  perform set_config('app.actor', 'teacher:' || auth.uid()::text, true);
  update public.sessions
     set status = 'awaiting_note', checked_out_at = now(),
         actual_minutes = greatest(1, round(extract(epoch from now() - s.checked_in_at) / 60)::integer)
   where id = s.id;
  update public.bookings set status = 'awaiting_note' where id = s.booking_id and status = 'in_progress';
end
$$;

create or replace function public.file_lesson_note(p_session uuid, p_covered text, p_progress text, p_next text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype := private.my_session(p_session);
begin
  if s.status <> 'awaiting_note' then
    raise exception 'the note is filed after check-out' using errcode = 'check_violation';
  end if;
  if p_covered is null or char_length(btrim(p_covered)) < 10 then
    raise exception 'say what you covered (at least 10 characters)' using errcode = 'check_violation';
  end if;
  insert into public.lesson_notes (session_id, covered, progress, next_steps, filed_by)
  values (s.id, btrim(p_covered), nullif(btrim(p_progress), ''), nullif(btrim(p_next), ''), auth.uid());
  perform set_config('app.actor', 'teacher:' || auth.uid()::text, true);
  update public.sessions set status = 'awaiting_confirmation' where id = s.id;
  update public.bookings set status = 'awaiting_confirmation' where id = s.booking_id and status = 'awaiting_note';
end
$$;

create or replace function public.report_learner_absent(p_session uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s       public.sessions%rowtype := private.my_session(p_session);
  v_grace numeric := private.num_param('grace_period_minutes', 15);
begin
  if s.status <> 'in_progress' then
    raise exception 'check in first, then wait for the grace period' using errcode = 'check_violation';
  end if;
  if now() < s.starts_at + make_interval(mins => v_grace::integer) then
    raise exception 'wait % minutes after the start before reporting an absence', v_grace using errcode = 'check_violation';
  end if;
  update public.sessions set status = 'no_show_learner', checked_out_at = now() where id = s.id;
  update public.bookings set status = 'no_show_learner' where id = s.booking_id and status = 'in_progress';
end
$$;

-- ---------------------------------------------------------------------------
-- The payer's side: confirm, cancel, dispute, replacement (FR-SESS-4, FR-BOOK-8, FR-DISP-1, FR-DISP-4)
-- ---------------------------------------------------------------------------
create or replace function private.my_paid_booking(p_booking uuid)
returns public.bookings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or not public.is_booking_payer(b.id) then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  return b;
end
$$;

create or replace function public.confirm_lesson(p_booking uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype := private.my_paid_booking(p_booking);
begin
  if b.status <> 'awaiting_confirmation' then
    raise exception 'this lesson is %, nothing to confirm', b.status using errcode = 'check_violation';
  end if;
  perform private.release_booking(b.id, 'payer');
end
$$;

-- Returns what happened: 'cancelled' (nothing paid), 'credited' (24 h or more ahead), 'released' (late).
create or replace function public.cancel_booking(p_booking uuid, p_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b        public.bookings%rowtype := private.my_paid_booking(p_booking);
  v_window numeric := private.num_param('cancellation_window_hours', 24);
begin
  if b.status in ('requested', 'awaiting_payment') then
    update public.bookings set status = 'cancelled', cancelled_by_role = 'payer', cancellation_rule = 'Cancelled before payment' where id = b.id;
    return 'cancelled';
  end if;
  if b.status not in ('paid', 'accepted', 'scheduled') then
    raise exception 'a % lesson cannot be cancelled here; report a problem instead', b.status using errcode = 'check_violation';
  end if;
  update public.bookings set cancelled_by_role = 'payer' where id = b.id;
  if b.status = 'paid' then
    perform private.credit_booking(b.id, 'payer', 'Learner cancelled before the teacher accepted: full credit');
    return 'credited';
  end if;
  if b.starts_at - now() >= make_interval(hours => v_window::integer) then
    perform private.credit_booking(b.id, 'payer',
      'Learner cancelled ' || round(extract(epoch from b.starts_at - now()) / 3600) || ' hours ahead: full credit'
      || coalesce(' (' || left(btrim(p_reason), 120) || ')', ''));
    return 'credited';
  end if;
  update public.bookings set cancellation_rule = 'Learner cancelled inside ' || v_window || ' hours: released to the teacher' where id = b.id;
  perform private.release_booking(b.id, 'payer', null, 'cancelled');
  return 'released';
end
$$;

create or replace function public.teacher_cancel_booking(p_booking uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.teacher_id is distinct from (select public.my_teacher_id()) then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  if b.status not in ('accepted', 'scheduled') then
    raise exception 'a % booking cannot be cancelled here', b.status using errcode = 'check_violation';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'tell the learner briefly why' using errcode = 'check_violation';
  end if;
  update public.bookings set cancelled_by_role = 'teacher' where id = b.id;
  perform private.credit_booking(b.id, 'teacher', 'Teacher cancelled: ' || left(btrim(p_reason), 200));
  -- FR-BOOK-9: reliability is counted from these rows (cancelled_by_role = 'teacher').
end
$$;

create or replace function public.open_dispute(p_booking uuid, p_type public.dispute_type, p_description text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b       public.bookings%rowtype := private.my_paid_booking(p_booking);
  v_sess  uuid;
  v_id    uuid;
  v_grace numeric := private.num_param('grace_period_minutes', 15);
begin
  if p_description is null or char_length(btrim(p_description)) < 10 then
    raise exception 'describe what happened (at least 10 characters)' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.disputes d where d.booking_id = b.id and d.status not in ('resolved', 'closed')) then
    raise exception 'a problem is already open on this lesson' using errcode = 'check_violation';
  end if;
  select id into v_sess from public.sessions where booking_id = b.id limit 1;
  if b.status = 'awaiting_confirmation' then
    update public.sessions set status = 'disputed' where id = v_sess;
    update public.bookings set status = 'disputed' where id = b.id;
  elsif b.status = 'no_show_learner' then
    null;  -- exception request: the hold stays until the concierge decides
  elsif b.status = 'scheduled' and p_type = 'teacher_no_show' then
    if now() < b.starts_at + make_interval(mins => v_grace::integer) then
      raise exception 'wait % minutes after the start before reporting the teacher absent', v_grace using errcode = 'check_violation';
    end if;
  else
    raise exception 'you can report a problem after the lesson, or a teacher no-show after the grace period' using errcode = 'check_violation';
  end if;
  insert into public.disputes (booking_id, session_id, opened_by_user_id, opened_by_role, type, description)
  values (b.id, v_sess, auth.uid(), 'payer', p_type, left(btrim(p_description), 2000))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.request_replacement(p_booking uuid, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b  public.bookings%rowtype := private.my_paid_booking(p_booking);
  o  public.offerings%rowtype;
  r  public.requests%rowtype;
  v_id uuid;
begin
  select * into o from public.offerings where id = b.offering_id;
  select * into r from public.requests where id = (select m.request_id from public.matches m where m.id = b.match_id);
  insert into public.requests (requester_id, learner_id, category, track, subject, goal, mode, budget_max_kes,
                               schedule_notes, notes, is_replacement_for_booking_id)
  values (auth.uid(), b.learner_id, o.category, o.track,
          coalesce(r.subject, o.subject_text, o.title), coalesce(r.goal, o.title),
          coalesce(r.mode, b.mode), r.budget_max_kes, r.schedule_notes,
          left('Replacement requested: ' || coalesce(btrim(p_note), ''), 500), b.id)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Staff: resolve a dispute (FR-DISP-3). Outcomes post the matching ledger entries.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_dispute(p_dispute uuid, p_outcome public.dispute_outcome, p_credit_kes integer,
                                                  p_note text, p_minutes integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d      public.disputes%rowtype;
  b      public.bookings%rowtype;
  p      public.payments%rowtype;
  v_cred integer := 0;
begin
  if not (select public.has_any_role('{concierge,finance,admin}')) then
    raise exception 'staff only' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 10 then
    raise exception 'write the reason both sides will see (at least 10 characters)' using errcode = 'check_violation';
  end if;
  if p_minutes is null or p_minutes < 1 then
    raise exception 'log the minutes spent' using errcode = 'check_violation';
  end if;
  select * into d from public.disputes where id = p_dispute for update;
  if not found or d.status not in ('open', 'in_review', 'reopened', 'awaiting_party') then
    raise exception 'this dispute is not open' using errcode = 'check_violation';
  end if;
  select * into b from public.bookings where id = d.booking_id for update;
  select * into p from public.payments where booking_id = b.id and status = 'succeeded' and hold_status = 'held';

  if d.status in ('open', 'reopened', 'awaiting_party') then
    update public.disputes set status = 'in_review' where id = d.id;
  end if;

  if p_outcome in ('release', 'dismissed') then
    if b.status not in ('disputed', 'no_show_learner', 'awaiting_confirmation') then
      raise exception 'release needs a lesson that took place (booking is %)', b.status using errcode = 'check_violation';
    end if;
    perform private.release_booking(b.id, 'staff');
  elsif p_outcome = 'partial_refund' then
    if b.kind = 'trial' then
      raise exception 'trials are released or credited in full' using errcode = 'check_violation';
    end if;
    if p_credit_kes is null or p_credit_kes <= 0 or p_credit_kes >= p.amount_kes then
      raise exception 'a partial refund is between 1 and % shillings', p.amount_kes - 1 using errcode = 'check_violation';
    end if;
    v_cred := private.credit_booking(b.id, 'staff', 'Dispute: partial credit', p_credit_kes);
    perform private.release_booking(b.id, 'staff', p.amount_kes - p_credit_kes);
  elsif p_outcome in ('credit', 'full_refund', 'teacher_penalty', 'replacement') then
    if d.type = 'teacher_no_show' and b.status = 'scheduled' then
      -- FR-BOOK-9: the reliability count reads these rows.
      update public.sessions set status = 'no_show_teacher' where booking_id = b.id and status = 'scheduled';
      update public.bookings set status = 'no_show_teacher', cancelled_by_role = 'teacher' where id = b.id;
    end if;
    v_cred := private.credit_booking(b.id, 'staff', 'Dispute: ' || p_outcome::text);
    if p_outcome = 'full_refund' then
      insert into public.refunds (payment_id, booking_id, dispute_id, amount_kes, method, reason, requested_by)
      values (p.id, b.id, d.id, v_cred, 'provider_refund', 'Dispute outcome: full refund', auth.uid());
    end if;
  end if;

  insert into public.staff_time_log (staff_user_id, subject_type, subject_id, minutes, note)
  values (auth.uid(), 'dispute', d.id, p_minutes, left(btrim(p_note), 1000));
  update public.disputes
     set status = 'resolved', outcome = p_outcome, credit_kes = v_cred,
         refund_kes = case when p_outcome = 'full_refund' then v_cred else 0 end,
         staff_minutes = staff_minutes + p_minutes, handled_by = auth.uid(), resolved_at = now(),
         evidence_snapshot = evidence_snapshot || jsonb_build_object('resolution_note', left(btrim(p_note), 1000))
   where id = d.id;
end
$$;

-- ---------------------------------------------------------------------------
-- Credits back to M-Pesa (FR-PAY-6)
-- ---------------------------------------------------------------------------
-- The payer asks for a cash refund of a credited payment. Finance executes it from the refunds queue.
create or replace function public.request_credit_refund(p_payment uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p     public.payments%rowtype;
  v_amt integer;
  v_id  uuid;
begin
  select * into p from public.payments where id = p_payment;
  if not found or p.payer_user_id is distinct from auth.uid() then
    raise exception 'not your payment' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end), 0)::integer into v_amt
    from public.ledger_entries e where e.payment_id = p.id and e.account = 'guardian_credits';
  v_amt := v_amt - coalesce((select sum(r.amount_kes) from public.refunds r where r.payment_id = p.id and r.status in ('requested', 'approved', 'pending')), 0)::integer;
  if v_amt <= 0 then
    raise exception 'there is no credit left on this payment to refund' using errcode = 'check_violation';
  end if;
  insert into public.refunds (payment_id, booking_id, amount_kes, method, reason, requested_by)
  values (p.id, p.booking_id, v_amt, case when p.method = 'credit' then 'transfer' else 'provider_refund' end,
          'Payer asked for their credit back to M-Pesa', auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- Service role, after the provider confirms the refund: post the cash refund journal.
create or replace function public.record_refund_success(p_refund uuid, p_provider_ref text, p_fee_kes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r      public.refunds%rowtype;
  p      public.payments%rowtype;
  v_fee  integer := greatest(coalesce(p_fee_kes, 0), 0);
  v_txn  uuid;
  v_done integer;
begin
  perform set_config('app.actor', 'system:refund', true);
  select * into r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'refund % not found', p_refund using errcode = 'no_data_found';
  end if;
  if r.status = 'succeeded' then
    return false;
  end if;
  if r.status not in ('approved', 'pending') then
    raise exception 'refund % is %, approve it first', r.id, r.status using errcode = 'check_violation';
  end if;
  select * into p from public.payments where id = r.payment_id for update;
  if r.status = 'approved' then
    update public.refunds set status = 'pending' where id = r.id;
  end if;
  update public.refunds set status = 'succeeded', provider_ref = coalesce(p_provider_ref, provider_ref), fee_kes = v_fee, completed_at = now() where id = r.id;
  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values ('cash_refund', 'refund:' || r.id::text, 'Refund ' || r.platform_ref || ' to M-Pesa', 'system:refund')
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, refund_id, counterparty_user_id)
  values (v_txn, 'guardian_credits', 'debit', r.amount_kes, p.id, r.booking_id, r.id, p.payer_user_id),
         (v_txn, 'cash_provider', 'credit', r.amount_kes + v_fee, p.id, r.booking_id, r.id, null);
  if v_fee > 0 then
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, refund_id)
    values (v_txn, 'expense_payment_fees', 'debit', v_fee, p.id, r.booking_id, r.id);
  end if;
  select coalesce(sum(amount_kes), 0)::integer into v_done from public.refunds where payment_id = p.id and status = 'succeeded';
  update public.payments set status = case when v_done >= p.amount_kes then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
   where id = p.id and status in ('succeeded', 'partially_refunded');
  return true;
end
$$;

-- Service role: the refund was sent to the provider (approved -> pending), or the provider refused it.
create or replace function public.mark_refund_pending(p_refund uuid, p_provider_ref text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', 'system:refund', true);
  update public.refunds set status = 'pending', provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_refund and status in ('approved', 'failed');
end
$$;

create or replace function public.record_refund_failure(p_refund uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', 'system:refund', true);
  update public.refunds set status = 'pending' where id = p_refund and status = 'approved';
  update public.refunds set status = 'failed', reason = left(reason || ' | failed: ' || coalesce(p_reason, 'unknown'), 1000)
   where id = p_refund and status = 'pending';
end
$$;

-- ---------------------------------------------------------------------------
-- Paying with credit (FR-PAY-6). Credit is spent oldest first, against the payments it came from,
-- so each payment's remaining credit (and what can still go back to M-Pesa) stays exact.
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('paystack', 'intasend', 'flutterwave', 'daraja', 'koobi_credit'));
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('mpesa_stk', 'card', 'payment_link', 'credit'));

-- Spendable credit: the ledger balance less refunds already on their way.
create or replace function private.spendable_credit(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce((select sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end)
                      from public.ledger_entries e
                     where e.account = 'guardian_credits' and e.counterparty_user_id = p_user), 0)
        - coalesce((select sum(r.amount_kes) from public.refunds r join public.payments p on p.id = r.payment_id
                     where p.payer_user_id = p_user and r.status in ('requested', 'approved', 'pending')), 0))::integer
$$;

create or replace function public.pay_with_credit(p_booking uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b        public.bookings%rowtype := private.my_paid_booking(p_booking);
  v_me     uuid := auth.uid();
  v_amount integer;
  v_left   integer;
  v_take   integer;
  v_pay    uuid;
  v_ref    text;
  v_txn    uuid;
  v_owner  uuid;
  src      record;
begin
  perform pg_advisory_xact_lock(hashtext('credit:' || v_me::text));
  if b.status = 'requested' then
    update public.bookings set status = 'awaiting_payment' where id = b.id;
  elsif b.status <> 'awaiting_payment' then
    raise exception 'this booking is already paid or closed' using errcode = 'check_violation';
  end if;
  v_amount := b.price_kes - b.discount_kes;
  if private.spendable_credit(v_me) < v_amount then
    raise exception 'not enough credit for this lesson' using errcode = 'check_violation';
  end if;

  perform set_config('app.actor', 'system:credit', true);
  insert into public.payments (payer_user_id, booking_id, provider, method, amount_kes, status)
  values (v_me, b.id, 'koobi_credit', 'credit', v_amount, 'initiated')
  returning id, platform_ref into v_pay, v_ref;
  update public.payments set status = 'pending' where id = v_pay;
  update public.payments set status = 'succeeded', hold_status = 'held', provider_ref = v_ref, settled_kes = 0, verified_at = now() where id = v_pay;

  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values ('payment_hold', 'hold:' || v_pay::text, 'Credit used for ' || v_ref || ', held until the lesson happens', 'system:credit')
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id)
  values (v_txn, 'client_funds_held', 'credit', v_amount, v_pay, b.id, v_me);
  v_left := v_amount;
  for src in
    select e.payment_id, sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end)::integer
             - coalesce((select sum(r.amount_kes) from public.refunds r where r.payment_id = e.payment_id and r.status in ('requested', 'approved', 'pending')), 0)::integer as available,
           min(t.posted_at) first_at
      from public.ledger_entries e
      join public.ledger_transactions t on t.id = e.txn_id
     where e.account = 'guardian_credits' and e.counterparty_user_id = v_me
     group by e.payment_id
     order by first_at, e.payment_id
  loop
    exit when v_left = 0;
    continue when src.available <= 0;
    v_take := least(src.available, v_left);
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id)
    values (v_txn, 'guardian_credits', 'debit', v_take, src.payment_id, b.id, v_me);
    v_left := v_left - v_take;
  end loop;
  if v_left <> 0 then
    raise exception 'credit allocation left % unallocated', v_left using errcode = 'check_violation';
  end if;

  update public.bookings set status = 'paid' where id = b.id;
  select t.user_id into v_owner from public.teachers t where t.id = b.teacher_id;
  update public.message_threads th
     set contact_revealed_at = coalesce(th.contact_revealed_at, now())
   where th.kind = 'pair'
     and exists (select 1 from public.thread_participants a where a.thread_id = th.id and a.user_id = v_me)
     and exists (select 1 from public.thread_participants x where x.thread_id = th.id and x.user_id = v_owner);
  return v_pay;
end
$$;

-- ---------------------------------------------------------------------------
-- Auto-confirm (FR-SESS-4): no answer from the payer within the window releases the lesson; a learner
-- no-show releases under the rule unless an exception request is open.
-- ---------------------------------------------------------------------------
create or replace function private.job_auto_confirm()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours numeric := private.num_param('auto_confirm_window_hours', 48);
  v_count integer := 0;
  r record;
begin
  perform set_config('app.actor', 'system:auto_confirm', true);
  for r in
    select b.id
      from public.bookings b
      join public.sessions s on s.booking_id = b.id
      left join public.lesson_notes n on n.session_id = s.id
     where (b.status = 'awaiting_confirmation' and n.filed_at < now() - make_interval(secs => v_hours * 3600))
        or (b.status = 'no_show_learner' and s.checked_out_at < now() - make_interval(secs => v_hours * 3600)
            and not exists (select 1 from public.disputes d where d.booking_id = b.id and d.status not in ('resolved', 'closed')))
  loop
    perform private.release_booking(r.id, 'auto');
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Reads for the lesson screens
-- ---------------------------------------------------------------------------
-- The caller's credit balance (payer side of guardian_credits).
create or replace function public.my_credit_balance()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when side = 'credit' then amount_kes else -amount_kes end), 0)::integer
    from public.ledger_entries
   where account = 'guardian_credits' and counterparty_user_id = (select auth.uid())
$$;

-- The payer's bookings, now with the learner id for the progress timeline (L14).
drop function if exists public.my_bookings();
create function public.my_bookings()
returns table (
  id uuid, offering_id uuid, slug text, title text, teacher_name text, kind public.booking_kind, mode text,
  starts_at timestamptz, duration_minutes integer, price_kes integer, discount_kes integer, status public.booking_status,
  paid_at timestamptz, accepted_at timestamptz, meeting_link text, learner_alias text, policy_version text, created_at timestamptz,
  learner_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.offering_id, o.slug, o.title, t.display_name, b.kind, b.mode, b.starts_at, b.duration_minutes,
         b.price_kes, b.discount_kes, b.status, b.paid_at, b.accepted_at,
         case when b.status in ('scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation') then b.meeting_link_enc end,
         l.alias, b.policy_version, b.created_at, b.learner_id
    from public.bookings b
    join public.offerings o on o.id = b.offering_id
    join public.teachers t on t.id = b.teacher_id
    join public.learners l on l.id = b.learner_id
   where b.booked_by_user_id = (select auth.uid()) or public.owns_learner(b.learner_id)
   order by b.starts_at desc
$$;
revoke all on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated, service_role;

-- Credit by payment, for the credits screen: what is left, what is on its way back, what came back.
create or replace function public.my_credit_lines()
returns table (payment_id uuid, platform_ref text, booking_id uuid, title text, credit_kes integer,
               open_refund_kes integer, refunded_kes integer, last_refund_status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.platform_ref, p.booking_id, o.title,
         (select coalesce(sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end), 0)::integer
            from public.ledger_entries e where e.payment_id = p.id and e.account = 'guardian_credits'),
         (select coalesce(sum(r.amount_kes), 0)::integer from public.refunds r
           where r.payment_id = p.id and r.status in ('requested', 'approved', 'pending')),
         (select coalesce(sum(r.amount_kes), 0)::integer from public.refunds r where r.payment_id = p.id and r.status = 'succeeded'),
         (select r.status from public.refunds r where r.payment_id = p.id order by r.created_at desc limit 1),
         greatest(p.updated_at, (select max(r.updated_at) from public.refunds r where r.payment_id = p.id))
    from public.payments p
    left join public.bookings b on b.id = p.booking_id
    left join public.offerings o on o.id = b.offering_id
   where p.payer_user_id = (select auth.uid())
     and exists (select 1 from public.ledger_entries e where e.payment_id = p.id and e.account = 'guardian_credits')
   order by 9 desc nulls last
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.num_param(text, numeric, text, text), private.commission_rate(uuid),
  private.release_booking(uuid, text, integer, public.booking_status), private.credit_booking(uuid, text, text, integer, public.booking_status),
  private.my_session(uuid), private.my_paid_booking(uuid), private.spendable_credit(uuid) from public, anon, authenticated;
revoke all on function public.teacher_check_in(uuid), public.teacher_check_out(uuid), public.file_lesson_note(uuid, text, text, text),
  public.report_learner_absent(uuid), public.confirm_lesson(uuid), public.cancel_booking(uuid, text),
  public.teacher_cancel_booking(uuid, text), public.open_dispute(uuid, public.dispute_type, text), public.request_replacement(uuid, text),
  public.resolve_dispute(uuid, public.dispute_outcome, integer, text, integer), public.request_credit_refund(uuid),
  public.my_credit_balance(), public.my_credit_lines(), public.pay_with_credit(uuid) from public, anon;
grant execute on function public.teacher_check_in(uuid), public.teacher_check_out(uuid), public.file_lesson_note(uuid, text, text, text),
  public.report_learner_absent(uuid), public.confirm_lesson(uuid), public.cancel_booking(uuid, text),
  public.teacher_cancel_booking(uuid, text), public.open_dispute(uuid, public.dispute_type, text), public.request_replacement(uuid, text),
  public.resolve_dispute(uuid, public.dispute_outcome, integer, text, integer), public.request_credit_refund(uuid),
  public.my_credit_balance(), public.my_credit_lines(), public.pay_with_credit(uuid) to authenticated, service_role;
revoke all on function public.record_refund_success(uuid, text, integer), public.mark_refund_pending(uuid, text),
  public.record_refund_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.record_refund_success(uuid, text, integer), public.mark_refund_pending(uuid, text),
  public.record_refund_failure(uuid, text) to service_role;

-- Lesson states move only through the functions above (check-in times, notes, grace periods).
revoke update (status) on public.sessions from authenticated;
