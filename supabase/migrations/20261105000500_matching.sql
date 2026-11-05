-- Koobi 0500: requests (FR-MATCH-1), concierge shortlists and matches (FR-MATCH-2, FR-MATCH-4),
-- teacher applications (FR-MATCH-3).

create type public.request_status as enum ('submitted', 'triaged', 'shortlisted', 'matched', 'unmatched', 'withdrawn');
create type public.match_status as enum ('proposed', 'sent', 'accepted', 'declined', 'expired');

-- The signed-in request form writes: requester_id (default auth.uid()), learner_id, category, track,
-- subject, goal, level, mode, county, estate, budget_max_kes, schedule_notes, notes.
-- subject, level, county and estate are what the requester typed or picked; the concierge normalises
-- them into the *_code columns at triage.
create table public.requests (
  id                         uuid primary key default gen_random_uuid(),
  requester_id               uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  learner_id                 uuid references public.learners (id) on delete set null,
  category                   text not null references public.categories (code),
  track                      text not null references public.tracks (code),
  subject                    text not null check (char_length(btrim(subject)) between 1 and 200),
  goal                       text not null check (char_length(btrim(goal)) between 1 and 500),
  level                      text check (char_length(level) <= 80),
  mode                       text not null references public.modes (code),
  county                     text check (char_length(county) <= 80),
  estate                     text check (char_length(estate) <= 80),
  budget_max_kes             integer check (budget_max_kes > 0),
  schedule_notes             text check (char_length(schedule_notes) <= 500),
  notes                      text check (char_length(notes) <= 500),
  status                     public.request_status not null default 'submitted',
  -- optional structured fields (form v2) and triage normalisation
  format_pref                text references public.formats (code),
  learner_time_zone          text not null default 'Africa/Nairobi',
  curriculum_code            text references public.curricula (code),
  level_code                 text references public.levels (code),
  subject_code               text references public.subjects (code),
  exam_code                  text references public.exams (code),
  practical_domain_code      text references public.practical_domains (code),
  county_code                text references public.counties (code),
  estate_code                text references public.estates (code),
  assigned_concierge_id      uuid references public.profiles (id),
  is_replacement_for_booking_id uuid,  -- FK added in 0600 (FR-DISP-4)
  submitted_at               timestamptz not null default now(),
  triaged_at                 timestamptz,
  shortlisted_at             timestamptz,
  matched_at                 timestamptz,
  closed_at                  timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint requests_category_allows_track foreign key (category, track)
    references public.category_tracks (category_code, track_code)
);
create index requests_requester_idx on public.requests (requester_id, created_at desc);
create index requests_open_idx on public.requests (track, category) where status in ('submitted', 'triaged');

create or replace function private.stamp_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'triaged'     then new.triaged_at := coalesce(new.triaged_at, now());
      when 'shortlisted' then new.shortlisted_at := now();
      when 'matched'     then new.matched_at := now(); new.closed_at := now();
      when 'unmatched'   then new.closed_at := now();
      when 'withdrawn'   then new.closed_at := now();
      else null;
    end case;
  end if;
  return new;
end
$$;

create trigger requests_10_transition before insert or update of status on public.requests
  for each row execute function private.enforce_transition('request', 'status');
create trigger requests_20_stamp before update of status on public.requests
  for each row execute function private.stamp_request();
create trigger requests_updated_at before update on public.requests
  for each row execute function private.set_updated_at();

create or replace function public.owns_request(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.requests r where r.id = p_request and r.requester_id = (select auth.uid()))
$$;

-- FR-MATCH-3: a teacher sees open requests on the track and category of one of their approved offerings.
create or replace function public.request_open_to_me(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.requests r
      join public.offerings o on o.track = r.track and o.category = r.category and o.listing_status = 'approved'
      join public.teachers t on t.id = o.teacher_id
     where r.id = p_request
       and r.status in ('submitted', 'triaged')
       and t.user_id = (select auth.uid())
       and t.listing_status = 'approved'
       and t.status not in ('suspended', 'offboarded'))
$$;

create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.requests (id) on delete cascade,
  teacher_id         uuid not null references public.teachers (id),
  offering_id        uuid not null references public.offerings (id),
  run_id             uuid references public.runs (id),
  rank               smallint check (rank between 1 and 5),  -- 1-3 primary, 4-5 reserve
  source             text not null default 'concierge' check (source in ('concierge', 'teacher_applied', 'auto')),
  concierge_reason   text check (char_length(concierge_reason) <= 200),  -- shown to the requester
  pitch              text check (char_length(pitch) <= 300),
  proposed_price_kes integer check (proposed_price_kes > 0),
  status             public.match_status not null default 'proposed',
  decline_reason     text check (char_length(decline_reason) <= 500),
  ranking_snapshot   jsonb not null default '{}',  -- FR-MATCH-5 reproducibility
  accepted_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (request_id, offering_id)
);
create index matches_teacher_idx on public.matches (teacher_id);

create table public.shortlists (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id),
  status     text not null default 'draft' check (status in ('draft', 'sent', 'answered', 'expired')),
  sent_at    timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shortlists_request_idx on public.shortlists (request_id);

create table public.shortlist_entries (
  shortlist_id uuid not null references public.shortlists (id) on delete cascade,
  match_id     uuid not null references public.matches (id) on delete cascade,
  position     smallint not null check (position between 1 and 5),
  is_primary   boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (shortlist_id, match_id),
  unique (shortlist_id, position)
);

create table public.teacher_applications (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.requests (id) on delete cascade,
  teacher_id         uuid not null references public.teachers (id) on delete cascade,
  offering_id        uuid not null references public.offerings (id),
  pitch              text not null check (char_length(pitch) between 1 and 300),
  proposed_price_kes integer check (proposed_price_kes > 0),
  status             text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'declined', 'withdrawn')),
  match_id           uuid references public.matches (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (request_id, offering_id)
);

create or replace function private.check_offering_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.offerings o where o.id = new.offering_id and o.teacher_id = new.teacher_id) then
    raise exception 'offering % does not belong to teacher %', new.offering_id, new.teacher_id using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function private.stamp_match()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at := now();
  end if;
  return new;
end
$$;

create trigger matches_05_offering_teacher before insert or update of offering_id, teacher_id on public.matches
  for each row execute function private.check_offering_teacher();
create trigger matches_10_transition before insert or update of status on public.matches
  for each row execute function private.enforce_transition('match', 'status');
create trigger matches_20_stamp before update of status on public.matches
  for each row execute function private.stamp_match();
create trigger matches_updated_at before update on public.matches
  for each row execute function private.set_updated_at();
create trigger shortlists_updated_at before update on public.shortlists
  for each row execute function private.set_updated_at();
create trigger teacher_applications_05_offering_teacher before insert or update of offering_id, teacher_id on public.teacher_applications
  for each row execute function private.check_offering_teacher();
create trigger teacher_applications_10_transition before insert or update of status on public.teacher_applications
  for each row execute function private.enforce_transition('teacher_application', 'status');
create trigger teacher_applications_updated_at before update on public.teacher_applications
  for each row execute function private.set_updated_at();

insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  -- request: submitted -> triaged -> shortlisted -> matched | unmatched | withdrawn
  ('request', '[*]',         'submitted',   '{any}',             'request posted'),
  ('request', 'submitted',   'triaged',     '{concierge,admin}', 'concierge triages'),
  ('request', 'triaged',     'shortlisted', '{concierge,admin}', 'shortlist sent'),
  ('request', 'shortlisted', 'matched',     '{any}',             'requester accepts a teacher'),
  ('request', 'shortlisted', 'triaged',     '{any}',             'requester declines all, back to the concierge (FR-MATCH-4)'),
  ('request', 'triaged',     'unmatched',   '{concierge,admin}', 'no suitable teacher'),
  ('request', 'shortlisted', 'unmatched',   '{concierge,admin}', 'no suitable teacher'),
  ('request', 'submitted',   'withdrawn',   '{any}',             'requester withdraws'),
  ('request', 'triaged',     'withdrawn',   '{any}',             'requester withdraws'),
  ('request', 'shortlisted', 'withdrawn',   '{any}',             'requester withdraws'),
  -- match (candidate proposed to a requester)
  ('match', '[*]',      'proposed', '{concierge,admin}', 'candidate added'),
  ('match', 'proposed', 'sent',     '{concierge,admin}', 'shortlist sent'),
  ('match', 'proposed', 'declined', '{concierge,admin}', 'concierge drops the candidate'),
  ('match', 'sent',     'accepted', '{any}',             'requester accepts'),
  ('match', 'sent',     'declined', '{any}',             'requester declines with a reason'),
  ('match', 'sent',     'expired',  '{system}',          'shortlist link expired'),
  -- teacher application
  ('teacher_application', '[*]',       'submitted',   '{teacher,concierge,admin}', 'teacher applies'),
  ('teacher_application', 'submitted', 'shortlisted', '{concierge,admin}',         'concierge shortlists'),
  ('teacher_application', 'submitted', 'declined',    '{concierge,admin}',         'concierge declines'),
  ('teacher_application', 'submitted', 'withdrawn',   '{teacher,concierge,admin}', 'teacher withdraws');
