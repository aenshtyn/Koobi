-- Koobi 0600: packages (FR-BOOK-6/7), bookings (FR-BOOK-2/3, §8.2), sessions, attendance per seat
-- (FR-SESS-7), lesson notes (FR-SESS-3).

create type public.booking_kind as enum ('trial', 'single', 'package_session', 'managed_plan_session', 'seat');
create type public.booking_status as enum (
  'requested', 'awaiting_payment', 'paid', 'accepted', 'scheduled', 'in_progress', 'awaiting_note',
  'awaiting_confirmation', 'confirmed', 'disputed', 'no_show_teacher', 'no_show_learner', 'cancelled', 'lapsed');
create type public.session_status as enum (
  'scheduled', 'in_progress', 'awaiting_note', 'awaiting_confirmation', 'confirmed', 'disputed',
  'no_show_teacher', 'no_show_learner', 'cancelled');
create type public.package_status as enum ('pending_payment', 'active', 'completed', 'expired', 'cancelled');

create table public.packages (
  id                  uuid primary key default gen_random_uuid(),
  learner_id          uuid not null references public.learners (id),
  offering_id         uuid not null references public.offerings (id),
  teacher_id          uuid not null references public.teachers (id),
  booked_by_user_id   uuid not null default auth.uid() references public.profiles (id),
  plan_type           text not null default 'standard' check (plan_type in ('standard', 'managed')),
  sessions_total      integer not null check (sessions_total between 1 and 52),
  sessions_used       integer not null default 0,
  price_kes           integer not null check (price_kes > 0),
  starts_on           date not null default ((now() at time zone 'Africa/Nairobi')::date),
  ends_on             date,
  cadence_per_week    integer not null default 1 check (cadence_per_week between 1 and 7),
  status              public.package_status not null default 'pending_payment',
  is_renewal          boolean not null default false,
  previous_package_id uuid references public.packages (id),
  billing_day         integer check (billing_day between 1 and 28),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint packages_used_within_total check (sessions_used between 0 and sessions_total),
  constraint packages_dates check (ends_on is null or ends_on >= starts_on),
  constraint packages_billing_day_managed check (billing_day is null or plan_type = 'managed')
);
create index packages_learner_idx on public.packages (learner_id);

create table public.bookings (
  id                            uuid primary key default gen_random_uuid(),
  offering_id                   uuid not null references public.offerings (id),
  learner_id                    uuid not null references public.learners (id),
  teacher_id                    uuid not null references public.teachers (id),
  booked_by_user_id             uuid not null default auth.uid() references public.profiles (id),  -- the payer
  match_id                      uuid references public.matches (id),
  package_id                    uuid references public.packages (id),
  run_id                        uuid references public.runs (id),
  location_id                   uuid references public.locations (id),
  kind                          public.booking_kind not null,
  mode                          text not null check (mode in ('online', 'in_home', 'teacher_premises', 'site')),
  starts_at                     timestamptz not null,
  duration_minutes              integer not null default 60 check (duration_minutes between 15 and 600),
  learner_time_zone             text not null default 'Africa/Nairobi',
  teacher_time_zone             text not null default 'Africa/Nairobi',
  price_kes                     integer not null check (price_kes >= 0),  -- KES list price
  discount_kes                  integer not null default 0,
  charge_currency               text not null default 'KES' check (charge_currency in ('KES', 'USD')),
  charge_amount_frozen          numeric(12, 2) check (charge_amount_frozen > 0),  -- USD display price frozen at checkout
  meeting_link_enc              text,
  policy_version                text references public.policy_versions (version),
  policy_acknowledged_at        timestamptz,
  status                        public.booking_status not null default 'requested',
  paid_at                       timestamptz,
  accepted_at                   timestamptz,
  cancelled_at                  timestamptz,
  cancelled_by_role             text check (cancelled_by_role in ('payer', 'teacher', 'staff', 'system')),
  cancellation_rule             text,
  guardian_present_ack_teacher  boolean not null default false,
  guardian_present_ack_guardian boolean not null default false,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint bookings_discount check (discount_kes between 0 and price_kes),
  constraint bookings_seat_has_run check ((kind = 'seat') = (run_id is not null)),
  constraint bookings_package_session check ((kind = 'package_session') = (package_id is not null) or kind = 'managed_plan_session')
);
create index bookings_teacher_idx on public.bookings (teacher_id, starts_at);
create index bookings_learner_idx on public.bookings (learner_id, starts_at);
create index bookings_payer_idx on public.bookings (booked_by_user_id);
create index bookings_run_idx on public.bookings (run_id) where run_id is not null;

alter table public.requests
  add constraint requests_replacement_booking_fk foreign key (is_replacement_for_booking_id) references public.bookings (id);

-- ---------------------------------------------------------------------------
-- Server-side pricing floor: when a user (not the system) creates a package or booking, the teacher,
-- price and discount come from the approved offering, run or package, never from the client.
-- ---------------------------------------------------------------------------
create or replace function private.quote_package(p_offering uuid, p_sessions integer)
returns table (teacher_id uuid, price_kes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.offerings%rowtype;
begin
  select * into o from public.offerings where id = p_offering;
  if not found or o.listing_status <> 'approved' or o.format <> 'one_to_one' then
    raise exception 'offering % is not an approved one-to-one offering', p_offering using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teachers t where t.id = o.teacher_id and t.listing_status = 'approved'
                  and t.status not in ('suspended', 'offboarded')) then
    raise exception 'teacher is not bookable' using errcode = 'check_violation';
  end if;
  teacher_id := o.teacher_id;
  price_kes := case p_sessions
                 when 8  then coalesce(o.price_pkg8_kes,  o.price_hour_kes * 8)
                 when 12 then coalesce(o.price_pkg12_kes, o.price_hour_kes * 12)
                 when 16 then coalesce(o.price_pkg16_kes, o.price_hour_kes * 16)
                 else o.price_hour_kes * p_sessions
               end;
  return next;
end
$$;

create or replace function private.quote_booking(
  p_offering uuid, p_kind public.booking_kind, p_run uuid, p_package uuid, p_duration integer)
returns table (teacher_id uuid, price_kes integer, discount_kes integer, starts_at timestamptz, duration_minutes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.offerings%rowtype;
  r public.runs%rowtype;
  p public.packages%rowtype;
  v_full integer;
begin
  select * into o from public.offerings where id = p_offering;
  if not found or o.listing_status <> 'approved' then
    raise exception 'offering % is not approved', p_offering using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teachers t where t.id = o.teacher_id and t.listing_status = 'approved'
                  and t.status not in ('suspended', 'offboarded')) then
    raise exception 'teacher is not bookable' using errcode = 'check_violation';
  end if;
  teacher_id := o.teacher_id;
  discount_kes := 0;
  starts_at := null;

  if p_kind = 'seat' then
    if o.format = 'one_to_one' then
      raise exception 'seat bookings need a seat-based offering' using errcode = 'check_violation';
    end if;
    select * into r from public.runs where id = p_run and offering_id = p_offering;
    if not found or r.status not in ('open', 'confirmed') then
      raise exception 'run % is not open for this offering', p_run using errcode = 'check_violation';
    end if;
    price_kes := r.price_kes;
    starts_at := r.starts_at;
    duration_minutes := o.duration_minutes;
  else
    if o.format <> 'one_to_one' then
      raise exception '% bookings need a one-to-one offering', p_kind using errcode = 'check_violation';
    end if;
    duration_minutes := coalesce(p_duration, o.duration_minutes);
    v_full := round(o.price_hour_kes * duration_minutes / 60.0)::integer;
    if p_kind = 'package_session' then
      select * into p from public.packages where id = p_package and offering_id = p_offering;
      if not found or p.status <> 'active' then
        raise exception 'package % is not active for this offering', p_package using errcode = 'check_violation';
      end if;
      price_kes := round(p.price_kes::numeric / p.sessions_total)::integer;  -- released per session (FR-LEDGER-5)
    elsif p_kind = 'trial' then
      if o.trial_discount_pct is null then
        raise exception 'this offering has no trial' using errcode = 'check_violation';
      end if;
      price_kes := v_full;
      discount_kes := round(v_full * o.trial_discount_pct / 100.0)::integer;
    else
      price_kes := v_full;
    end if;
  end if;
  return next;
end
$$;

create or replace function private.packages_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  q record;
begin
  if private.is_system() then
    return new;
  end if;
  select * into q from private.quote_package(new.offering_id, new.sessions_total);
  new.teacher_id := q.teacher_id;
  new.price_kes := q.price_kes;
  new.booked_by_user_id := auth.uid();
  new.sessions_used := 0;
  return new;
end
$$;

create or replace function private.bookings_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  q record;
begin
  if private.is_system() then
    return new;
  end if;
  select * into q from private.quote_booking(new.offering_id, new.kind, new.run_id, new.package_id, new.duration_minutes);
  new.teacher_id := q.teacher_id;
  new.price_kes := q.price_kes;
  new.discount_kes := q.discount_kes;
  new.duration_minutes := q.duration_minutes;
  if q.starts_at is not null then
    new.starts_at := q.starts_at;
  end if;
  return new;
end
$$;

create trigger packages_05_price before insert on public.packages
  for each row execute function private.packages_price();
create trigger packages_10_transition before insert or update of status on public.packages
  for each row execute function private.enforce_transition('package', 'status');
create trigger packages_updated_at before update on public.packages
  for each row execute function private.set_updated_at();

create or replace function private.stamp_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'paid'      then new.paid_at := coalesce(new.paid_at, now());
      when 'accepted'  then new.accepted_at := coalesce(new.accepted_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      when 'lapsed'    then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end
$$;

-- Seats: runs.seats_reserved is maintained atomically by increments; the runs check constraint
-- (seats_reserved <= capacity_max) refuses an overbooked seat.
create or replace function private.bookings_seat_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was boolean := false;
  v_is  boolean := false;
begin
  if tg_op = 'UPDATE' and old.kind = 'seat' then
    v_was := old.status not in ('cancelled', 'lapsed');
  end if;
  if new.kind = 'seat' then
    v_is := new.status not in ('cancelled', 'lapsed');
  end if;
  if v_is and not v_was then
    update public.runs set seats_reserved = seats_reserved + 1 where id = new.run_id;
  elsif v_was and not v_is then
    update public.runs set seats_reserved = seats_reserved - 1 where id = old.run_id;
  end if;
  return new;
end
$$;

create trigger bookings_05_price before insert on public.bookings
  for each row execute function private.bookings_price();
create trigger bookings_10_transition before insert or update of status on public.bookings
  for each row execute function private.enforce_transition('booking', 'status');
create trigger bookings_20_stamp before update of status on public.bookings
  for each row execute function private.stamp_booking();
create trigger bookings_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();
create trigger bookings_seat_count after insert or update of status on public.bookings
  for each row execute function private.bookings_seat_count();

-- ---------------------------------------------------------------------------
-- Sessions, attendance, lesson notes
-- ---------------------------------------------------------------------------
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid references public.bookings (id),  -- one-to-one
  run_id             uuid references public.runs (id),      -- group sessions
  sequence_no        smallint not null default 1 check (sequence_no >= 1),
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  checked_in_at      timestamptz,
  checkin_method     text check (checkin_method in ('gps', 'link_open', 'manual', 'staff_override')),
  checkin_distance_m integer check (checkin_distance_m >= 0),
  link_opened_at     timestamptz,
  checked_out_at     timestamptz,
  actual_minutes     integer check (actual_minutes >= 0),
  device_checkin_at  timestamptz,
  device_checkout_at timestamptz,
  confirmed_at       timestamptz,
  confirmed_by       text check (confirmed_by in ('payer', 'auto', 'staff')),
  status             public.session_status not null default 'scheduled',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sessions_one_parent check (num_nonnulls(booking_id, run_id) = 1),
  constraint sessions_time_order check (ends_at > starts_at)
);
create unique index sessions_booking_key on public.sessions (booking_id) where booking_id is not null;
create unique index sessions_run_sequence_key on public.sessions (run_id, sequence_no) where run_id is not null;

create trigger sessions_10_transition before insert or update of status on public.sessions
  for each row execute function private.enforce_transition('session', 'status');
create trigger sessions_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  booking_id     uuid not null references public.bookings (id),  -- the seat
  status         text not null check (status in ('present', 'late', 'absent')),
  marked_at      timestamptz not null default now(),
  marked_by      uuid default auth.uid() references public.profiles (id),
  corrected_by   uuid references public.profiles (id),
  confirmed_at   timestamptz,
  confirmed_by   text check (confirmed_by in ('payer', 'auto', 'staff')),
  release_status text not null default 'held' check (release_status in ('held', 'released', 'credited', 'disputed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, booking_id)
);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function private.set_updated_at();

create table public.lesson_notes (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null unique references public.sessions (id) on delete cascade,
  covered           text not null check (char_length(covered) between 1 and 4000),
  progress          text check (char_length(progress) <= 4000),
  next_steps        text check (char_length(next_steps) <= 4000),
  per_learner_lines jsonb not null default '[]',
  prep_minutes      integer check (prep_minutes >= 0),
  travel_minutes    integer check (travel_minutes >= 0),
  filed_by          uuid default auth.uid() references public.profiles (id),
  filed_at          timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger lesson_notes_updated_at before update on public.lesson_notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pair helpers for RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_booking_payer(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
      join public.learners l on l.id = b.learner_id
      left join public.guardians g on g.id = l.guardian_id
     where b.id = p_booking
       and (b.booked_by_user_id = (select auth.uid()) or l.user_id = (select auth.uid()) or g.user_id = (select auth.uid())))
$$;

create or replace function public.is_booking_teacher(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b join public.teachers t on t.id = b.teacher_id
     where b.id = p_booking and t.user_id = (select auth.uid()))
$$;

create or replace function public.is_booking_party(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_booking_payer(p_booking) or public.is_booking_teacher(p_booking)
$$;

create or replace function public.holds_run_seat(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where b.run_id = p_run and b.kind = 'seat' and b.status not in ('cancelled', 'lapsed')
       and public.is_booking_payer(b.id))
$$;

create or replace function public.is_session_teacher(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session
       and ((s.booking_id is not null and public.is_booking_teacher(s.booking_id))
         or (s.run_id is not null and public.owns_run(s.run_id))))
$$;

create or replace function public.is_session_party(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session
       and ((s.booking_id is not null and public.is_booking_party(s.booking_id))
         or (s.run_id is not null and (public.owns_run(s.run_id) or public.holds_run_seat(s.run_id)))))
$$;

-- ---------------------------------------------------------------------------
-- §8.2 booking and session machine. Transitions that move held money are system-only: they are
-- performed by SECURITY DEFINER functions or Edge Functions that post the ledger in the same transaction.
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  ('booking', '[*]',                   'requested',             '{any}',                     'created from match, browse or package schedule'),
  ('booking', 'requested',             'awaiting_payment',      '{any}',                     'payer proceeds to checkout'),
  ('booking', 'requested',             'cancelled',             '{any}',                     'abandoned before checkout [added]'),
  ('booking', 'awaiting_payment',      'paid',                  '{system}',                  'payment succeeded, hold posted'),
  ('booking', 'awaiting_payment',      'cancelled',             '{any}',                     'abandoned after 24 hours or three failed attempts'),
  ('booking', 'paid',                  'accepted',              '{teacher,concierge,admin}', 'teacher accepts within the response window'),
  ('booking', 'paid',                  'lapsed',                '{system}',                  'no teacher response in window, hold returned as credit'),
  ('booking', 'paid',                  'cancelled',             '{system}',                  'teacher declines, hold credited [added: FR-BOOK-3 decline]'),
  ('booking', 'accepted',              'scheduled',             '{teacher,concierge,admin}', 'meeting link present or location approved'),
  ('booking', 'accepted',              'cancelled',             '{system}',                  'cancellation rule applied before scheduling [added]'),
  ('booking', 'scheduled',             'in_progress',           '{teacher,concierge,admin}', 'teacher checks in'),
  ('booking', 'scheduled',             'cancelled',             '{system}',                  'cancellation rule applied, ledger posted'),
  ('booking', 'scheduled',             'no_show_teacher',       '{concierge,admin}',         'no check-in after the grace period'),
  ('booking', 'in_progress',           'awaiting_note',         '{teacher,concierge,admin}', 'teacher checks out'),
  ('booking', 'in_progress',           'no_show_learner',       '{teacher,concierge,admin}', 'teacher reports learner absent after the grace period'),
  ('booking', 'awaiting_note',         'awaiting_confirmation', '{teacher,concierge,admin}', 'lesson note filed'),
  ('booking', 'awaiting_confirmation', 'confirmed',             '{system}',                  'payer confirms or auto-confirm; entitlement posted'),
  ('booking', 'awaiting_confirmation', 'disputed',              '{any}',                     'payer reports a problem'),
  ('booking', 'disputed',              'confirmed',             '{system}',                  'dispute outcome: release to teacher'),
  ('booking', 'disputed',              'cancelled',             '{system}',                  'dispute outcome: refund or credit'),
  ('booking', 'no_show_teacher',       'cancelled',             '{system}',                  'full credit, reliability mark'),
  ('booking', 'no_show_learner',       'confirmed',             '{system}',                  'released to teacher under the no-show rule'),

  ('session', '[*]',                   'scheduled',             '{any}',                     'session scheduled'),
  ('session', 'scheduled',             'in_progress',           '{teacher,concierge,admin}', 'teacher checks in'),
  ('session', 'scheduled',             'cancelled',             '{system}',                  'booking or run cancelled'),
  ('session', 'scheduled',             'no_show_teacher',       '{concierge,admin}',         'no check-in after the grace period'),
  ('session', 'in_progress',           'awaiting_note',         '{teacher,concierge,admin}', 'teacher checks out'),
  ('session', 'in_progress',           'no_show_learner',       '{teacher,concierge,admin}', 'learner absent after the grace period'),
  ('session', 'awaiting_note',         'awaiting_confirmation', '{teacher,concierge,admin}', 'lesson note filed'),
  ('session', 'awaiting_confirmation', 'confirmed',             '{system}',                  'payer confirms or auto-confirm'),
  ('session', 'awaiting_confirmation', 'disputed',              '{any}',                     'payer reports a problem'),
  ('session', 'disputed',              'confirmed',             '{system}',                  'dispute outcome: release'),
  ('session', 'disputed',              'cancelled',             '{system}',                  'dispute outcome: refund or credit'),
  ('session', 'no_show_teacher',       'cancelled',             '{system}',                  'full credit'),
  ('session', 'no_show_learner',       'confirmed',             '{system}',                  'released under the no-show rule'),

  ('package', '[*]',             'pending_payment', '{any}',    'package chosen at checkout'),
  ('package', 'pending_payment', 'active',          '{system}', 'payment succeeded, hold posted'),
  ('package', 'pending_payment', 'cancelled',       '{any}',    'checkout abandoned'),
  ('package', 'active',          'completed',       '{system}', 'all sessions delivered'),
  ('package', 'active',          'expired',         '{system}', 'validity ended, remainder credited or refunded'),
  ('package', 'active',          'cancelled',       '{system}', 'cancelled, remainder credited or refunded');
