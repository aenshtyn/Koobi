-- Koobi: group classes, workshops and programmes (FR-BOOK-11 to -13, FR-SESS-7), first working version.
--
-- The tables were there from the start (runs, seat bookings, a seat counter, run sessions, attendance).
-- What was missing is everything that moves them. This adds it, on one deliberate simplification:
--
--   A seat is a booking, and it is released once, after the group's last session.
--
-- Each paid seat gets its own lesson record, dated at the last session. When the expert marks the
-- last session, every seat moves to "waiting for confirmation" with the lesson note, and from there
-- the existing rules apply unchanged: the learner confirms or it confirms itself after 48 hours, the
-- seat price is released at the seat commission rate, disputes, payouts and reconciliation all work
-- as they do for a one-to-one lesson. The PRD's per-session release for programmes (a share after
-- each session) is not built; an expert is paid for a programme when it ends. [assumption]
--
-- The seat price is what one learner pays for the whole group: every session of a class or programme.
--
--   create_run        the expert adds dates: one weekly session per week, from the first date
--   open_run          opens a draft for booking once the learning experience is approved
--   confirm_run       the expert confirms early, below the minimum
--   cancel_run        the expert cancels: every paid seat is credited in full
--   set_run_link      one Google Meet or Zoom link for the whole group
--   job_run_cutoff    24 hours before the first session: confirm if the minimum is met, else cancel and credit
--   mark_run_session  attendance and the lesson note for one session; the last one finishes the group

-- ---------------------------------------------------------------------------
-- 1. Dates
-- ---------------------------------------------------------------------------
create or replace function private.my_run(p_run uuid)
returns public.runs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype;
begin
  select * into r from public.runs where id = p_run;
  if not found or r.teacher_id is distinct from (select public.my_teacher_id()) then
    raise exception 'not your group' using errcode = 'insufficient_privilege';
  end if;
  return r;
end
$$;
revoke all on function private.my_run(uuid) from public, anon, authenticated;

create or replace function public.create_run(p_offering uuid, p_first_start timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o         public.offerings%rowtype;
  v_teacher uuid := (select public.my_teacher_id());
  v_n       integer;
  v_run     uuid;
  v_start   timestamptz;
begin
  select * into o from public.offerings where id = p_offering;
  if not found or v_teacher is null or o.teacher_id <> v_teacher then
    raise exception 'not your learning experience' using errcode = 'insufficient_privilege';
  end if;
  if o.format not in ('small_group', 'workshop', 'cohort') then
    raise exception 'dates are for group classes, workshops and programmes' using errcode = 'check_violation';
  end if;
  if o.price_seat_kes is null or o.capacity_max is null then
    raise exception 'add the price per learner and the group size first' using errcode = 'check_violation';
  end if;
  if o.listing_status in ('retired', 'paused') then
    raise exception 'this learning experience is paused' using errcode = 'check_violation';
  end if;
  if p_first_start is null or p_first_start < now() + interval '48 hours' then
    raise exception 'the first session must be at least 2 days from now' using errcode = 'check_violation';
  end if;
  if p_first_start > now() + interval '180 days' then
    raise exception 'choose a date within the next 6 months' using errcode = 'check_violation';
  end if;
  v_n := case when o.format = 'workshop' then 1 else coalesce(o.sessions_in_run, 1) end;
  for i in 0 .. v_n - 1 loop
    v_start := p_first_start + make_interval(days => 7 * i);
    if private.teacher_time_taken(v_teacher, gen_random_uuid(), v_start, o.duration_minutes)
       or exists (select 1 from public.sessions s join public.runs r on r.id = s.run_id
                   where r.teacher_id = v_teacher and r.status <> 'cancelled' and s.status <> 'cancelled'
                     and s.starts_at < v_start + make_interval(mins => o.duration_minutes) and v_start < s.ends_at) then
      raise exception 'you already have a lesson on %', to_char(v_start at time zone 'Africa/Nairobi', 'Dy DD Mon HH24:MI')
        using errcode = 'check_violation';
    end if;
  end loop;
  insert into public.runs (offering_id, starts_at, ends_at)
  values (o.id, p_first_start, p_first_start + make_interval(days => 7 * (v_n - 1), mins => o.duration_minutes))
  returning id into v_run;
  insert into public.sessions (run_id, sequence_no, starts_at, ends_at)
  select v_run, i + 1, p_first_start + make_interval(days => 7 * i),
         p_first_start + make_interval(days => 7 * i, mins => o.duration_minutes)
    from generate_series(0, v_n - 1) as g(i);
  if o.listing_status = 'approved' then
    update public.runs set status = 'open' where id = v_run;
  end if;
  return v_run;
end
$$;

create or replace function public.open_run(p_run uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype := private.my_run(p_run);
begin
  if r.status <> 'draft' then
    raise exception 'these dates are already %', r.status using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.offerings o where o.id = r.offering_id and o.listing_status = 'approved') then
    raise exception 'dates open for booking once the learning experience is approved' using errcode = 'check_violation';
  end if;
  if r.cutoff_at <= now() then
    raise exception 'these dates are too close now; add new ones' using errcode = 'check_violation';
  end if;
  update public.runs set status = 'open' where id = r.id;
end
$$;

create or replace function public.confirm_run(p_run uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype := private.my_run(p_run);
begin
  if r.status <> 'open' then
    raise exception 'these dates are %, not open', r.status using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.bookings b where b.run_id = r.id and b.status = 'scheduled') then
    raise exception 'nobody has booked yet' using errcode = 'check_violation';
  end if;
  update public.runs set status = 'confirmed' where id = r.id;
end
$$;

-- Ends a run that will not happen: every paid seat is credited in full, unpaid ones are dropped.
create or replace function private.close_run(p_run uuid, p_reason text, p_by text, p_rule text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b       record;
  v_seats integer := 0;
begin
  for b in select id, status from public.bookings where run_id = p_run and status in ('paid', 'accepted', 'scheduled') loop
    if p_by = 'teacher' then
      update public.bookings set cancelled_by_role = 'teacher' where id = b.id;
    end if;
    perform private.credit_booking(b.id, p_by, p_rule);
    v_seats := v_seats + 1;
  end loop;
  update public.bookings set status = 'cancelled' where run_id = p_run and status in ('requested', 'awaiting_payment');
  update public.sessions set status = 'cancelled' where run_id = p_run and status = 'scheduled';
  update public.runs set status = 'cancelled', cancel_reason = p_reason where id = p_run;
  return v_seats;
end
$$;
revoke all on function private.close_run(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.cancel_run(p_run uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype := private.my_run(p_run);
begin
  if r.status = 'draft' then
    delete from public.sessions where run_id = r.id;
    delete from public.runs where id = r.id;
    return;
  end if;
  if r.status not in ('open', 'confirmed') then
    raise exception 'a group that is % cannot be cancelled here; contact the concierge', r.status using errcode = 'check_violation';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'tell the learners briefly why' using errcode = 'check_violation';
  end if;
  perform private.close_run(r.id, 'teacher_cancelled', 'teacher', 'Group cancelled by the teacher: ' || left(btrim(p_reason), 200));
end
$$;

-- At the cut-off: enough seats and it runs; too few and everyone is credited, with no mark on the expert.
create or replace function private.job_run_cutoff()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r       record;
  v_count integer := 0;
begin
  for r in select id, capacity_min from public.runs where status = 'open' and cutoff_at <= now() for update skip locked loop
    if (select count(*) from public.bookings b where b.run_id = r.id and b.status = 'scheduled') >= r.capacity_min then
      update public.runs set status = 'confirmed' where id = r.id;
    else
      perform private.close_run(r.id, 'minimum_not_met', 'system', 'Too few learners booked: the group did not run');
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.job_run_cutoff() from public, anon, authenticated;

-- One meeting link for the whole group, shown to seat-holders once they have paid.
alter table public.runs add column meeting_link text
  check (meeting_link is null or meeting_link ~ '^https://(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us)/[A-Za-z0-9/?=&._-]+$');

create or replace function public.set_run_link(p_run uuid, p_link text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r      public.runs%rowtype := private.my_run(p_run);
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if r.status in ('completed', 'cancelled') then
    raise exception 'this group is %', r.status using errcode = 'check_violation';
  end if;
  if v_link is not null and v_link !~ '^https://(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us)/[A-Za-z0-9/?=&._-]+$' then
    raise exception 'add a Google Meet or Zoom link' using errcode = 'check_violation';
  end if;
  update public.runs set meeting_link = v_link where id = r.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. A paid seat is reserved at once: no accept step, and its lesson record is dated at the last session
-- ---------------------------------------------------------------------------
create or replace function private.bookings_seat_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
begin
  select s.starts_at, s.ends_at into v_start, v_end
    from public.sessions s where s.run_id = new.run_id order by s.sequence_no desc limit 1;
  if v_start is null then
    select r.starts_at, r.ends_at into v_start, v_end from public.runs r where r.id = new.run_id;
  end if;
  update public.bookings set status = 'accepted' where id = new.id;
  update public.bookings set status = 'scheduled' where id = new.id;
  insert into public.sessions (booking_id, starts_at, ends_at)
  select new.id, v_start, v_end where not exists (select 1 from public.sessions s where s.booking_id = new.id);
  return null;
end
$$;
create trigger bookings_20_seat_paid after update of status on public.bookings
  for each row when (new.kind = 'seat' and new.status = 'paid' and old.status is distinct from 'paid')
  execute function private.bookings_seat_paid();
revoke all on function private.bookings_seat_paid() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The session: attendance and the note. The last session finishes the group.
-- ---------------------------------------------------------------------------
create or replace function public.mark_run_session(p_session uuid, p_attendance jsonb, p_covered text, p_progress text, p_next text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s       public.sessions%rowtype;
  r       public.runs%rowtype;
  b       record;
  v_mark  text;
  v_seat  uuid;
  v_last  boolean;
  v_att   integer;
  v_total integer;
begin
  select * into s from public.sessions where id = p_session and run_id is not null for update;
  if not found then
    raise exception 'not your group' using errcode = 'insufficient_privilege';
  end if;
  r := private.my_run(s.run_id);
  if r.status not in ('confirmed', 'in_progress') then
    raise exception 'this group is %, so there is nothing to mark', r.status using errcode = 'check_violation';
  end if;
  if s.status <> 'scheduled' then
    raise exception 'this session is already marked' using errcode = 'check_violation';
  end if;
  if now() < s.starts_at then
    raise exception 'mark the session once it has started' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.sessions x where x.run_id = r.id and x.sequence_no < s.sequence_no and x.status = 'scheduled') then
    raise exception 'mark the earlier session first' using errcode = 'check_violation';
  end if;
  if p_covered is null or char_length(btrim(p_covered)) < 10 then
    raise exception 'say what you covered (at least 10 characters)' using errcode = 'check_violation';
  end if;

  for b in select id from public.bookings where run_id = r.id and status = 'scheduled' loop
    v_mark := coalesce(p_attendance ->> b.id::text, 'absent');
    if v_mark not in ('present', 'late', 'absent') then
      raise exception 'mark each learner present, late or absent' using errcode = 'check_violation';
    end if;
    insert into public.attendance (session_id, booking_id, status, marked_by) values (s.id, b.id, v_mark, auth.uid());
  end loop;
  insert into public.lesson_notes (session_id, covered, progress, next_steps, filed_by)
  values (s.id, btrim(p_covered), nullif(btrim(coalesce(p_progress, '')), ''), nullif(btrim(coalesce(p_next, '')), ''), auth.uid());

  update public.sessions set status = 'in_progress', checked_in_at = s.starts_at, checkin_method = 'manual' where id = s.id;
  update public.sessions set status = 'awaiting_note', checked_out_at = least(now(), s.ends_at),
         actual_minutes = greatest(1, round(extract(epoch from least(now(), s.ends_at) - s.starts_at) / 60)::integer) where id = s.id;
  update public.sessions set status = 'awaiting_confirmation' where id = s.id;
  update public.sessions set status = 'confirmed', confirmed_at = now(), confirmed_by = 'auto' where id = s.id;
  if r.status = 'confirmed' then
    update public.runs set status = 'in_progress' where id = r.id;
  end if;

  v_last := not exists (select 1 from public.sessions x where x.run_id = r.id and x.sequence_no > s.sequence_no);
  if not v_last then
    return;
  end if;

  -- The group is over: each seat's own lesson record takes the note and waits for the learner to confirm.
  select count(*) into v_total from public.sessions x where x.run_id = r.id;
  for b in select id from public.bookings where run_id = r.id and status = 'scheduled' loop
    select x.id into v_seat from public.sessions x where x.booking_id = b.id;
    select count(*) into v_att from public.attendance a join public.sessions x on x.id = a.session_id
     where x.run_id = r.id and a.booking_id = b.id and a.status in ('present', 'late');
    update public.sessions set status = 'in_progress', checked_in_at = s.starts_at, checkin_method = 'manual' where id = v_seat;
    update public.sessions set status = 'awaiting_note', checked_out_at = least(now(), s.ends_at) where id = v_seat;
    insert into public.lesson_notes (session_id, covered, progress, next_steps, filed_by)
    values (v_seat, btrim(p_covered),
            'Attended ' || v_att || ' of ' || v_total || case when v_total = 1 then ' session.' else ' sessions.' end
              || coalesce(' ' || nullif(btrim(coalesce(p_progress, '')), ''), ''),
            nullif(btrim(coalesce(p_next, '')), ''), auth.uid());
    update public.sessions set status = 'awaiting_confirmation' where id = v_seat;
    update public.bookings set status = 'in_progress' where id = b.id;
    update public.bookings set status = 'awaiting_note' where id = b.id;
    update public.bookings set status = 'awaiting_confirmation' where id = b.id;
  end loop;
  update public.runs set status = 'completed' where id = r.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads
-- ---------------------------------------------------------------------------
-- The expert's groups, each with its sessions and the people in it.
create or replace function public.my_runs()
returns table (
  id uuid, offering_id uuid, title text, format text, status public.run_status, cancel_reason text,
  starts_at timestamptz, ends_at timestamptz, cutoff_at timestamptz, capacity_min integer, capacity_max integer,
  price_kes integer, duration_minutes integer, meeting_link text, sessions jsonb, seats jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.offering_id, o.title, r.format, r.status, r.cancel_reason, r.starts_at, r.ends_at, r.cutoff_at,
         r.capacity_min, r.capacity_max, r.price_kes, o.duration_minutes, r.meeting_link,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', s.id, 'sequence_no', s.sequence_no, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
                     'covered', (select n.covered from public.lesson_notes n where n.session_id = s.id),
                     'attendance', coalesce((select jsonb_object_agg(a.booking_id, a.status) from public.attendance a where a.session_id = s.id), '{}'::jsonb))
                     order by s.sequence_no)
                     from public.sessions s where s.run_id = r.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'booking_id', b.id, 'learner_alias', l.alias,
                     'payer_first_name', nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), ''),
                     'status', b.status, 'paid_at', b.paid_at, 'price_kes', b.price_kes,
                     'hold_status', (select pay.hold_status from public.payments pay where pay.booking_id = b.id and pay.status = 'succeeded' limit 1))
                     order by b.paid_at)
                     from public.bookings b
                     join public.learners l on l.id = b.learner_id
                     left join public.profiles p on p.id = b.booked_by_user_id
                    where b.run_id = r.id and b.status not in ('requested', 'awaiting_payment')), '[]'::jsonb)
    from public.runs r
    join public.offerings o on o.id = r.offering_id
   where r.teacher_id = (select public.my_teacher_id())
   order by r.starts_at desc
$$;

-- Dates a learner can book now: open or confirmed, before the cut-off, with seats left.
create view public.offer_runs with (security_invoker = false) as
select r.id, r.offering_id, o.slug, r.format, r.status, r.starts_at, r.ends_at, r.cutoff_at, r.price_kes, r.capacity_max,
       r.capacity_max - r.seats_reserved as seats_left, o.duration_minutes,
       coalesce(array(select s.starts_at from public.sessions s where s.run_id = r.id order by s.sequence_no), '{}'::timestamptz[]) as session_starts
  from public.runs r
  join public.offerings o on o.id = r.offering_id
  join private.visible_offerings v on v.id = o.id
 where r.status in ('open', 'confirmed') and r.cutoff_at > now() and r.seats_reserved < r.capacity_max;
grant select on public.offer_runs to anon, authenticated, service_role;

-- A seat-holder's own view of their group: the sessions and whether they were marked present.
create or replace function public.my_seat(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'run_id', r.id, 'run_status', r.status, 'cancel_reason', r.cancel_reason, 'format', r.format,
           'meeting_link', case when b.status in ('scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation') then r.meeting_link end,
           'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                         'sequence_no', s.sequence_no, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
                         'attendance', (select a.status from public.attendance a where a.session_id = s.id and a.booking_id = b.id))
                         order by s.sequence_no)
                         from public.sessions s where s.run_id = r.id), '[]'::jsonb))
    from public.bookings b
    join public.runs r on r.id = b.run_id
   where b.id = p_booking and b.kind = 'seat'
     and (b.booked_by_user_id = (select auth.uid()) or public.owns_learner(b.learner_id))
$$;

revoke all on function public.create_run(uuid, timestamptz), public.open_run(uuid), public.confirm_run(uuid), public.cancel_run(uuid, text),
  public.set_run_link(uuid, text), public.mark_run_session(uuid, jsonb, text, text, text), public.my_runs(), public.my_seat(uuid) from public, anon;
grant execute on function public.create_run(uuid, timestamptz), public.open_run(uuid), public.confirm_run(uuid), public.cancel_run(uuid, text),
  public.set_run_link(uuid, text), public.mark_run_session(uuid, jsonb, text, text, text), public.my_runs(), public.my_seat(uuid) to authenticated, service_role;
