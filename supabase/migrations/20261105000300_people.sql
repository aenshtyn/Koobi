-- Koobi 0300: people. Guardians, learners and consent (FR-ACC-5), teachers and their tracks
-- (§7.2 Teacher, FR-OFF-5), locations (§9.6), verification checks and documents (§4.2, §8.1),
-- staff time log.

create type public.listing_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'paused', 'retired');
create type public.teacher_status as enum ('applied', 'bookable', 'suspended', 'offboarded');
create type public.teacher_type as enum ('trained_teacher', 'university_student', 'professional', 'retired_teacher', 'practitioner');
create type public.waitlist_status as enum ('none', 'waitlisted', 'released');
create type public.verification_status as enum ('pending', 'in_review', 'passed', 'failed', 'expired');

-- ---------------------------------------------------------------------------
-- Guardians, learners, consent
-- ---------------------------------------------------------------------------
create table public.guardians (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  display_name          text check (display_name is null or char_length(display_name) between 1 and 80),
  identity_check_status text not null default 'none' check (identity_check_status in ('none', 'pending', 'passed', 'failed')),
  locality_estate_code  text references public.estates (code),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.learners (
  id                     uuid primary key default gen_random_uuid(),
  guardian_id            uuid references public.guardians (id) on delete cascade,
  user_id                uuid references public.profiles (id) on delete cascade,
  alias                  text not null check (char_length(alias) between 1 and 40),  -- never a minor's full name
  year_of_birth          smallint check (year_of_birth between 1900 and 2100),
  is_minor               boolean not null default false,
  curriculum_code        text references public.curricula (code),
  level_code             text references public.levels (code),
  subject_codes          text[] not null default '{}',
  practical_domain_codes text[] not null default '{}',
  language_code          text references public.languages (code),
  special_needs_codes    text[] not null default '{}',
  consent_status         text not null default 'not_applicable' check (consent_status in ('pending', 'active', 'withdrawn', 'not_applicable')),
  baseline_score         integer,
  followup_score         integer,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint learners_one_owner check (num_nonnulls(guardian_id, user_id) = 1),
  constraint learners_minor_has_guardian check (not is_minor or guardian_id is not null)
);
create unique index learners_one_adult_self on public.learners (user_id) where user_id is not null;
create index learners_guardian_idx on public.learners (guardian_id);

create or replace function private.learners_derive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_minor := new.year_of_birth is not null
                  and extract(year from now())::int - new.year_of_birth < 18;
  if new.guardian_id is not null and tg_op = 'INSERT' then
    new.consent_status := 'pending';  -- becomes 'active' once a consent row exists
  end if;
  return new;
end
$$;
create trigger learners_derive before insert or update of year_of_birth on public.learners
  for each row execute function private.learners_derive();

create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  guardian_id  uuid not null references public.guardians (id) on delete cascade,
  learner_id   uuid not null references public.learners (id) on delete cascade,
  text_version text not null,
  channel      text not null check (channel in ('web', 'whatsapp', 'sms', 'in_app', 'paper')),
  given_at     timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (withdrawn_at is null or withdrawn_at >= given_at)
);
create index consents_learner_idx on public.consents (learner_id);

create or replace function private.consents_sync_learner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.learners l where l.id = new.learner_id and l.guardian_id = new.guardian_id) then
    raise exception 'consent guardian does not own the learner' using errcode = 'check_violation';
  end if;
  update public.learners l
     set consent_status = case when exists (
           select 1 from public.consents c where c.learner_id = new.learner_id and c.withdrawn_at is null)
         then 'active' else 'withdrawn' end
   where l.id = new.learner_id;
  return new;
end
$$;
create trigger consents_sync_learner after insert or update on public.consents
  for each row execute function private.consents_sync_learner();

-- ---------------------------------------------------------------------------
-- Teachers
-- ---------------------------------------------------------------------------
create table public.teachers (
  id                             uuid primary key default gen_random_uuid(),
  user_id                        uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  slug                           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name                   text not null check (char_length(display_name) between 1 and 80),
  headline                       text check (char_length(headline) <= 140),
  bio                            text check (char_length(bio) <= 4000),
  photo_url                      text,
  languages                      text[] not null default '{}',  -- language codes
  county_code                    text references public.counties (code),
  base_estate_code               text references public.estates (code),
  teacher_type                   public.teacher_type,
  employment_status              text check (employment_status in ('not_employed', 'tsc_full_time', 'tsc_part_time',
                                   'privately_employed', 'self_employed', 'student', 'retired')),
  employment_declaration_version text,
  employment_declared_at         timestamptz,
  kra_pin_enc                    text,  -- encrypted by the application; required before payout
  payout_phone_enc               text,  -- encrypted by the application
  payout_ownership_status        text not null default 'pending' check (payout_ownership_status in ('pending', 'passed', 'failed')),
  founding_member                boolean not null default false,
  founding_member_until          date,
  response_median_minutes        integer check (response_median_minutes >= 0),  -- cached nightly
  on_platform_hours              numeric(10, 2) not null default 0,             -- cached nightly
  travel_radius_km               integer check (travel_radius_km between 0 and 100),
  alternative_rate_kes           integer check (alternative_rate_kes > 0),
  demo_video_key                 text,  -- restricted storage
  listing_status                 public.listing_status not null default 'draft',
  rejection_reason               text,
  submitted_at                   timestamptz,
  approved_at                    timestamptz,
  reviewed_by                    uuid references public.profiles (id),
  status                         public.teacher_status not null default 'applied',
  status_reason                  text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint teachers_listing_states check (listing_status in ('draft', 'pending_review', 'approved', 'rejected')),
  constraint teachers_rejection_reason check (listing_status <> 'rejected' or rejection_reason is not null)
);

-- Per-track tier and founding-member waitlist (FR-VER-1, FR-OFF-5).
create table public.teacher_tracks (
  id              uuid not null unique default gen_random_uuid(),  -- entity id for state_history
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  track           text not null references public.tracks (code),
  tier            smallint not null default 0 check (tier between 0 and 5),  -- derived from checks by the system
  waitlist_status public.waitlist_status not null default 'none',
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (teacher_id, track)
);

create or replace function private.default_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source text := coalesce(to_jsonb(new) ->> 'title', to_jsonb(new) ->> 'display_name', 'item');
  v_slug   text;
begin
  if new.slug is null or new.slug = '' then
    v_slug := left(private.slugify(v_source), 60);
    v_slug := pg_catalog.btrim(v_slug, '-');
    new.slug := case when v_slug = '' then '' else v_slug || '-' end
                || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  return new;
end
$$;

-- Stamps listing timestamps on teachers and offerings when the state changes.
create or replace function private.stamp_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.listing_status is distinct from old.listing_status then
    if new.listing_status = 'pending_review' then
      new := jsonb_populate_record(new, jsonb_build_object('submitted_at', now()));
    elsif new.listing_status = 'approved' and old.listing_status = 'pending_review' then
      new := jsonb_populate_record(new, jsonb_build_object(
               'approved_at', now(),
               'reviewed_by', auth.uid(),
               'rejection_reason', null,
               'published_at', coalesce(to_jsonb(old) ->> 'published_at', now()::text)));
    elsif new.listing_status = 'rejected' then
      new := jsonb_populate_record(new, jsonb_build_object('reviewed_by', auth.uid()));
    end if;
  end if;
  return new;
end
$$;

create trigger teachers_slug before insert on public.teachers
  for each row execute function private.default_slug();
create trigger teachers_10_listing_transition before insert or update of listing_status on public.teachers
  for each row execute function private.enforce_transition('listing', 'listing_status');
create trigger teachers_11_status_transition before insert or update of status on public.teachers
  for each row execute function private.enforce_transition('teacher_status', 'status');
create trigger teachers_20_stamp before update of listing_status on public.teachers
  for each row execute function private.stamp_listing();
create trigger teachers_updated_at before update on public.teachers
  for each row execute function private.set_updated_at();

create trigger teacher_tracks_10_waitlist_transition before insert or update of waitlist_status on public.teacher_tracks
  for each row execute function private.enforce_transition('waitlist', 'waitlist_status');
create trigger teacher_tracks_updated_at before update on public.teacher_tracks
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Locations (§9.6). Exact address is encrypted and never public.
-- ---------------------------------------------------------------------------
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('learner_home', 'teacher_premises', 'site', 'venue')),
  label           text check (char_length(label) <= 80),  -- non-exact label, e.g. the estate name
  address_enc     text,
  lat             numeric(9, 6),
  lng             numeric(9, 6),
  county_code     text not null references public.counties (code),
  sub_county_code text references public.sub_counties (code),
  estate_code     text references public.estates (code),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'retired')),
  reviewed_by     uuid references public.profiles (id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index locations_owner_idx on public.locations (owner_user_id);
create trigger locations_10_transition before insert or update of status on public.locations
  for each row execute function private.enforce_transition('location', 'status');
create trigger locations_updated_at before update on public.locations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verification (§4.2, §8.1). Result summaries only; raw documents live in restricted storage.
-- ---------------------------------------------------------------------------
create table public.verification_checks (
  id                     uuid primary key default gen_random_uuid(),
  teacher_id             uuid not null references public.teachers (id) on delete cascade,
  offering_id            uuid,  -- FK added in 0400 (subject test per offering)
  track                  text references public.tracks (code),  -- null = all tracks (tiers 1 and 5)
  tier                   smallint not null check (tier between 1 and 5),
  check_type             text not null references public.check_types (code),
  status                 public.verification_status not null default 'pending',
  vendor                 text,
  vendor_ref             text,
  result_summary         jsonb not null default '{}',
  cost_kes               integer not null default 0 check (cost_kes >= 0),
  staff_minutes          integer not null default 0 check (staff_minutes >= 0),
  attempt_no             smallint not null default 1 check (attempt_no >= 1),
  failure_reason         text,
  reviewer_id            uuid references public.profiles (id),
  reviewed_at            timestamptz,
  passed_at              timestamptz,
  expires_at             timestamptz,
  badge_suspended_at     timestamptz,
  badge_suspended_reason text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint verification_badge_suspension_reason check (badge_suspended_at is null or badge_suspended_reason is not null),
  constraint verification_passed_has_date check (status <> 'passed' or passed_at is not null)
);
create index verification_checks_teacher_idx on public.verification_checks (teacher_id, status);
create unique index verification_checks_vendor_ref_key on public.verification_checks (vendor, vendor_ref) where vendor_ref is not null;

create or replace function private.stamp_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'passed' then
      new.passed_at := coalesce(new.passed_at, now());
    end if;
    if new.status in ('passed', 'failed') then
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.reviewer_id := coalesce(new.reviewer_id, auth.uid());
    end if;
  end if;
  return new;
end
$$;
create trigger verification_checks_10_transition before insert or update of status on public.verification_checks
  for each row execute function private.enforce_transition('verification', 'status');
create trigger verification_checks_20_stamp before update of status on public.verification_checks
  for each row execute function private.stamp_verification();
create trigger verification_checks_updated_at before update on public.verification_checks
  for each row execute function private.set_updated_at();

-- Storage keys of identity documents, certificates, Good Conduct certificates, selfies.
-- Never returned by any list endpoint: no SELECT policy exists; the document service (service role)
-- issues signed, time-limited URLs and writes an audit_log row per view (§2.2, NFR-1).
create table public.verification_documents (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references public.verification_checks (id) on delete cascade,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  storage_key text not null unique,
  kind        text not null check (kind in ('id_front', 'id_back', 'passport', 'selfie', 'certificate', 'tsc_screenshot',
                                            'good_conduct', 'demo_video', 'reference', 'portfolio', 'other')),
  uploaded_by uuid default auth.uid() references public.profiles (id),
  purge_after date,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table public.staff_time_log (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null default auth.uid() references public.profiles (id),
  subject_type  text not null,
  subject_id    uuid,
  minutes       integer not null check (minutes between 1 and 1440),
  note          text,
  created_at    timestamptz not null default now()
);

create trigger guardians_updated_at before update on public.guardians
  for each row execute function private.set_updated_at();
create trigger learners_updated_at before update on public.learners
  for each row execute function private.set_updated_at();
create trigger consents_updated_at before update on public.consents
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policy helpers that need these tables
-- ---------------------------------------------------------------------------
create or replace function public.my_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.teachers t where t.user_id = (select auth.uid())
$$;

create or replace function public.my_guardian_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.guardians g where g.user_id = (select auth.uid())
$$;

-- The caller is the adult learner, or the guardian of the child learner.
create or replace function public.owns_learner(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.learners l
      left join public.guardians g on g.id = l.guardian_id
     where l.id = p_learner
       and (l.user_id = (select auth.uid()) or g.user_id = (select auth.uid()))
  )
$$;

-- ---------------------------------------------------------------------------
-- Transitions (§8.1, §8.6, FR-OFF-5)
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state, allowed, description) values
  -- §8.6 listing approval (teacher profile and offer)
  ('listing', '[*]',            'draft',          '{any}',                 'teacher registers and drafts'),
  ('listing', 'draft',          'pending_review', '{any}',                 'teacher submits'),
  ('listing', 'pending_review', 'approved',       '{reviewer,admin}',      'reviewer approves'),
  ('listing', 'pending_review', 'rejected',       '{reviewer,admin}',      'reviewer rejects with a reason'),
  ('listing', 'rejected',       'draft',          '{any}',                 'teacher edits'),
  ('listing', 'approved',       'draft',          '{any}',                 'public field edited'),
  ('listing', 'approved',       'paused',         '{teacher,concierge,admin}', 'teacher pauses'),
  ('listing', 'paused',         'approved',       '{teacher,concierge,admin}', 'teacher resumes'),
  ('listing', 'approved',       'retired',        '{teacher,concierge,admin}', 'teacher retires'),
  ('listing', 'approved',       'rejected',       '{admin}',               'admin withdraws approval'),
  -- teacher account status (§7.2 Teacher.status, §8.1 ladder outcomes)
  ('teacher_status', '[*]',       'applied',    '{any}',    'application created'),
  ('teacher_status', 'applied',   'bookable',   '{system}', 'tier gate met on at least one track'),
  ('teacher_status', 'bookable',  'applied',    '{system}', 'payout number changed or gate lost'),
  ('teacher_status', 'applied',   'suspended',  '{admin}',  'admin action'),
  ('teacher_status', 'bookable',  'suspended',  '{admin}',  'upheld safety incident or admin action'),
  ('teacher_status', 'suspended', 'bookable',   '{admin}',  'reinstated'),
  ('teacher_status', 'suspended', 'applied',    '{admin}',  'reinstated, tier recomputed'),
  ('teacher_status', 'suspended', 'offboarded', '{admin}',  'offboarding decision'),
  ('teacher_status', 'applied',   'offboarded', '{admin}',  'offboarding decision'),
  -- founding-member waitlist per track (FR-OFF-5)
  ('waitlist', '[*]',        'none',       '{any}',              'track applied for'),
  ('waitlist', '[*]',        'waitlisted', '{concierge,admin}',  'founding member on an unmarketed track'),
  ('waitlist', 'none',       'waitlisted', '{concierge,admin}',  'track not yet marketed'),
  ('waitlist', 'waitlisted', 'released',   '{concierge,admin}',  'marketing start date reached or manual release'),
  -- locations
  ('location', '[*]',      'pending',  '{any}',             'location added'),
  ('location', 'pending',  'approved', '{concierge,admin}', 'location approved'),
  ('location', 'pending',  'rejected', '{concierge,admin}', 'location rejected'),
  ('location', 'rejected', 'pending',  '{any}',             'resubmitted'),
  ('location', 'approved', 'retired',  '{any}',             'owner retires the location'),
  -- §8.1 verification check lifecycle
  ('verification', '[*]',       'pending',   '{any}',            'check created'),
  ('verification', 'pending',   'in_review', '{any}',            'documents uploaded or vendor result received'),
  ('verification', 'pending',   'failed',    '{reviewer,admin}', 'vendor rejects or upload invalid'),
  ('verification', 'in_review', 'passed',    '{reviewer,admin}', 'reviewer approves or vendor match confirmed'),
  ('verification', 'in_review', 'failed',    '{reviewer,admin}', 'reviewer rejects'),
  ('verification', 'failed',    'pending',   '{reviewer,admin}', 'retry within the retry limit'),
  ('verification', 'passed',    'expired',   '{system}',         'expires_at reached'),
  ('verification', 'expired',   'pending',   '{any}',            'renewal submitted');
