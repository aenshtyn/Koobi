-- Koobi sprint 4: checkout, the payment hold, teacher response, contact reveal (PRD §3.5, §3.6, FR-BOOK-1..3,
-- FR-PAY-1..4, FR-LEDGER-2, FR-MSG-2, §9.7).
--
-- Money moves only through the service-role functions below, called by the webhook ingress and the server
-- after re-verifying a transaction with the provider. Each is idempotent: a second call for the same payment
-- is a no-op, and ledger journals carry unique idempotency keys. Execute is revoked from every client role.

-- ---------------------------------------------------------------------------
-- The written cancellation and refund policy every booking acknowledges (FR-BOOK-8)
-- ---------------------------------------------------------------------------
insert into public.policy_versions (version, kind, body, effective_from) values
  ('cancellation-2026-11-v1', 'cancellation_refund',
   'Cancel or move a lesson 24 hours or more before it starts and you get a full refund or a free reschedule. '
   || 'Inside 24 hours there is no automatic refund. A lesson starts with a 15-minute grace period. '
   || 'If the teacher or expert cancels, does not respond in time, or does not come, every shilling comes back to you. '
   || 'A missed lesson by the learner is refunded only with a documented reason.',
   '2026-11-01 00:00:00+03')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Payment sent to the provider (initiated -> pending)
-- ---------------------------------------------------------------------------
create or replace function public.mark_payment_pending(p_payment uuid, p_provider_ref text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', 'system:checkout', true);
  update public.payments
     set status = 'pending', provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_payment and status = 'initiated';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Payment verified with the provider: succeeded, hold posted, booking paid, contacts revealed.
--    Returns true when this call recorded the success, false when it was already recorded.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_success(p_payment uuid, p_provider_ref text, p_fee_kes integer, p_settled_kes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p       public.payments%rowtype;
  v_txn   uuid;
  v_fee   integer := greatest(coalesce(p_fee_kes, 0), 0);
  v_owner uuid;
begin
  perform set_config('app.actor', 'system:payment_webhook', true);
  select * into p from public.payments where id = p_payment for update;
  if not found then
    raise exception 'payment % not found', p_payment using errcode = 'no_data_found';
  end if;
  if p.status = 'succeeded' then
    return false;
  end if;
  if p.status = 'initiated' then
    update public.payments set status = 'pending' where id = p.id;
  elsif p.status <> 'pending' then
    raise exception 'payment % is %, cannot succeed', p.id, p.status using errcode = 'check_violation';
  end if;
  if v_fee >= p.amount_kes then
    raise exception 'fee % is not below the amount %', v_fee, p.amount_kes using errcode = 'check_violation';
  end if;

  update public.payments
     set status = 'succeeded', hold_status = 'held', provider_ref = coalesce(p_provider_ref, provider_ref),
         fee_kes = v_fee, settled_kes = coalesce(p_settled_kes, p.amount_kes - v_fee), verified_at = now()
   where id = p.id;

  -- FR-LEDGER-2: payment succeeded in KES (price P, provider fee f)
  insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
  values ('payment_hold', 'hold:' || p.id::text, 'Payment ' || p.platform_ref || ' held until the lesson happens', 'system:payment_webhook')
  returning id into v_txn;
  insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, package_id, counterparty_user_id) values
    (v_txn, 'cash_provider', 'debit', p.amount_kes - v_fee, p.id, p.booking_id, p.package_id, null),
    (v_txn, 'client_funds_held', 'credit', p.amount_kes, p.id, p.booking_id, p.package_id, p.payer_user_id);
  if v_fee > 0 then
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, package_id)
    values (v_txn, 'expense_payment_fees', 'debit', v_fee, p.id, p.booking_id, p.package_id);
  end if;

  if p.booking_id is not null then
    update public.bookings set status = 'paid' where id = p.booking_id and status = 'awaiting_payment';
    -- FR-MSG-2: the pair's contacts are revealed after the first paid booking
    select t.user_id into v_owner from public.bookings b join public.teachers t on t.id = b.teacher_id where b.id = p.booking_id;
    update public.message_threads th
       set contact_revealed_at = coalesce(th.contact_revealed_at, now())
     where th.kind = 'pair'
       and exists (select 1 from public.thread_participants a where a.thread_id = th.id and a.user_id = p.payer_user_id)
       and exists (select 1 from public.thread_participants b where b.thread_id = th.id and b.user_id = v_owner);
  end if;
  if p.package_id is not null then
    update public.packages set status = 'active' where id = p.package_id and status = 'pending_payment';
  end if;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Payment failed or was cancelled at the provider: nothing was charged; the booking stays open for a retry.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_failure(p_payment uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', 'system:payment_webhook', true);
  update public.payments set status = 'pending' where id = p_payment and status = 'initiated';
  update public.payments
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'failed'), 300)
   where id = p_payment and status = 'pending';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. A held booking leaves the teacher's hands: declined by the teacher, or no answer in the window.
--    The hold becomes a credit for the payer (FR-BOOK-3); a cash refund is a separate request.
-- ---------------------------------------------------------------------------
create or replace function private.release_hold_to_credit(p_booking uuid, p_to public.booking_status, p_by text, p_rule text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b     public.bookings%rowtype;
  p     public.payments%rowtype;
  v_txn uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'paid' then
    return;
  end if;
  select * into p from public.payments where booking_id = b.id and status = 'succeeded' and hold_status = 'held' for update;
  update public.bookings
     set status = p_to, cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
         cancelled_by_role = case when p_to = 'cancelled' then p_by else cancelled_by_role end, cancellation_rule = p_rule
   where id = b.id;
  if found then
    insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
    values ('cancel_to_credit', 'credit:' || b.id::text, p_rule, 'system:' || p_by)
    returning id into v_txn;
    insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, booking_id, counterparty_user_id) values
      (v_txn, 'client_funds_held', 'debit', p.amount_kes, p.id, b.id, p.payer_user_id),
      (v_txn, 'guardian_credits', 'credit', p.amount_kes, p.id, b.id, p.payer_user_id);
    update public.payments set hold_status = 'credited' where id = p.id;
  end if;
end
$$;

-- The booking's teacher accepts (with a meeting link for online lessons) or declines.
create or replace function public.teacher_respond_booking(p_booking uuid, p_accept boolean, p_meeting_link text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.teacher_id is distinct from (select public.my_teacher_id()) then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'paid' then
    raise exception 'this booking is %, not waiting for you', b.status using errcode = 'check_violation';
  end if;
  if p_accept then
    if b.mode = 'online' and (p_meeting_link is null
        or p_meeting_link !~ '^https://(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us)/[A-Za-z0-9/?=&._-]+$') then
      raise exception 'add a Google Meet or Zoom link for an online lesson' using errcode = 'check_violation';
    end if;
    perform set_config('app.actor', 'teacher:' || auth.uid()::text, true);
    update public.bookings set status = 'accepted' where id = b.id;
    update public.bookings set status = 'scheduled', meeting_link_enc = nullif(btrim(p_meeting_link), '') where id = b.id;
    insert into public.sessions (booking_id, starts_at, ends_at)
    select b.id, b.starts_at, b.starts_at + make_interval(mins => b.duration_minutes)
     where not exists (select 1 from public.sessions s where s.booking_id = b.id);
  else
    if p_reason is null or char_length(btrim(p_reason)) < 5 then
      raise exception 'tell the learner briefly why' using errcode = 'check_violation';
    end if;
    perform private.release_hold_to_credit(b.id, 'cancelled', 'teacher', 'Declined by the teacher: ' || left(btrim(p_reason), 200));
  end if;
end
$$;

-- Response window (FR-BOOK-3): unanswered paid bookings lapse and the hold becomes a credit.
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
    perform private.release_hold_to_credit(r.id, 'lapsed', 'system', 'No answer from the teacher within ' || v_hours || ' hours');
    perform private.enqueue('booking.response_window_lapsed', 'bookings', r.id,
                            jsonb_build_object('booking_id', r.id, 'window_hours', v_hours), 'lapse:' || r.id::text, 3);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. After the reveal, each side of a pair thread can see the other's phone number (FR-MSG-2).
-- ---------------------------------------------------------------------------
create or replace function public.thread_contact(p_thread uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.phone_e164
    from public.message_threads th
    join public.thread_participants me on me.thread_id = th.id and me.user_id = (select auth.uid())
    join public.thread_participants other on other.thread_id = th.id and other.user_id <> me.user_id and other.role <> 'staff'
    join public.profiles p on p.id = other.user_id
   where th.id = p_thread and th.contact_revealed_at is not null
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 6. Booking lists with the names each side may see. Payers see the teacher's display name and the
--    offer even if it is later paused; teachers see the learner's alias and the payer's first name,
--    and only bookings that are paid or beyond.
-- ---------------------------------------------------------------------------
create or replace function public.my_bookings()
returns table (
  id uuid, offering_id uuid, slug text, title text, teacher_name text, kind public.booking_kind, mode text,
  starts_at timestamptz, duration_minutes integer, price_kes integer, discount_kes integer, status public.booking_status,
  paid_at timestamptz, accepted_at timestamptz, meeting_link text, learner_alias text, policy_version text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.offering_id, o.slug, o.title, t.display_name, b.kind, b.mode, b.starts_at, b.duration_minutes,
         b.price_kes, b.discount_kes, b.status, b.paid_at, b.accepted_at,
         case when b.status in ('scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation') then b.meeting_link_enc end,
         l.alias, b.policy_version, b.created_at
    from public.bookings b
    join public.offerings o on o.id = b.offering_id
    join public.teachers t on t.id = b.teacher_id
    join public.learners l on l.id = b.learner_id
   where b.booked_by_user_id = (select auth.uid()) or public.owns_learner(b.learner_id)
   order by b.starts_at desc
$$;

create or replace function public.my_teaching_bookings()
returns table (
  id uuid, offering_id uuid, title text, kind public.booking_kind, mode text, starts_at timestamptz, duration_minutes integer,
  price_kes integer, discount_kes integer, status public.booking_status, paid_at timestamptz, meeting_link text,
  learner_alias text, payer_first_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.offering_id, o.title, b.kind, b.mode, b.starts_at, b.duration_minutes, b.price_kes, b.discount_kes,
         b.status, b.paid_at, b.meeting_link_enc, l.alias,
         nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), ''), b.created_at
    from public.bookings b
    join public.offerings o on o.id = b.offering_id
    join public.learners l on l.id = b.learner_id
    left join public.profiles p on p.id = b.booked_by_user_id
   where b.teacher_id = (select public.my_teacher_id())
     and b.status not in ('requested', 'awaiting_payment')
   order by b.starts_at
$$;
revoke all on function public.my_bookings(), public.my_teaching_bookings() from public, anon;
grant execute on function public.my_bookings(), public.my_teaching_bookings() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants: money functions are for the service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.mark_payment_pending(uuid, text), public.record_payment_success(uuid, text, integer, integer),
  public.record_payment_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_pending(uuid, text), public.record_payment_success(uuid, text, integer, integer),
  public.record_payment_failure(uuid, text) to service_role;
revoke all on function private.release_hold_to_credit(uuid, public.booking_status, text, text) from public, anon, authenticated;
revoke all on function public.teacher_respond_booking(uuid, boolean, text, text), public.thread_contact(uuid) from public, anon;
grant execute on function public.teacher_respond_booking(uuid, boolean, text, text), public.thread_contact(uuid) to authenticated, service_role;
