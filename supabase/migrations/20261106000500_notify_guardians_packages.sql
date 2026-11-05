-- Koobi sprint 7: notifications (FR-NOTIF-1..5), guardians, children and consent (FR-ACC-5..7), packages
-- and the managed plan (FR-BOOK-6, -7), staff administration (FR-ADMIN-1) and pilot metrics (FR-REP-1).
--
-- Notifications are created in the database from the same outbox event that records each state change,
-- so nothing is announced that did not happen. In-app rows are visible at once; SMS, WhatsApp and email
-- rows are queued for the dispatcher (src/app/api/notifications/dispatch), which renders the approved
-- template and sends through the provider.

-- ---------------------------------------------------------------------------
-- 1. Templates (X9, X10, S22)
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id                     uuid primary key default gen_random_uuid(),
  key                    text not null check (key ~ '^[a-z0-9_]+$'),
  channel                text not null check (channel in ('sms', 'whatsapp', 'email', 'in_app')),
  locale                 text not null default 'en' check (locale in ('en', 'sw')),
  subject                text check (char_length(subject) <= 120),
  body                   text not null check (char_length(body) between 1 and 1000),
  whatsapp_template_name text,  -- the name Meta approved; WhatsApp sends only approved templates
  urgent                 boolean not null default false,  -- ignores quiet hours (FR-NOTIF-3)
  version                integer not null default 1,
  active                 boolean not null default true,
  updated_by             uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (key, channel, locale)
);
create trigger message_templates_updated_at before update on public.message_templates
  for each row execute function private.set_updated_at();
alter table public.message_templates enable row level security;
grant select on public.message_templates to authenticated;
create policy message_templates_read on public.message_templates for select to authenticated using (true);

-- Placeholders: {teacher} {learner} {when} {amount} {title} {check} {link}. SMS stays near 160 characters.
insert into public.message_templates (key, channel, subject, body, urgent) values
  ('request_received',     'sms',    null, 'Koobi: we have your request for {title}. A concierge sends you a shortlist within 24 hours.', false),
  ('request_received',     'in_app', null, 'We have your request for {title}. A shortlist follows within 24 hours.', false),
  ('shortlist_ready',      'sms',    null, 'Koobi: your shortlist for {title} is ready. Choose a teacher: {link}', false),
  ('shortlist_ready',      'in_app', null, 'Your shortlist for {title} is ready.', false),
  ('booking_paid_teacher', 'sms',    null, 'Koobi: new paid booking, {title} with {learner}, {when}. Accept within 12 hours: {link}', true),
  ('booking_paid_teacher', 'in_app', null, 'New paid booking: {title} with {learner}, {when}. Accept within 12 hours.', false),
  ('booking_accepted',     'sms',    null, 'Koobi: {teacher} confirmed {title}, {when}. Details and link: {link}', false),
  ('booking_accepted',     'in_app', null, '{teacher} confirmed {title}, {when}.', false),
  ('booking_declined',     'sms',    null, 'Koobi: {teacher} cannot take {title}. {amount} is back as credit. Pick another time or teacher: {link}', false),
  ('booking_declined',     'in_app', null, '{teacher} cannot take {title}. {amount} is back as credit.', false),
  ('lesson_cancelled',     'sms',    null, 'Koobi: {title}, {when}, is cancelled. Details: {link}', true),
  ('lesson_cancelled',     'in_app', null, '{title}, {when}, is cancelled.', false),
  ('reminder_24h',         'sms',    null, 'Koobi reminder: {title} tomorrow, {when}. {link}', false),
  ('reminder_24h',         'in_app', null, 'Tomorrow: {title}, {when}.', false),
  ('reminder_1h',          'sms',    null, 'Koobi: {title} starts in an hour, {when}. {link}', true),
  ('reminder_1h',          'in_app', null, 'In an hour: {title}, {when}.', false),
  ('note_reminder',        'sms',    null, 'Koobi: please file the note for {title} with {learner}. Payment is released after it: {link}', false),
  ('note_reminder',        'in_app', null, 'File the lesson note for {title} with {learner}.', false),
  ('confirm_prompt',       'sms',    null, 'Koobi: did {title} with {teacher} happen? Confirm or report a problem: {link}', false),
  ('confirm_prompt',       'in_app', null, 'Did {title} with {teacher} happen? Confirm or report a problem.', false),
  ('receipt',              'email',  'Your Koobi receipt', 'Thank you. We received {amount} for {title}. It is held until the lesson happens. Receipt: {link}', false),
  ('receipt',              'in_app', null, 'Paid {amount} for {title}. Held until the lesson happens.', false),
  ('renewal_prompt',       'sms',    null, 'Koobi: the package for {title} ends in 7 days. Renew to keep your times with {teacher}: {link}', false),
  ('renewal_prompt',       'in_app', null, 'The package for {title} ends in 7 days. Renew to keep your times.', false),
  ('managed_plan_offer',   'sms',    null, 'Koobi: keep lessons with {teacher} on the monthly plan, billed by M-Pesa, replacement included: {link}', false),
  ('managed_plan_offer',   'in_app', null, 'You can move {title} with {teacher} to the monthly plan.', false),
  ('payout_sent',          'sms',    null, 'Koobi: {amount} sent to your M-Pesa. Statement: {link}', false),
  ('payout_sent',          'in_app', null, '{amount} sent to your M-Pesa. Your statement is ready.', false),
  ('dispute_opened',       'sms',    null, 'Koobi: a problem was reported on {title}. Payment is on hold; the concierge may ask you for a statement: {link}', false),
  ('dispute_opened',       'in_app', null, 'A problem was reported on {title}. Payment is on hold.', false),
  ('dispute_resolved',     'sms',    null, 'Koobi: the concierge decided the problem on {title}. Details: {link}', false),
  ('dispute_resolved',     'in_app', null, 'The problem on {title} is decided.', false),
  ('verification_passed',  'sms',    null, 'Koobi: {check} passed. It now shows on your profile with today''s date.', false),
  ('verification_passed',  'in_app', null, '{check} passed.', false),
  ('verification_failed',  'sms',    null, 'Koobi: {check} did not pass. See why and try again: {link}', false),
  ('verification_failed',  'in_app', null, '{check} did not pass. See why and try again.', false),
  ('refund_sent',          'sms',    null, 'Koobi: {amount} refunded to the number that paid.', false),
  ('refund_sent',          'in_app', null, '{amount} refunded to the number that paid.', false),
  ('waitlist_released',    'sms',    null, 'Koobi: learners can now find your offers. Thank you for joining early.', false),
  ('waitlist_released',    'in_app', null, 'Learners can now find your offers.', false)
on conflict (key, channel, locale) do nothing;

-- Admin edits wording; every edit is a new version in the audit log.
create or replace function public.update_template(p_id uuid, p_body text, p_subject text, p_active boolean, p_whatsapp_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.message_templates%rowtype;
begin
  if not (select public.has_role('admin')) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.message_templates where id = p_id for update;
  if not found then
    raise exception 'template not found' using errcode = 'no_data_found';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 5 then
    raise exception 'the message is empty' using errcode = 'check_violation';
  end if;
  if t.channel = 'sms' and char_length(p_body) > 320 then
    raise exception 'keep SMS under two messages (320 characters)' using errcode = 'check_violation';
  end if;
  update public.message_templates
     set body = btrim(p_body), subject = nullif(btrim(coalesce(p_subject, '')), ''), active = coalesce(p_active, active),
         whatsapp_template_name = nullif(btrim(coalesce(p_whatsapp_name, '')), ''), version = version + 1, updated_by = auth.uid()
   where id = t.id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'template.update', 'message_templates', t.id,
          jsonb_build_object('body', t.body, 'version', t.version), jsonb_build_object('body', btrim(p_body), 'version', t.version + 1));
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Routing events to people (FR-NOTIF-1, -2, -4)
-- ---------------------------------------------------------------------------
-- Creates the in-app row (shown at once) and queues the outside channel the person chose.
create or replace function private.notify(p_user uuid, p_key text, p_entity_type text, p_entity_id uuid, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pr      public.notification_preferences%rowtype;
  v_phone text;
  v_email text;
  v_locale text;
begin
  if p_user is null then
    return;
  end if;
  select * into pr from public.notification_preferences where user_id = p_user;
  select phone_e164, email, locale into v_phone, v_email, v_locale from public.profiles where id = p_user and status = 'active';
  if not found then
    return;
  end if;
  if exists (select 1 from public.message_templates where key = p_key and channel = 'in_app' and active) and coalesce(pr.in_app_enabled, true) then
    insert into public.notifications (user_id, template, locale, channel, entity_type, entity_id, payload, status, sent_at)
    values (p_user, p_key, v_locale, 'in_app', p_entity_type, p_entity_id, p_payload, 'sent', now())
    on conflict on constraint notifications_idempotent do nothing;
  end if;
  if v_phone is not null and coalesce(pr.whatsapp_opt_in, false)
     and exists (select 1 from public.message_templates where key = p_key and channel = 'whatsapp' and active and whatsapp_template_name is not null) then
    insert into public.notifications (user_id, template, locale, channel, entity_type, entity_id, payload)
    values (p_user, p_key, v_locale, 'whatsapp', p_entity_type, p_entity_id, p_payload)
    on conflict on constraint notifications_idempotent do nothing;
  elsif v_phone is not null and coalesce(pr.sms_enabled, true)
     and exists (select 1 from public.message_templates where key = p_key and channel = 'sms' and active) then
    insert into public.notifications (user_id, template, locale, channel, entity_type, entity_id, payload)
    values (p_user, p_key, v_locale, 'sms', p_entity_type, p_entity_id, p_payload)
    on conflict on constraint notifications_idempotent do nothing;
  end if;
  if v_email is not null and coalesce(pr.email_enabled, true)
     and exists (select 1 from public.message_templates where key = p_key and channel = 'email' and active) then
    insert into public.notifications (user_id, template, locale, channel, entity_type, entity_id, payload)
    values (p_user, p_key, v_locale, 'email', p_entity_type, p_entity_id, p_payload)
    on conflict on constraint notifications_idempotent do nothing;
  end if;
end
$$;

-- Allow-listed fields for a booking's messages (§6.4 rule 6): no phone numbers, no surnames of minors.
create or replace function private.booking_payload(p_booking uuid, p_for text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'title', o.title,
           'teacher', split_part(t.display_name, ' ', 1),
           'learner', l.alias,
           'when', b.starts_at,
           'amount', b.price_kes - b.discount_kes,
           'link', case when p_for = 'teacher' then '/teach/bookings/' || b.id::text else '/bookings/' || b.id::text end)
    from public.bookings b
    join public.offerings o on o.id = b.offering_id
    join public.teachers t on t.id = b.teacher_id
    join public.learners l on l.id = b.learner_id
   where b.id = p_booking
$$;

create or replace function private.route_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b        public.bookings%rowtype;
  v_teach  uuid;
  v_from   text := new.payload ->> 'from';
  r        record;
begin
  if new.aggregate_type = 'bookings' and new.aggregate_id is not null then
    select * into b from public.bookings where id = new.aggregate_id;
    select user_id into v_teach from public.teachers where id = b.teacher_id;
    if new.topic = 'booking.paid' then
      perform private.notify(v_teach, 'booking_paid_teacher', 'booking', b.id, private.booking_payload(b.id, 'teacher'));
    elsif new.topic = 'booking.scheduled' then
      perform private.notify(b.booked_by_user_id, 'booking_accepted', 'booking', b.id, private.booking_payload(b.id, 'payer'));
    elsif new.topic in ('booking.cancelled', 'booking.lapsed') and v_from = 'paid' then
      perform private.notify(b.booked_by_user_id, 'booking_declined', 'booking', b.id, private.booking_payload(b.id, 'payer'));
    elsif new.topic = 'booking.cancelled' and v_from in ('accepted', 'scheduled') then
      if b.cancelled_by_role = 'teacher' then
        perform private.notify(b.booked_by_user_id, 'lesson_cancelled', 'booking', b.id, private.booking_payload(b.id, 'payer'));
      else
        perform private.notify(v_teach, 'lesson_cancelled', 'booking', b.id, private.booking_payload(b.id, 'teacher'));
      end if;
    elsif new.topic = 'booking.awaiting_confirmation' then
      perform private.notify(b.booked_by_user_id, 'confirm_prompt', 'booking', b.id, private.booking_payload(b.id, 'payer'));
    end if;
  elsif new.aggregate_type = 'requests' and new.aggregate_id is not null then
    select rq.requester_id as uid, rq.subject as title into r from public.requests rq where rq.id = new.aggregate_id;
    if new.topic = 'request.submitted' then
      perform private.notify(r.uid, 'request_received', 'request', new.aggregate_id, jsonb_build_object('title', r.title, 'link', '/requests/' || new.aggregate_id::text));
    elsif new.topic = 'request.shortlisted' then
      perform private.notify(r.uid, 'shortlist_ready', 'request', new.aggregate_id, jsonb_build_object('title', r.title, 'link', '/requests/' || new.aggregate_id::text));
    end if;
  elsif new.aggregate_type = 'payments' and new.topic = 'payment.succeeded' then
    select p.payer_user_id as uid, p.amount_kes, coalesce(o.title, 'your lessons') as title, p.booking_id, p.package_id into r
      from public.payments p
      left join public.bookings bk on bk.id = p.booking_id
      left join public.packages pk on pk.id = p.package_id
      left join public.offerings o on o.id = coalesce(bk.offering_id, pk.offering_id)
     where p.id = new.aggregate_id;
    if r.uid is not null then
      perform private.notify(r.uid, 'receipt', 'payment', new.aggregate_id,
        jsonb_build_object('title', r.title, 'amount', r.amount_kes, 'link', '/account/receipts'));
    end if;
  elsif new.aggregate_type = 'disputes' then
    select d.booking_id, d.opened_by_role into r from public.disputes d where d.id = new.aggregate_id;
    select * into b from public.bookings where id = r.booking_id;
    select user_id into v_teach from public.teachers where id = b.teacher_id;
    if new.topic = 'dispute.open' and r.opened_by_role = 'payer' then
      perform private.notify(v_teach, 'dispute_opened', 'dispute', new.aggregate_id, private.booking_payload(b.id, 'teacher'));
    elsif new.topic = 'dispute.resolved' then
      perform private.notify(b.booked_by_user_id, 'dispute_resolved', 'dispute', new.aggregate_id,
        private.booking_payload(b.id, 'payer') || jsonb_build_object('link', '/disputes/' || new.aggregate_id::text));
      perform private.notify(v_teach, 'dispute_resolved', 'dispute', new.aggregate_id, private.booking_payload(b.id, 'teacher'));
    end if;
  elsif new.aggregate_type = 'verification_checks' and new.topic in ('verification.passed', 'verification.failed') then
    select t.user_id as uid, ct.label into r
      from public.verification_checks vc join public.teachers t on t.id = vc.teacher_id join public.check_types ct on ct.code = vc.check_type
     where vc.id = new.aggregate_id;
    perform private.notify(r.uid, case when new.topic = 'verification.passed' then 'verification_passed' else 'verification_failed' end,
      'verification', new.aggregate_id, jsonb_build_object('check', r.label, 'link', '/teach/verification'));
  elsif new.aggregate_type = 'payouts' and new.topic = 'payout.sent' then
    select t.user_id as uid, po.net_kes into r from public.payouts po join public.teachers t on t.id = po.teacher_id where po.id = new.aggregate_id;
    perform private.notify(r.uid, 'payout_sent', 'payout', new.aggregate_id,
      jsonb_build_object('amount', r.net_kes, 'link', '/teach/statements/' || new.aggregate_id::text));
  elsif new.aggregate_type = 'refunds' and new.topic = 'refund.succeeded' then
    select p.payer_user_id as uid, rf.amount_kes into r from public.refunds rf join public.payments p on p.id = rf.payment_id where rf.id = new.aggregate_id;
    perform private.notify(r.uid, 'refund_sent', 'refund', new.aggregate_id, jsonb_build_object('amount', r.amount_kes, 'link', '/account/credits'));
  elsif new.aggregate_type = 'teacher_tracks' and new.topic = 'waitlist.released' then
    select t.user_id as uid into r from public.teacher_tracks tt join public.teachers t on t.id = tt.teacher_id where tt.id = new.aggregate_id;
    perform private.notify(r.uid, 'waitlist_released', 'teacher_track', new.aggregate_id, '{}'::jsonb);
  end if;
  return new;
end
$$;

create trigger outbox_20_route_notifications after insert on public.outbox
  for each row execute function private.route_outbox();

-- Scheduled messages (FR-NOTIF-2, -4): reminders 24 hours and 1 hour before, the note reminder two hours
-- after check-out, the renewal prompt 7 days before a package ends. Idempotent per person, template and lesson.
create or replace function private.job_scheduled_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  perform set_config('app.actor', 'system:scheduled_notifications', true);
  for r in
    select s.id as session_id, b.id as booking_id, b.booked_by_user_id as payer, t.user_id as teacher,
           case when s.starts_at <= now() + interval '65 minutes' then 'reminder_1h' else 'reminder_24h' end as key
      from public.sessions s
      join public.bookings b on b.id = s.booking_id
      join public.teachers t on t.id = b.teacher_id
     where s.status = 'scheduled'
       and (s.starts_at between now() + interval '55 minutes' and now() + interval '65 minutes'
            or s.starts_at between now() + interval '23 hours 50 minutes' and now() + interval '24 hours 10 minutes')
  loop
    perform private.notify(r.payer, r.key, 'session', r.session_id, private.booking_payload(r.booking_id, 'payer'));
    perform private.notify(r.teacher, r.key, 'session', r.session_id, private.booking_payload(r.booking_id, 'teacher'));
    v_count := v_count + 1;
  end loop;
  for r in
    select s.id as session_id, b.id as booking_id, t.user_id as teacher
      from public.sessions s join public.bookings b on b.id = s.booking_id join public.teachers t on t.id = b.teacher_id
     where s.status = 'awaiting_note' and s.checked_out_at < now() - interval '2 hours'
  loop
    perform private.notify(r.teacher, 'note_reminder', 'session', r.session_id,
      private.booking_payload(r.booking_id, 'teacher') || jsonb_build_object('link', '/teach/sessions/' || r.session_id::text || '/note'));
    v_count := v_count + 1;
  end loop;
  for r in
    select pk.id, pk.booked_by_user_id as payer, o.title, split_part(t.display_name, ' ', 1) as teacher
      from public.packages pk join public.offerings o on o.id = pk.offering_id join public.teachers t on t.id = pk.teacher_id
     where pk.status = 'active' and pk.ends_on = (now() at time zone 'Africa/Nairobi')::date + 7
  loop
    perform private.notify(r.payer, 'renewal_prompt', 'package', r.id,
      jsonb_build_object('title', r.title, 'teacher', r.teacher, 'link', '/packages/' || r.id::text));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- In-app: mark everything read.
create or replace function public.mark_notifications_read()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null and channel = 'in_app'
$$;

-- Service role (the dispatcher): claim queued messages, record results.
create or replace function public.claim_notifications(p_limit integer)
returns setof public.notifications
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications n set status = 'sent', vendor = 'claimed', sent_at = now()
   where n.id in (select x.id from public.notifications x
                   where x.status = 'queued' and x.channel in ('sms', 'whatsapp', 'email')
                   order by x.created_at limit greatest(1, least(coalesce(p_limit, 50), 200))
                   for update skip locked)
  returning n.*
$$;

create or replace function public.record_notification(p_id uuid, p_status text, p_vendor text, p_vendor_msg_id text, p_cost_cents integer)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications
     set status = p_status, vendor = p_vendor, vendor_msg_id = p_vendor_msg_id, cost_cents = p_cost_cents,
         sent_at = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end
   where id = p_id
$$;

-- Put a message back in the queue (quiet hours, or a provider that was down).
create or replace function public.requeue_notification(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications set status = 'queued', vendor = null, sent_at = null where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Guardians, children and consent (FR-ACC-5, -6)
-- ---------------------------------------------------------------------------
insert into public.policy_versions (version, kind, body, effective_from) values
  ('parental-consent-2026-11-v1', 'parental_consent',
   'I am this child''s parent or legal guardian. I agree that Koobi keeps the minimum about my child needed to arrange lessons: a first name or nickname, year of birth, level, curriculum, subjects, language and any needs I choose to share, and the teacher''s lesson notes. Koobi never uses my child''s data for advertising or profiling and never sells it. Only I, my child''s matched teacher (first name, level and needs only) and Koobi staff with a logged reason can see it. I can withdraw this consent and ask for the data to be erased at any time.',
   '2026-11-01 00:00:00+03')
on conflict (version) do nothing;

create or replace function public.become_guardian(p_display_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  perform public.claim_role('guardian');
  insert into public.guardians (user_id, display_name) values (auth.uid(), nullif(left(btrim(coalesce(p_display_name, '')), 80), ''))
  on conflict (user_id) do nothing;
  select id into v_id from public.guardians where user_id = auth.uid();
  return v_id;
end
$$;

-- A child profile and the consent event in one step: no child data exists without consent.
create or replace function public.add_child(p_alias text, p_year_of_birth integer, p_curriculum text, p_level text,
                                            p_language text, p_needs text[], p_consent_version text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
  v_id       uuid;
begin
  select id into v_guardian from public.guardians where user_id = auth.uid();
  if v_guardian is null then
    raise exception 'set up your parent account first' using errcode = 'check_violation';
  end if;
  if p_consent_version is distinct from 'parental-consent-2026-11-v1' then
    raise exception 'read and accept the consent first' using errcode = 'check_violation';
  end if;
  if p_alias is null or char_length(btrim(p_alias)) not between 1 and 40 then
    raise exception 'a first name or nickname, up to 40 letters' using errcode = 'check_violation';
  end if;
  if p_year_of_birth is null or p_year_of_birth < extract(year from now())::integer - 25 or p_year_of_birth > extract(year from now())::integer - 3 then
    raise exception 'check the year of birth' using errcode = 'check_violation';
  end if;
  insert into public.learners (guardian_id, alias, year_of_birth, curriculum_code, level_code, language_code, special_needs_codes)
  values (v_guardian, btrim(p_alias), p_year_of_birth, nullif(p_curriculum, ''), nullif(p_level, ''), nullif(p_language, ''), coalesce(p_needs, '{}'))
  returning id into v_id;
  insert into public.consents (guardian_id, learner_id, text_version, channel) values (v_guardian, v_id, p_consent_version, 'web');
  return v_id;
end
$$;

create or replace function public.withdraw_consent(p_learner uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
begin
  select id into v_guardian from public.guardians where user_id = auth.uid();
  update public.consents set withdrawn_at = now() where learner_id = p_learner and guardian_id = v_guardian and withdrawn_at is null;
  if not found then
    raise exception 'no active consent for this child' using errcode = 'check_violation';
  end if;
end
$$;

-- Guardian identity (FR-ACC-6): the same evidence as a teacher's tier 1, reviewed by staff.
create table public.guardian_identity_checks (
  id             uuid primary key default gen_random_uuid(),
  guardian_id    uuid not null references public.guardians (id) on delete cascade,
  id_number_enc  text,
  status         text not null default 'pending' check (status in ('pending', 'in_review', 'passed', 'failed')),
  failure_reason text,
  reviewer_id    uuid references public.profiles (id),
  reviewed_at    timestamptz,
  staff_minutes  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger guardian_identity_checks_updated_at before update on public.guardian_identity_checks
  for each row execute function private.set_updated_at();
create table public.guardian_documents (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references public.guardian_identity_checks (id) on delete cascade,
  storage_key text not null unique,
  kind        text not null check (kind in ('id_front', 'id_back', 'passport', 'selfie')),
  created_at  timestamptz not null default now()
);
alter table public.guardian_identity_checks enable row level security;
alter table public.guardian_documents enable row level security;
grant select on public.guardian_identity_checks to authenticated;
create policy guardian_identity_read on public.guardian_identity_checks for select to authenticated
  using (guardian_id = (select g.id from public.guardians g where g.user_id = (select auth.uid()))
         or (select public.has_any_role('{reviewer,admin}')));

create or replace function public.can_upload_guardian_doc(p_check uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.guardian_identity_checks c join public.guardians g on g.id = c.guardian_id
                  where c.id = p_check and g.user_id = (select auth.uid()) and c.status = 'pending')
$$;
grant insert (check_id, storage_key, kind) on public.guardian_documents to authenticated;
create policy guardian_documents_upload_own on public.guardian_documents for insert to authenticated
  with check (public.can_upload_guardian_doc(check_id));

create or replace function public.start_guardian_check()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
  v_id       uuid;
begin
  select id into v_guardian from public.guardians where user_id = auth.uid();
  if v_guardian is null then
    raise exception 'set up your parent account first' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.guardians where id = v_guardian and identity_check_status = 'passed') then
    raise exception 'your ID is already checked' using errcode = 'check_violation';
  end if;
  select id into v_id from public.guardian_identity_checks where guardian_id = v_guardian and status in ('pending', 'in_review') order by created_at desc limit 1;
  if v_id is null then
    insert into public.guardian_identity_checks (guardian_id) values (v_guardian) returning id into v_id;
  end if;
  return v_id;
end
$$;

create or replace function public.submit_guardian_check(p_check uuid, p_id_number_enc text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.can_upload_guardian_doc(p_check) then
    raise exception 'not your check' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.guardian_documents where check_id = p_check and kind in ('id_front', 'passport'))
     or not exists (select 1 from public.guardian_documents where check_id = p_check and kind = 'selfie') then
    raise exception 'upload your ID and a photo of you holding it' using errcode = 'check_violation';
  end if;
  if p_id_number_enc is null or char_length(p_id_number_enc) < 20 then
    raise exception 'enter your ID number' using errcode = 'check_violation';
  end if;
  update public.guardian_identity_checks set status = 'in_review', id_number_enc = p_id_number_enc where id = p_check;
  update public.guardians set identity_check_status = 'pending' where id = (select guardian_id from public.guardian_identity_checks where id = p_check);
end
$$;

create or replace function public.review_guardian_check(p_check uuid, p_pass boolean, p_note text, p_minutes integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.guardian_identity_checks%rowtype;
begin
  if not (select public.has_any_role('{reviewer,admin}')) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.guardian_identity_checks where id = p_check for update;
  if not found or c.status <> 'in_review' then
    raise exception 'this check is not waiting for review' using errcode = 'check_violation';
  end if;
  if not p_pass and (p_note is null or char_length(btrim(p_note)) < 5) then
    raise exception 'say why it did not pass' using errcode = 'check_violation';
  end if;
  if p_minutes is null or p_minutes < 1 then
    raise exception 'log the minutes spent' using errcode = 'check_violation';
  end if;
  update public.guardian_identity_checks
     set status = case when p_pass then 'passed' else 'failed' end, failure_reason = case when p_pass then null else left(btrim(p_note), 300) end,
         reviewer_id = auth.uid(), reviewed_at = now(), staff_minutes = staff_minutes + p_minutes
   where id = c.id;
  update public.guardians set identity_check_status = case when p_pass then 'passed' else 'failed' end where id = c.guardian_id;
  insert into public.staff_time_log (staff_user_id, subject_type, subject_id, minutes, note)
  values (auth.uid(), 'guardian_identity', c.id, p_minutes, left(coalesce(btrim(p_note), ''), 1000));
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'guardian.identity_review', 'guardian_identity_checks', c.id, jsonb_build_object('passed', p_pass));
end
$$;

create or replace function public.guardian_check_documents(p_check uuid)
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
  return query select d.id, d.kind, d.created_at from public.guardian_documents d where d.check_id = p_check order by d.created_at;
end
$$;

create or replace function public.open_guardian_document(p_document uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not (select public.has_any_role('{reviewer,admin}')) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select storage_key into v_key from public.guardian_documents where id = p_document;
  if v_key is null then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'document.view', 'guardian_documents', p_document, 'guardian identity review');
  return v_key;
end
$$;

-- Children's lessons need live consent; in person they also need the guardian's ID (IDEA §3, FR-ACC-6).
create or replace function private.bookings_minor_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.learners%rowtype;
begin
  select * into l from public.learners where id = new.learner_id;
  if l.guardian_id is null then
    return new;
  end if;
  if l.consent_status <> 'active' then
    raise exception 'record parental consent for this child before booking' using errcode = 'check_violation';
  end if;
  if new.mode <> 'online' and not exists (select 1 from public.guardians g where g.id = l.guardian_id and g.identity_check_status = 'passed') then
    raise exception 'in-person lessons for a child need the parent''s ID check first' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger bookings_07_minor_guard before insert on public.bookings
  for each row execute function private.bookings_minor_guard();

-- ---------------------------------------------------------------------------
-- 4. Packages and the managed plan (FR-BOOK-6, -7)
-- ---------------------------------------------------------------------------
-- Package price without a package rate is the lesson price times the lessons, for the offer's lesson
-- length (the sprint 1 version used the hourly rate whatever the length).
create or replace function private.quote_package(p_offering uuid, p_sessions integer)
returns table (teacher_id uuid, price_kes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o      public.offerings%rowtype;
  v_unit integer;
begin
  select * into o from public.offerings where id = p_offering;
  if not found or o.listing_status <> 'approved' or o.format <> 'one_to_one' then
    raise exception 'offering % is not an approved one-to-one offering', p_offering using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teachers t where t.id = o.teacher_id and t.listing_status = 'approved'
                  and t.status not in ('suspended', 'offboarded')) then
    raise exception 'teacher is not bookable' using errcode = 'check_violation';
  end if;
  v_unit := round(o.price_hour_kes * o.duration_minutes / 60.0)::integer;
  teacher_id := o.teacher_id;
  price_kes := case p_sessions
                 when 8  then coalesce(o.price_pkg8_kes,  v_unit * 8)
                 when 12 then coalesce(o.price_pkg12_kes, v_unit * 12)
                 when 16 then coalesce(o.price_pkg16_kes, v_unit * 16)
                 else v_unit * p_sessions
               end;
  return next;
end
$$;

-- Validity: sessions ÷ sessions per week, plus two weeks grace [assumption]. The managed plan is for an
-- in-person pair whose first confirmed lesson is at least the first month back.
create or replace function private.packages_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  new.ends_on := new.starts_on + ((ceil(new.sessions_total::numeric / new.cadence_per_week) + 2) * 7)::integer;
  if new.plan_type = 'managed' then
    v_days := coalesce((private.param('commission_rate', null, 'one_to_one', 'in_home') ->> 'first_month_days')::integer, 30);
    if not exists (
      select 1 from public.bookings b
       where b.learner_id = new.learner_id and b.teacher_id = new.teacher_id and b.mode in ('in_home', 'teacher_premises')
         and b.status = 'confirmed' and b.starts_at <= now() - make_interval(days => v_days)) then
      raise exception 'the monthly plan opens after the first month of in-person lessons with this teacher' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
create trigger packages_07_rules before insert on public.packages
  for each row execute function private.packages_rules();

-- Book one lesson from a paid package (no new payment). Sessions under the managed plan are
-- managed_plan_session bookings and carry the plan's commission.
create or replace function public.book_from_package(p_package uuid, p_starts_at timestamptz, p_mode text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pk     public.packages%rowtype;
  o      public.offerings%rowtype;
  v_used integer;
  v_id   uuid;
begin
  select * into pk from public.packages where id = p_package for update;
  if not found or not (pk.booked_by_user_id = auth.uid() or public.owns_learner(pk.learner_id)) then
    raise exception 'not your package' using errcode = 'insufficient_privilege';
  end if;
  if pk.status <> 'active' then
    raise exception 'this package is %, not active', pk.status using errcode = 'check_violation';
  end if;
  if p_starts_at < now() + interval '2 hours' then
    raise exception 'choose a time at least 2 hours ahead' using errcode = 'check_violation';
  end if;
  if (p_starts_at at time zone 'Africa/Nairobi')::date > pk.ends_on then
    raise exception 'that date is after the package ends on %', pk.ends_on using errcode = 'check_violation';
  end if;
  select count(*) into v_used from public.bookings where package_id = pk.id and status not in ('cancelled', 'lapsed');
  if v_used >= pk.sessions_total then
    raise exception 'every lesson in this package is booked' using errcode = 'check_violation';
  end if;
  select * into o from public.offerings where id = pk.offering_id;
  if not (p_mode = any (o.modes)) then
    raise exception 'this offer is not taught %', p_mode using errcode = 'check_violation';
  end if;
  insert into public.bookings (offering_id, learner_id, teacher_id, booked_by_user_id, package_id, kind, mode, starts_at,
                               duration_minutes, price_kes, discount_kes, policy_version, policy_acknowledged_at)
  values (o.id, pk.learner_id, pk.teacher_id, auth.uid(), pk.id,
          case when pk.plan_type = 'managed' then 'managed_plan_session' else 'package_session' end::public.booking_kind,
          p_mode, p_starts_at, o.duration_minutes, round(pk.price_kes::numeric / pk.sessions_total)::integer, 0,
          'cancellation-2026-11-v1', now())
  returning id into v_id;
  update public.bookings set status = 'awaiting_payment' where id = v_id;
  update public.bookings set status = 'paid', paid_at = now() where id = v_id;
  update public.packages set sessions_used = v_used + 1 where id = pk.id;
  return v_id;
end
$$;

-- Expired packages: what was not used becomes credit (FR-BOOK-6, credit by default).
create or replace function private.job_expire_packages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_left  integer;
  v_txn   uuid;
  r       record;
begin
  perform set_config('app.actor', 'system:expire_packages', true);
  for r in
    select pk.id, p.id as payment_id, p.payer_user_id
      from public.packages pk
      join public.payments p on p.package_id = pk.id and p.status = 'succeeded' and p.hold_status = 'held'
     where pk.status = 'active' and pk.ends_on < (now() at time zone 'Africa/Nairobi')::date
       and not exists (select 1 from public.bookings b where b.package_id = pk.id
                        and b.status in ('paid', 'accepted', 'scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation', 'disputed'))
  loop
    v_left := private.held_balance(r.payment_id);
    if v_left > 0 then
      insert into public.ledger_transactions (kind, idempotency_key, memo, posted_by)
      values ('cancel_to_credit', 'package-expiry:' || r.id::text, 'Unused package lessons returned as credit', 'system:expire_packages')
      returning id into v_txn;
      insert into public.ledger_entries (txn_id, account, side, amount_kes, payment_id, package_id, counterparty_user_id)
      values (v_txn, 'client_funds_held', 'debit', v_left, r.payment_id, r.id, r.payer_user_id),
             (v_txn, 'guardian_credits', 'credit', v_left, r.payment_id, r.id, r.payer_user_id);
      update public.payments set hold_status = 'credited' where id = r.payment_id;
    else
      update public.payments set hold_status = 'released' where id = r.payment_id;
    end if;
    update public.packages set status = 'expired' where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Account: data requests (FR-ACC-7), staff roles (S23), parameters and flags (S21)
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('export', 'erasure')),
  status       text not null default 'requested' check (status in ('requested', 'in_progress', 'completed', 'rejected')),
  note         text check (char_length(note) <= 1000),
  handled_by   uuid references public.profiles (id),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger data_requests_updated_at before update on public.data_requests
  for each row execute function private.set_updated_at();
alter table public.data_requests enable row level security;
grant select on public.data_requests to authenticated;
grant insert (kind, note) on public.data_requests to authenticated;
create policy data_requests_read on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));
create policy data_requests_insert_own on public.data_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

create or replace function public.close_data_request(p_request uuid, p_status text, p_note text)
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
  if p_status not in ('in_progress', 'completed', 'rejected') then
    raise exception 'choose a status' using errcode = 'check_violation';
  end if;
  if p_status = 'rejected' and (p_note is null or char_length(btrim(p_note)) < 5) then
    raise exception 'say why; the person sees it' using errcode = 'check_violation';
  end if;
  update public.data_requests set status = p_status, note = left(coalesce(btrim(p_note), note), 1000), handled_by = auth.uid(),
         completed_at = case when p_status in ('completed', 'rejected') then now() end
   where id = p_request;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'data_request.' || p_status, 'data_requests', p_request, jsonb_build_object('note', p_note));
end
$$;

-- What Koobi holds about the caller, as JSON (FR-ACC-7 export).
create or replace function public.my_data_export()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = (select auth.uid())),
    'roles', (select coalesce(jsonb_agg(ur.role), '[]') from public.user_roles ur where ur.user_id = (select auth.uid())),
    'learners', (select coalesce(jsonb_agg(jsonb_build_object('alias', l.alias, 'year_of_birth', l.year_of_birth, 'level', l.level_code,
                   'curriculum', l.curriculum_code, 'consent', l.consent_status)), '[]')
                   from public.learners l left join public.guardians g on g.id = l.guardian_id
                  where l.user_id = (select auth.uid()) or g.user_id = (select auth.uid())),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b) - 'meeting_link_enc'), '[]') from public.my_bookings() b),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('ref', p.platform_ref, 'amount_kes', p.amount_kes, 'status', p.status,
                   'method', p.method, 'at', p.created_at)), '[]') from public.payments p where p.payer_user_id = (select auth.uid())),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('subject', r.subject, 'goal', r.goal, 'status', r.status, 'at', r.created_at)), '[]')
                   from public.requests r where r.requester_id = (select auth.uid())),
    'messages_sent', (select count(*) from public.messages m where m.sender_user_id = (select auth.uid())),
    'notification_preferences', (select to_jsonb(n) - 'user_id' from public.notification_preferences n where n.user_id = (select auth.uid()))
  )
$$;

-- Staff roles are granted and removed by an admin only, never self-assigned (S23).
create or replace function public.set_staff_role(p_user uuid, p_role text, p_grant boolean)
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
  if p_role not in ('concierge', 'reviewer', 'finance', 'admin') then
    raise exception 'not a staff role' using errcode = 'check_violation';
  end if;
  if not p_grant and p_role = 'admin' and p_user = auth.uid() then
    raise exception 'you cannot remove your own admin role' using errcode = 'check_violation';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role::public.app_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role::public.app_role;
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, case when p_grant then 'role.grant' else 'role.revoke' end, 'profiles', p_user,
          jsonb_build_object('role', p_role));
end
$$;

-- Parameters are never edited: a new dated row takes over from its effective date (§6.4 rule 4).
create or replace function public.add_parameter(p_key text, p_track text, p_format text, p_mode text, p_value jsonb, p_effective_from timestamptz, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select public.has_any_role('{finance,admin}')) then
    raise exception 'finance or admin only' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.parameters where key = p_key) then
    raise exception 'unknown parameter %', p_key using errcode = 'check_violation';
  end if;
  if p_effective_from < now() - interval '1 minute' then
    raise exception 'a change takes effect now or later, never in the past' using errcode = 'check_violation';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 5 then
    raise exception 'say why it changes' using errcode = 'check_violation';
  end if;
  insert into public.parameters (key, track, format, mode, value, effective_from, note, set_by)
  values (p_key, nullif(p_track, ''), nullif(p_format, ''), nullif(p_mode, ''), p_value, p_effective_from, btrim(p_note), auth.uid())
  returning id into v_id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'parameter.add', 'parameters', v_id,
          jsonb_build_object('key', p_key, 'value', p_value, 'effective_from', p_effective_from), btrim(p_note));
  return v_id;
end
$$;

create or replace function public.set_feature_flag(p_flag uuid, p_enabled boolean)
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
  update public.feature_flags set enabled = p_enabled, set_by = auth.uid() where id = p_flag;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'flag.set', 'feature_flags', p_flag, jsonb_build_object('enabled', p_enabled));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Pilot metrics (FR-REP-1): the seven decision metrics of IDEA §12, thresholds alongside.
-- ---------------------------------------------------------------------------
create or replace function public.pilot_metrics(p_track text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m jsonb := '[]'::jsonb;
  n numeric; d numeric;
  v_rev bigint; v_cost bigint; v_learners integer; v_minutes bigint;
begin
  if not (select public.has_any_role('{concierge,finance,admin}')) then
    raise exception 'staff only' using errcode = 'insufficient_privilege';
  end if;

  -- M1 paying list price: paid lessons and packages with no discount other than the trial
  select count(*) filter (where b.discount_kes = 0), count(*) into n, d
    from public.bookings b join public.offerings o on o.id = b.offering_id
   where b.paid_at is not null and b.kind <> 'trial' and b.package_id is null and (p_track is null or o.track = p_track);
  m := m || jsonb_build_object('id', 'M1', 'label', 'Customers paying list price', 'num', n, 'den', d, 'threshold', 0.70, 'rule', 'at least');

  -- M2 requests matched within 48 hours
  select count(*) filter (where r.matched_at is not null and r.matched_at <= r.submitted_at + interval '48 hours'),
         count(*) filter (where r.status <> 'withdrawn' and r.submitted_at < now() - interval '48 hours') into n, d
    from public.requests r where (p_track is null or r.track = p_track);
  select coalesce(sum(minutes), 0) into v_minutes from public.staff_time_log where subject_type = 'request';
  m := m || jsonb_build_object('id', 'M2', 'label', 'Requests matched within 48 hours', 'num', n, 'den', d, 'threshold', 0.80, 'rule', 'at least',
                               'note', 'staff minutes logged on matching: ' || v_minutes);

  -- M3 package renewal after the first package ends
  select count(*) filter (where exists (select 1 from public.packages x where x.previous_package_id = pk.id and x.status in ('active', 'completed', 'expired'))),
         count(*) into n, d
    from public.packages pk join public.offerings o on o.id = pk.offering_id
   where pk.status in ('completed', 'expired') and not pk.is_renewal and (p_track is null or o.track = p_track);
  m := m || jsonb_build_object('id', 'M3', 'label', 'Package renewal after the first package', 'num', n, 'den', d, 'threshold', 0.50, 'rule', 'at least');

  -- M4 pairs that started 8+ weeks ago and paid through Koobi in the last 14 days
  with pairs as (
    select b.teacher_id, b.learner_id, min(b.paid_at) first_paid, max(b.paid_at) last_paid
      from public.bookings b join public.offerings o on o.id = b.offering_id
     where b.paid_at is not null and (p_track is null or o.track = p_track)
     group by b.teacher_id, b.learner_id)
  select count(*) filter (where last_paid >= now() - interval '14 days'), count(*) into n, d
    from pairs where first_paid <= now() - interval '8 weeks';
  m := m || jsonb_build_object('id', 'M4', 'label', 'Pairs still paying through Koobi at week eight', 'num', n, 'den', d, 'threshold', 0.60, 'rule', 'at least');

  -- M5 teachers active 8+ weeks still accepting, earning above their stated alternative per hour (prep and travel included)
  with t as (
    select tc.id, tc.alternative_rate_kes,
           (select max(b.accepted_at) from public.bookings b where b.teacher_id = tc.id) last_accept,
           (select coalesce(sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end), 0)
              from public.ledger_entries e where e.account = 'teacher_payable' and e.side = 'credit' and e.counterparty_user_id = tc.user_id) earned,
           (select coalesce(sum(coalesce(s.actual_minutes, b.duration_minutes) + coalesce(n2.prep_minutes, 0) + coalesce(n2.travel_minutes, 0)), 0)
              from public.sessions s join public.bookings b on b.id = s.booking_id left join public.lesson_notes n2 on n2.session_id = s.id
             where b.teacher_id = tc.id and s.status = 'confirmed') minutes
      from public.teachers tc
     where tc.approved_at <= now() - interval '8 weeks')
  select count(*) filter (where last_accept >= now() - interval '14 days'
                           and (alternative_rate_kes is null or (minutes > 0 and earned * 60.0 / minutes >= alternative_rate_kes))),
         count(*) into n, d from t;
  m := m || jsonb_build_object('id', 'M5', 'label', 'Teachers still accepting and earning above their alternative', 'num', n, 'den', d, 'threshold', 0.80, 'rule', 'at least');

  -- M6 contribution per active learner: fees less subsidies, payment, payout and verification costs.
  -- Staff time and acquisition are not costed here; the minutes are shown so they can be.
  select coalesce(sum(case when e.side = 'credit' then e.amount_kes else -e.amount_kes end) filter (where e.account = 'revenue_commission'), 0),
         coalesce(sum(case when e.side = 'debit' then e.amount_kes else -e.amount_kes end)
                  filter (where e.account in ('expense_trial_subsidy', 'expense_payment_fees', 'expense_payout_fees', 'expense_verification')), 0)
    into v_rev, v_cost from public.ledger_entries e;
  select count(distinct b.learner_id) into v_learners from public.bookings b where b.status = 'confirmed' and b.starts_at >= now() - interval '30 days';
  select coalesce(sum(minutes), 0) into v_minutes from public.staff_time_log;
  m := m || jsonb_build_object('id', 'M6', 'label', 'Contribution per active learner (KES, before staff time and acquisition)',
                               'value', case when v_learners > 0 then round((v_rev - v_cost)::numeric / v_learners) end,
                               'num', v_rev - v_cost, 'den', v_learners, 'threshold', 0, 'rule', 'above',
                               'note', 'all staff minutes logged: ' || v_minutes);

  -- M7 learning: follow-up above baseline
  select count(*) filter (where l.followup_score > l.baseline_score), count(*) into n, d
    from public.learners l where l.baseline_score is not null and l.followup_score is not null;
  m := m || jsonb_build_object('id', 'M7', 'label', 'Learners improving from baseline to follow-up', 'num', n, 'den', d, 'threshold', 0.50, 'rule', 'above');

  return jsonb_build_object('computed_at', now(), 'track', p_track, 'metrics', m);
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.notify(uuid, text, text, uuid, jsonb), private.booking_payload(uuid, text), private.route_outbox(),
  private.job_scheduled_notifications(), private.bookings_minor_guard(), private.packages_rules(), private.job_expire_packages()
  from public, anon, authenticated;
grant execute on function private.job_scheduled_notifications(), private.job_expire_packages() to service_role;

revoke all on function public.update_template(uuid, text, text, boolean, text), public.mark_notifications_read(),
  public.become_guardian(text), public.add_child(text, integer, text, text, text, text[], text), public.withdraw_consent(uuid),
  public.can_upload_guardian_doc(uuid), public.start_guardian_check(), public.submit_guardian_check(uuid, text),
  public.review_guardian_check(uuid, boolean, text, integer), public.guardian_check_documents(uuid), public.open_guardian_document(uuid),
  public.book_from_package(uuid, timestamptz, text), public.close_data_request(uuid, text, text), public.my_data_export(),
  public.set_staff_role(uuid, text, boolean), public.add_parameter(text, text, text, text, jsonb, timestamptz, text),
  public.set_feature_flag(uuid, boolean), public.pilot_metrics(text) from public, anon;
grant execute on function public.update_template(uuid, text, text, boolean, text), public.mark_notifications_read(),
  public.become_guardian(text), public.add_child(text, integer, text, text, text, text[], text), public.withdraw_consent(uuid),
  public.can_upload_guardian_doc(uuid), public.start_guardian_check(), public.submit_guardian_check(uuid, text),
  public.review_guardian_check(uuid, boolean, text, integer), public.guardian_check_documents(uuid), public.open_guardian_document(uuid),
  public.book_from_package(uuid, timestamptz, text), public.close_data_request(uuid, text, text), public.my_data_export(),
  public.set_staff_role(uuid, text, boolean), public.add_parameter(text, text, text, text, jsonb, timestamptz, text),
  public.set_feature_flag(uuid, boolean), public.pilot_metrics(text) to authenticated, service_role;

revoke all on function public.claim_notifications(integer), public.record_notification(uuid, text, text, text, integer),
  public.requeue_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer), public.record_notification(uuid, text, text, text, integer),
  public.requeue_notification(uuid) to service_role;
