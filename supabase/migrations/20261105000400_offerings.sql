-- Koobi 0400: offerings (FR-OFF-2, FR-OFF-3, FR-OFF-6), availability windows (FR-BOOK-1),
-- runs for seat formats (§7.2 Run, §8.5) and the run waiting list.

create type public.run_status as enum ('draft', 'open', 'confirmed', 'in_progress', 'completed', 'cancelled');

create table public.offerings (
  id                    uuid primary key default gen_random_uuid(),
  teacher_id            uuid not null references public.teachers (id) on delete cascade,
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                 text not null check (char_length(title) between 3 and 120),
  summary               text check (char_length(summary) <= 300),
  description           text check (char_length(description) <= 5000),
  outcomes              text[] not null default '{}',  -- "what you will work on" bullets
  category              text not null references public.categories (code),
  track                 text not null references public.tracks (code),
  format                text not null references public.formats (code),
  -- scope by track (FR-OFF-2)
  curriculum_code       text references public.curricula (code),
  level_codes           text[] not null default '{}',
  subject_code          text references public.subjects (code),
  subject_text          text check (char_length(subject_text) <= 120),  -- subject or skill not in the managed list
  exam_code             text references public.exams (code),
  practical_domain_code text references public.practical_domains (code),
  goal                  text check (char_length(goal) <= 300),
  -- delivery
  modes                 text[] not null default '{online}',
  meeting_tool          text check (meeting_tool in ('google_meet', 'zoom')),  -- allow-listed hosts (FR-SESS-1, §9.4)
  location_id           uuid references public.locations (id),  -- site_visit: the teacher's site
  -- pricing (FR-OFF-2, FR-OFF-3); whole KES
  price_hour_kes        integer check (price_hour_kes > 0),
  price_seat_kes        integer check (price_seat_kes > 0),
  price_visit_kes       integer check (price_visit_kes > 0),
  capacity_min          integer check (capacity_min >= 1),
  capacity_max          integer check (capacity_max between 1 and 30),
  duration_minutes      integer not null default 60 check (duration_minutes between 15 and 600),
  sessions_in_run       integer check (sessions_in_run between 1 and 100),
  price_pkg8_kes        integer check (price_pkg8_kes > 0),
  price_pkg12_kes       integer check (price_pkg12_kes > 0),
  price_pkg16_kes       integer check (price_pkg16_kes > 0),
  trial_discount_pct    integer check (trial_discount_pct between 0 and 100),
  language_codes        text[] not null default '{en}',
  special_needs_codes   text[] not null default '{}',
  demo_video_key        text,
  assessment_status     text not null default 'untested' check (assessment_status in ('untested', 'tested', 'failed')),
  listing_status        public.listing_status not null default 'draft',
  rejection_reason      text,
  submitted_at          timestamptz,
  approved_at           timestamptz,
  published_at          timestamptz,
  reviewed_by           uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint offerings_category_allows_track foreign key (category, track)
    references public.category_tracks (category_code, track_code),
  constraint offerings_outcomes_size check (cardinality(outcomes) <= 10
    and coalesce(char_length(array_to_string(outcomes, '')), 0) <= 2000),
  constraint offerings_modes_valid check (cardinality(modes) >= 1
    and modes <@ array['online', 'in_home', 'teacher_premises', 'hybrid', 'site']::text[]),
  constraint offerings_site_mode check ((format = 'site_visit') = (modes = array['site']::text[])
    and (format = 'site_visit' or not ('site' = any (modes)))),
  -- price columns by format: only the format's own price columns may be set
  constraint offerings_one_to_one_only_prices check (format = 'one_to_one' or (
    price_hour_kes is null and price_pkg8_kes is null and price_pkg12_kes is null
    and price_pkg16_kes is null and trial_discount_pct is null)),
  constraint offerings_seat_price_formats check (format in ('small_group', 'cohort', 'workshop') or price_seat_kes is null),
  constraint offerings_visit_price_format check (format = 'site_visit' or price_visit_kes is null),
  constraint offerings_capacity_formats check (format <> 'one_to_one' or (capacity_min is null and capacity_max is null and sessions_in_run is null)),
  constraint offerings_capacity_order check (capacity_min is null or capacity_max is null or capacity_min <= capacity_max),
  constraint offerings_school_small_group check (not (track = 'school' and format = 'small_group')
    or ((capacity_min is null or capacity_min >= 3) and (capacity_max is null or capacity_max <= 6))),
  -- packages at or below hourly price x sessions (FR-OFF-3)
  constraint offerings_package_ceiling check (
        (price_pkg8_kes is null or price_pkg8_kes <= price_hour_kes * 8)
    and (price_pkg12_kes is null or price_pkg12_kes <= price_hour_kes * 12)
    and (price_pkg16_kes is null or price_pkg16_kes <= price_hour_kes * 16)),
  -- once submitted, the format's price, capacity and site must be present
  constraint offerings_complete_when_submitted check (listing_status in ('draft', 'rejected') or (
    case format
      when 'one_to_one' then price_hour_kes is not null
      when 'site_visit' then price_visit_kes is not null and capacity_max is not null and location_id is not null
      else price_seat_kes is not null and capacity_max is not null
    end)),
  constraint offerings_rejection_reason check (listing_status <> 'rejected' or rejection_reason is not null)
);
create index offerings_teacher_idx on public.offerings (teacher_id);
create index offerings_public_idx on public.offerings (category, track, format) where listing_status = 'approved';

alter table public.verification_checks
  add constraint verification_checks_offering_fk foreign key (offering_id) references public.offerings (id) on delete cascade;

create trigger offerings_slug before insert on public.offerings
  for each row execute function private.default_slug();
create trigger offerings_10_listing_transition before insert or update of listing_status on public.offerings
  for each row execute function private.enforce_transition('listing', 'listing_status');
create trigger offerings_20_stamp before update of listing_status on public.offerings
  for each row execute function private.stamp_listing();
create trigger offerings_updated_at before update on public.offerings
  for each row execute function private.set_updated_at();

-- Weekly windows in Africa/Nairobi local time (weekday 0 = Sunday), plus one-off extra windows and
-- blocked dates (whole day when starts/ends are null).
create table public.availability_windows (
  id             uuid primary key default gen_random_uuid(),
  offering_id    uuid not null references public.offerings (id) on delete cascade,
  kind           text not null default 'weekly' check (kind in ('weekly', 'extra', 'blocked')),
  weekday        smallint check (weekday between 0 and 6),
  starts         time,
  ends           time,
  exception_date date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint availability_shape check (
       (kind = 'weekly'  and weekday is not null and exception_date is null and starts is not null and ends is not null)
    or (kind = 'extra'   and weekday is null and exception_date is not null and starts is not null and ends is not null)
    or (kind = 'blocked' and weekday is null and exception_date is not null and (starts is null) = (ends is null))),
  constraint availability_order check (starts is null or ends is null or starts < ends)
);
create index availability_windows_offering_idx on public.availability_windows (offering_id, kind);
create trigger availability_windows_updated_at before update on public.availability_windows
  for each row execute function private.set_updated_at();

create table public.runs (
  id             uuid primary key default gen_random_uuid(),
  offering_id    uuid not null references public.offerings (id),
  teacher_id     uuid not null references public.teachers (id),
  location_id    uuid references public.locations (id),
  track          text not null references public.tracks (code),
  format         text not null references public.formats (code),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  capacity_min   integer not null check (capacity_min >= 1),
  capacity_max   integer not null check (capacity_max between 1 and 30),
  seats_reserved integer not null default 0,
  price_kes      integer not null check (price_kes > 0),  -- per seat or per visit as the offering defines
  cutoff_at      timestamptz not null,
  status         public.run_status not null default 'draft',
  cancel_reason  text check (cancel_reason in ('minimum_not_met', 'teacher_cancelled', 'suspended')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint runs_seat_format check (format <> 'one_to_one'),
  constraint runs_time_order check (ends_at > starts_at and cutoff_at <= starts_at),
  constraint runs_capacity_order check (capacity_min <= capacity_max),
  constraint runs_seats_within_capacity check (seats_reserved between 0 and capacity_max),
  constraint runs_cancel_reason check (status <> 'cancelled' or cancel_reason is not null)
);
create index runs_offering_idx on public.runs (offering_id, starts_at);
create index runs_teacher_idx on public.runs (teacher_id, starts_at);

-- Copy teacher, track, format and defaults from the offering.
create or replace function private.runs_from_offering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.offerings%rowtype;
begin
  select * into o from public.offerings where id = new.offering_id;
  if not found then
    raise exception 'offering % not found', new.offering_id using errcode = 'foreign_key_violation';
  end if;
  if tg_op = 'UPDATE' and new.offering_id is distinct from old.offering_id then
    raise exception 'a run cannot move to another offering' using errcode = 'check_violation';
  end if;
  new.teacher_id   := o.teacher_id;
  new.track        := o.track;
  new.format       := o.format;
  new.capacity_min := coalesce(new.capacity_min, o.capacity_min, 1);
  new.capacity_max := coalesce(new.capacity_max, o.capacity_max);
  new.price_kes    := coalesce(new.price_kes, case when o.format = 'site_visit' then o.price_visit_kes else o.price_seat_kes end);
  new.location_id  := coalesce(new.location_id, o.location_id);
  new.cutoff_at    := coalesce(new.cutoff_at, new.starts_at - interval '24 hours');
  return new;
end
$$;
create trigger runs_05_from_offering before insert or update of offering_id on public.runs
  for each row execute function private.runs_from_offering();
create trigger runs_10_transition before insert or update of status on public.runs
  for each row execute function private.enforce_transition('run', 'status');
create trigger runs_updated_at before update on public.runs
  for each row execute function private.set_updated_at();

create table public.run_waiting_list (
  run_id     uuid not null references public.runs (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  position   integer not null check (position >= 1),
  added_by   uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (run_id, learner_id),
  unique (run_id, position)
);

create or replace function public.owns_offering(p_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.offerings o join public.teachers t on t.id = o.teacher_id
     where o.id = p_offering and t.user_id = (select auth.uid()))
$$;

create or replace function public.owns_run(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs r join public.teachers t on t.id = r.teacher_id
     where r.id = p_run and t.user_id = (select auth.uid()))
$$;

-- §8.5 run machine. Cancellations credit seats, so only the system performs them.
insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  ('run', '[*]',         'draft',       '{any}',                     'teacher or concierge creates a run'),
  ('run', 'draft',       'open',        '{teacher,concierge,admin}', 'published, teacher meets the track tier gate'),
  ('run', 'open',        'confirmed',   '{teacher,concierge,admin}', 'minimum reached, or teacher confirms early'),
  ('run', 'open',        'cancelled',   '{system}',                  'cut-off passed below minimum, all seats credited'),
  ('run', 'confirmed',   'in_progress', '{teacher,concierge,admin}', 'teacher checks in to the first session'),
  ('run', 'confirmed',   'cancelled',   '{system}',                  'teacher cancels, all seats credited'),
  ('run', 'in_progress', 'completed',   '{teacher,concierge,admin}', 'last session checked out, attendance marked, note filed'),
  ('run', 'in_progress', 'cancelled',   '{system}',                  'teacher suspended or cancels mid-run, undelivered share credited');
