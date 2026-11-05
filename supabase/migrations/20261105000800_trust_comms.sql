-- Koobi 0800: reviews (FR-REV-1), learner reliability ratings, disputes (FR-DISP, §8.4),
-- masked messaging (FR-MSG), notifications and preferences (FR-NOTIF).

create type public.dispute_type as enum (
  'teacher_no_show', 'learner_no_show', 'short_session', 'quality', 'safety', 'payment', 'solicitation',
  'chargeback', 'technical_failure', 'exception_request', 'other');
create type public.dispute_status as enum ('open', 'in_review', 'awaiting_party', 'resolved', 'escalated', 'reopened', 'closed');
create type public.dispute_outcome as enum (
  'release', 'partial_refund', 'full_refund', 'credit', 'replacement', 'teacher_penalty', 'dismissed');

-- ---------------------------------------------------------------------------
-- Reviews: one per confirmed booking (or seat), attached to the offering.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null unique references public.bookings (id),
  offering_id        uuid not null references public.offerings (id),
  teacher_id         uuid not null references public.teachers (id),
  author_user_id     uuid not null default auth.uid() references public.profiles (id),
  rating             smallint not null check (rating between 1 and 5),
  body               text check (char_length(body) <= 2000),
  teacher_reply      text check (char_length(teacher_reply) <= 1000),
  teacher_replied_at timestamptz,
  status             text not null default 'published' check (status in ('published', 'held', 'removed')),
  moderation_reason  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index reviews_offering_idx on public.reviews (offering_id) where status = 'published';
create index reviews_teacher_idx on public.reviews (teacher_id) where status = 'published';

-- Only for completed (confirmed) bookings, written by the payer; offering and teacher come from the booking.
create or replace function private.reviews_require_completed_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found or b.status <> 'confirmed' then
    raise exception 'reviews are only accepted for completed bookings' using errcode = 'check_violation';
  end if;
  if auth.uid() is not null then
    if not public.is_booking_payer(b.id) then
      raise exception 'only the payer of the booking can review it' using errcode = 'insufficient_privilege';
    end if;
    new.author_user_id := auth.uid();
  end if;
  new.offering_id := b.offering_id;
  new.teacher_id := b.teacher_id;
  return new;
end
$$;

-- The teacher replies once; moderation is staff-only.
create or replace function private.reviews_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_system() or public.has_any_role(array['concierge', 'admin']::public.app_role[]) then
    if new.teacher_reply is distinct from old.teacher_reply and old.teacher_reply is null then
      new.teacher_replied_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.moderation_reason is distinct from old.moderation_reason then
    raise exception 'review moderation is staff-only' using errcode = 'insufficient_privilege';
  end if;
  if new.teacher_reply is distinct from old.teacher_reply then
    if old.teacher_reply is not null then
      raise exception 'the teacher can reply to a review once' using errcode = 'check_violation';
    end if;
    new.teacher_replied_at := now();
  end if;
  return new;
end
$$;

create trigger reviews_05_completed_booking before insert on public.reviews
  for each row execute function private.reviews_require_completed_booking();
create trigger reviews_06_guard before update on public.reviews
  for each row execute function private.reviews_guard_update();
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

-- Teacher's private rating of the learner's reliability (never public).
create table public.learner_reliability_ratings (
  booking_id uuid primary key references public.bookings (id),
  teacher_id uuid not null references public.teachers (id),
  rating     smallint not null check (rating between 1 and 5),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger learner_reliability_ratings_updated_at before update on public.learner_reliability_ratings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Disputes (§8.4)
-- ---------------------------------------------------------------------------
create table public.disputes (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings (id),
  session_id        uuid references public.sessions (id),
  opened_by_user_id uuid default auth.uid() references public.profiles (id),
  opened_by_role    text not null default 'payer' check (opened_by_role in ('payer', 'teacher', 'staff', 'system')),
  type              public.dispute_type not null,
  status            public.dispute_status not null default 'open',
  description       text check (char_length(description) <= 2000),
  sla_due_at        timestamptz not null,
  outcome           public.dispute_outcome,
  refund_kes        integer not null default 0 check (refund_kes >= 0),
  credit_kes        integer not null default 0 check (credit_kes >= 0),
  clawback_kes      integer not null default 0 check (clawback_kes >= 0),
  staff_minutes     integer not null default 0 check (staff_minutes >= 0),
  handled_by        uuid references public.profiles (id),
  evidence_snapshot jsonb not null default '{}',
  resolved_at       timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint disputes_outcome_when_resolved check (status not in ('resolved', 'closed') or outcome is not null)
);
create index disputes_booking_idx on public.disputes (booking_id);
create index disputes_open_idx on public.disputes (sla_due_at) where status in ('open', 'in_review', 'awaiting_party', 'escalated', 'reopened');

create or replace function private.disputes_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_system() then
    new.opened_by_user_id := auth.uid();
    new.opened_by_role := case
      when public.is_booking_teacher(new.booking_id) then 'teacher'
      when public.is_booking_payer(new.booking_id) then 'payer'
      else 'staff' end;
  end if;
  -- 24 hours for safety (IDEA §3); 72 hours otherwise [assumption]
  new.sla_due_at := coalesce(new.sla_due_at,
    now() + case when new.type = 'safety' then interval '24 hours' else interval '72 hours' end);
  return new;
end
$$;

create or replace function private.stamp_dispute()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := now();
    elsif new.status = 'closed' then
      new.closed_at := now();
    end if;
  end if;
  return new;
end
$$;

create trigger disputes_05_defaults before insert on public.disputes
  for each row execute function private.disputes_defaults();
create trigger disputes_10_transition before insert or update of status on public.disputes
  for each row execute function private.enforce_transition('dispute', 'status');
create trigger disputes_20_stamp before update of status on public.disputes
  for each row execute function private.stamp_dispute();
create trigger disputes_updated_at before update on public.disputes
  for each row execute function private.set_updated_at();

alter table public.ledger_entries
  add constraint ledger_entries_dispute_fk foreign key (dispute_id) references public.disputes (id);
alter table public.refunds
  add constraint refunds_dispute_fk foreign key (dispute_id) references public.disputes (id);

-- ---------------------------------------------------------------------------
-- Messaging (FR-MSG). Phone numbers are never part of a thread; contact is revealed by the API after
-- the first paid booking. In a run thread seat-holders see only their own messages and the teacher's
-- broadcasts, never each other.
-- ---------------------------------------------------------------------------
create table public.message_threads (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('pair', 'run', 'concierge')),
  owner_user_id       uuid references public.profiles (id),  -- the teacher for run threads
  match_id            uuid references public.matches (id),
  booking_id          uuid references public.bookings (id),
  run_id              uuid references public.runs (id),
  request_id          uuid references public.requests (id),
  contact_revealed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint message_threads_run_owner check (kind <> 'run' or (run_id is not null and owner_user_id is not null))
);
create trigger message_threads_updated_at before update on public.message_threads
  for each row execute function private.set_updated_at();

create table public.thread_participants (
  thread_id    uuid not null references public.message_threads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('payer', 'teacher', 'staff')),
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.message_threads (id) on delete cascade,
  sender_user_id    uuid not null default auth.uid() references public.profiles (id),
  recipient_user_id uuid references public.profiles (id),  -- null = everyone the thread kind allows
  body              text not null check (char_length(body) between 1 and 4000),
  attachment_key    text,  -- restricted storage
  redacted          boolean not null default false,
  flagged_reason    text,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create or replace function public.is_thread_participant(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.thread_participants tp
                  where tp.thread_id = p_thread and tp.user_id = (select auth.uid()))
$$;

create or replace function public.can_read_message(p_thread uuid, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads th
      join public.thread_participants tp on tp.thread_id = th.id and tp.user_id = (select auth.uid())
     where th.id = p_thread
       and (p_sender = (select auth.uid())
         or p_recipient = (select auth.uid())
         or (p_recipient is null and (th.kind <> 'run' or p_sender = th.owner_user_id))))
$$;

create or replace function public.can_post_message(p_thread uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads th
      join public.thread_participants tp on tp.thread_id = th.id and tp.user_id = (select auth.uid())
     where th.id = p_thread
       and (th.kind <> 'run' or th.owner_user_id = (select auth.uid()) or p_recipient = th.owner_user_id))
$$;

-- ---------------------------------------------------------------------------
-- Notifications (FR-NOTIF). Idempotent per (user, template, channel, entity).
-- ---------------------------------------------------------------------------
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  template            text not null,
  locale              text not null default 'en' check (locale in ('en', 'sw')),
  channel             text not null check (channel in ('sms', 'whatsapp', 'email', 'in_app')),
  recipient_time_zone text not null default 'Africa/Nairobi',
  entity_type         text,
  entity_id           uuid,
  payload             jsonb not null default '{}',  -- allow-listed fields only (§6.4 rule 6)
  vendor              text,
  vendor_msg_id       text,
  status              text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'fallback_sent', 'read')),
  cost_cents          integer check (cost_cents >= 0),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint notifications_idempotent unique nulls not distinct (user_id, template, channel, entity_type, entity_id)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create trigger notifications_updated_at before update on public.notifications
  for each row execute function private.set_updated_at();

create table public.notification_preferences (
  user_id           uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  whatsapp_opt_in   boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  sms_enabled       boolean not null default true,
  email_enabled     boolean not null default true,
  in_app_enabled    boolean not null default true,
  marketing_opt_in  boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end   time,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  ('dispute', '[*]',            'open',           '{any}',                     'opened by payer, teacher, staff or no-show rule'),
  ('dispute', 'open',           'in_review',      '{concierge,admin}',         'concierge picks up, SLA timer running'),
  ('dispute', 'in_review',      'awaiting_party', '{concierge,admin}',         'statement requested from a party'),
  ('dispute', 'awaiting_party', 'in_review',      '{concierge,admin,system}',  'statement received or 48 hours elapsed'),
  ('dispute', 'in_review',      'resolved',       '{concierge,finance,admin}', 'outcome recorded, ledger posted, parties notified'),
  ('dispute', 'in_review',      'escalated',      '{concierge,admin}',         'safety incident, high value or policy question'),
  ('dispute', 'escalated',      'resolved',       '{admin}',                   'admin records outcome'),
  ('dispute', 'resolved',       'reopened',       '{any}',                     'a party contests within 7 days'),
  ('dispute', 'reopened',       'in_review',      '{concierge,admin}',         'second review'),
  ('dispute', 'resolved',       'closed',         '{system,concierge,admin}',  'contest window passed');
