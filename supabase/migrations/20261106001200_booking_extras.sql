-- Koobi: the rest of the expert's booking view (T17).
--
-- 1. A note from the learner when they book ("what I want to work on").
-- 2. The expert's private notes on a booking; the learner never sees them.
-- 3. Moving a lesson (FR-BOOK-4): either side proposes a new time 24 hours or more before the start,
--    the other side has 6 hours to accept, and the money on hold stays with the booking throughout.
-- 4. One read for the expert's booking view: the payer's phone number (shared once the booking is
--    paid, as in Messages), the payment, the two notes and any open proposal to move it.

-- ---------------------------------------------------------------------------
-- 1. The learner's note
-- ---------------------------------------------------------------------------
alter table public.bookings add column learner_note text check (char_length(learner_note) <= 500);
grant insert (learner_note) on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The expert's private notes
-- ---------------------------------------------------------------------------
create table public.booking_notes (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now()
);
alter table public.booking_notes enable row level security;
revoke all on public.booking_notes from anon, authenticated;
grant all on public.booking_notes to service_role;
-- Read and written only through the two functions below.

create or replace function public.save_booking_note(p_booking uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := (select public.my_teacher_id());
  v_body    text := btrim(coalesce(p_body, ''));
begin
  if v_teacher is null or not exists (select 1 from public.bookings b where b.id = p_booking and b.teacher_id = v_teacher) then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'keep the note under 2,000 characters' using errcode = 'check_violation';
  end if;
  if v_body = '' then
    delete from public.booking_notes where booking_id = p_booking;
  else
    insert into public.booking_notes (booking_id, teacher_id, body) values (p_booking, v_teacher, v_body)
    on conflict (booking_id) do update set body = excluded.body, updated_at = now();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Moving a lesson
-- ---------------------------------------------------------------------------
create table public.booking_reschedules (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  proposed_by   uuid not null references public.profiles (id),
  by_role       text not null check (by_role in ('teacher', 'payer')),
  old_starts_at timestamptz not null,
  new_starts_at timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  expires_at    timestamptz not null,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint booking_reschedules_new_time check (new_starts_at <> old_starts_at)
);
create unique index booking_reschedules_one_open on public.booking_reschedules (booking_id) where status = 'pending';
create index booking_reschedules_booking_idx on public.booking_reschedules (booking_id, created_at desc);
alter table public.booking_reschedules enable row level security;
revoke all on public.booking_reschedules from anon, authenticated;
grant all on public.booking_reschedules to service_role;
grant select on public.booking_reschedules to authenticated;
create policy booking_reschedules_read on public.booking_reschedules for select to authenticated
  using (exists (select 1 from public.bookings b
                  where b.id = booking_id
                    and (b.booked_by_user_id = (select auth.uid()) or b.teacher_id = (select public.my_teacher_id())))
         or (select public.has_any_role('{concierge,admin}')));

insert into public.message_templates (key, channel, subject, body, urgent) values
  ('reschedule_proposed', 'sms',    null, 'Koobi: {who} asks to move {title} to {when}. Answer within 6 hours: {link}', true),
  ('reschedule_proposed', 'in_app', null, '{who} asks to move {title} to {when}. Answer within 6 hours.', false),
  ('reschedule_accepted', 'sms',    null, 'Koobi: {title} has moved to {when}. Details: {link}', false),
  ('reschedule_accepted', 'in_app', null, '{title} has moved to {when}.', false),
  ('reschedule_declined', 'in_app', null, 'The new time for {title} was not accepted. The lesson stays at {when}.', false)
on conflict (key, channel, locale) do nothing;

-- The booking, the caller's side of it, and the other side's user id.
create or replace function private.reschedule_sides(p_booking uuid, out b public.bookings, out v_role text, out v_other uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_teacher uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  select t.user_id into v_teacher from public.teachers t where t.id = b.teacher_id;
  if v_uid = v_teacher then
    v_role := 'teacher';
    v_other := b.booked_by_user_id;
  elsif v_uid = b.booked_by_user_id then
    v_role := 'payer';
    v_other := v_teacher;
  else
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
end
$$;
revoke all on function private.reschedule_sides(uuid) from public, anon, authenticated;

create or replace function public.propose_reschedule(p_booking uuid, p_new_start timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s       record := private.reschedule_sides(p_booking);
  b       public.bookings := s.b;
  v_title text;
  v_who   text;
  v_id    uuid;
begin
  if b.kind = 'seat' then
    raise exception 'a seat in a group cannot be moved; the whole group meets at one time' using errcode = 'check_violation';
  end if;
  if b.status not in ('accepted', 'scheduled') then
    raise exception 'a % booking cannot be moved', b.status using errcode = 'check_violation';
  end if;
  if b.starts_at < now() + interval '24 hours' then
    raise exception 'a lesson can be moved up to 24 hours before it starts' using errcode = 'check_violation';
  end if;
  if p_new_start is null or p_new_start < now() + interval '2 hours' then
    raise exception 'choose a time at least 2 hours from now' using errcode = 'check_violation';
  end if;
  if p_new_start > now() + interval '60 days' then
    raise exception 'choose a time within the next 60 days' using errcode = 'check_violation';
  end if;
  if p_new_start = b.starts_at then
    raise exception 'that is the time it already has' using errcode = 'check_violation';
  end if;
  if private.teacher_time_taken(b.teacher_id, b.id, p_new_start, b.duration_minutes) then
    raise exception 'the teacher already has a lesson at that time' using errcode = 'check_violation';
  end if;
  update public.booking_reschedules set status = 'expired' where booking_id = b.id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.booking_reschedules where booking_id = b.id and status = 'pending') then
    raise exception 'a new time is already waiting for an answer' using errcode = 'check_violation';
  end if;
  insert into public.booking_reschedules (booking_id, proposed_by, by_role, old_starts_at, new_starts_at, expires_at)
  values (b.id, (select auth.uid()), s.v_role, b.starts_at, p_new_start, now() + interval '6 hours')
  returning id into v_id;

  select o.title into v_title from public.offerings o where o.id = b.offering_id;
  select case when s.v_role = 'teacher' then t.display_name
              else coalesce(nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), ''), 'The learner') end
    into v_who
    from public.teachers t, public.profiles p
   where t.id = b.teacher_id and p.id = b.booked_by_user_id;
  perform private.notify(s.v_other, 'reschedule_proposed', 'booking', b.id,
    jsonb_build_object('title', v_title, 'who', v_who,
                       'when', to_char(p_new_start at time zone 'Africa/Nairobi', 'Dy DD Mon HH24:MI'),
                       'proposal', v_id));
  return v_id;
end
$$;

create or replace function public.answer_reschedule(p_proposal uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r       public.booking_reschedules%rowtype;
  s       record;
  b       public.bookings;
  v_title text;
begin
  select * into r from public.booking_reschedules where id = p_proposal for update;
  if not found then
    raise exception 'not found' using errcode = 'insufficient_privilege';
  end if;
  s := private.reschedule_sides(r.booking_id);
  b := s.b;
  if r.status <> 'pending' then
    raise exception 'this request is already %', r.status using errcode = 'check_violation';
  end if;
  if s.v_role = r.by_role then
    if p_accept then
      raise exception 'the other side answers this' using errcode = 'check_violation';
    end if;
    update public.booking_reschedules set status = 'withdrawn', answered_at = now() where id = r.id;
    return;
  end if;
  if r.expires_at <= now() then
    update public.booking_reschedules set status = 'expired' where id = r.id;
    raise exception 'this request has run out of time; the lesson stays where it was' using errcode = 'check_violation';
  end if;
  select o.title into v_title from public.offerings o where o.id = b.offering_id;
  if not p_accept then
    update public.booking_reschedules set status = 'declined', answered_at = now() where id = r.id;
    perform private.notify(r.proposed_by, 'reschedule_declined', 'booking', b.id,
      jsonb_build_object('title', v_title, 'when', to_char(b.starts_at at time zone 'Africa/Nairobi', 'Dy DD Mon HH24:MI'), 'proposal', r.id));
    return;
  end if;
  if b.status not in ('accepted', 'scheduled') or b.starts_at <> r.old_starts_at then
    update public.booking_reschedules set status = 'expired' where id = r.id;
    raise exception 'the booking has changed since this was asked' using errcode = 'check_violation';
  end if;
  if r.new_starts_at < now() + interval '1 hour' then
    raise exception 'the new time is too close now' using errcode = 'check_violation';
  end if;
  if private.teacher_time_taken(b.teacher_id, b.id, r.new_starts_at, b.duration_minutes) then
    raise exception 'the teacher already has a lesson at that time' using errcode = 'check_violation';
  end if;
  -- The hold stays on the booking; only the time moves.
  update public.bookings set starts_at = r.new_starts_at where id = b.id;
  update public.sessions
     set starts_at = r.new_starts_at, ends_at = r.new_starts_at + make_interval(mins => b.duration_minutes)
   where booking_id = b.id and status = 'scheduled';
  update public.booking_reschedules set status = 'accepted', answered_at = now() where id = r.id;
  perform private.notify(r.proposed_by, 'reschedule_accepted', 'booking', b.id,
    jsonb_build_object('title', v_title, 'when', to_char(r.new_starts_at at time zone 'Africa/Nairobi', 'Dy DD Mon HH24:MI'), 'proposal', r.id));
end
$$;

-- ---------------------------------------------------------------------------
-- 4. The expert's booking view
-- ---------------------------------------------------------------------------
create or replace function public.teaching_booking_details(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'learner_note', b.learner_note,
           'internal_note', (select n.body from public.booking_notes n where n.booking_id = b.id),
           -- The payer's number: the learner's own, or the parent's for a child. Never a child's.
           'payer_phone', p.phone_e164,
           'for_child', l.user_id is distinct from b.booked_by_user_id,
           'payment', (select jsonb_build_object('method', pay.method, 'reference', pay.platform_ref, 'paid_at', pay.succeeded_at,
                                                 'hold_status', pay.hold_status)
                         from public.payments pay
                        where pay.booking_id = b.id and pay.status = 'succeeded'
                        order by pay.succeeded_at desc limit 1),
           'by_credit', b.paid_at is not null
                        and not exists (select 1 from public.payments pay where pay.booking_id = b.id and pay.status = 'succeeded'),
           'reschedule', (select jsonb_build_object('id', r.id, 'by_role', r.by_role, 'new_starts_at', r.new_starts_at,
                                                    'expires_at', r.expires_at)
                            from public.booking_reschedules r
                           where r.booking_id = b.id and r.status = 'pending' and r.expires_at > now()),
           'moved_from', (select r.old_starts_at from public.booking_reschedules r
                           where r.booking_id = b.id and r.status = 'accepted' order by r.answered_at desc limit 1))
    from public.bookings b
    join public.learners l on l.id = b.learner_id
    left join public.profiles p on p.id = b.booked_by_user_id
   where b.id = p_booking
     and b.teacher_id = (select public.my_teacher_id())
     and b.status not in ('requested', 'awaiting_payment')
$$;

revoke all on function public.save_booking_note(uuid, text), public.propose_reschedule(uuid, timestamptz),
  public.answer_reschedule(uuid, boolean), public.teaching_booking_details(uuid) from public, anon;
grant execute on function public.save_booking_note(uuid, text), public.propose_reschedule(uuid, timestamptz),
  public.answer_reschedule(uuid, boolean), public.teaching_booking_details(uuid) to authenticated, service_role;
