-- Koobi: expert onboarding and the public profile (partner documents of 2026-11-11).
--
-- 1. The application: five steps saved on the expert's own row, then submitted. Statuses: draft,
--    submitted, under_verification, meeting_required, more_info (returned), approved, rejected.
-- 2. Documents and credentials: the ID or passport and each qualification are separate rows, each
--    verified on its own. Only approved qualifications are ever public.
-- 3. The meeting: staff invite the expert to a 15-minute online meeting and record the outcome.
-- 4. The decision: approve, reject or return for more information. Approval opens the dashboard and
--    publishes nothing.
-- 5. After approval: the introduction video (reviewed), changes to public information (reviewed
--    before they go live), and publication, which needs every requirement met.
--
-- The application and the meeting stand in for the identity check of the old ladder: approval records
-- a passed identity check, so the booking gate (identity plus a proven payout number) is unchanged.

-- ---------------------------------------------------------------------------
-- 1. The application, on the expert's row
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column application_status       text not null default 'draft'
    constraint teachers_application_status check (application_status in
      ('draft', 'submitted', 'under_verification', 'meeting_required', 'more_info', 'approved', 'rejected')),
  add column application_step         smallint not null default 1 check (application_step between 1 and 5),
  add column application_submitted_at timestamptz,
  add column application_decided_at   timestamptz,
  add column application_note         text check (char_length(application_note) <= 1000),
  add column terms_version            text,
  add column terms_accepted_at        timestamptz,
  add column meeting_at               timestamptz,
  add column meeting_link             text check (meeting_link is null or (meeting_link ~ '^https://[^ ]+$' and char_length(meeting_link) between 16 and 300)),
  add column meeting_invited_at       timestamptz,
  add column meeting_held_at          timestamptz,
  add column contact_phone            text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column country_code             text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column city                     text check (char_length(city) <= 80),
  add column education_level          text check (education_level is null or education_level in
                                        ('secondary', 'certificate', 'diploma', 'bachelors', 'masters', 'doctorate', 'other')),
  add column education_field          text check (char_length(education_field) <= 120),
  add column experience_band          text check (experience_band is null or experience_band in
                                        ('under_1', '1_2', '3_5', '6_10', 'over_10')),
  add column achievements             text check (char_length(achievements) <= 2400),
  add column employer                 text check (char_length(employer) <= 120),
  add column website_url              text check (website_url is null or (website_url ~ '^https://[^ ]+$' and char_length(website_url) between 12 and 300)),
  add column primary_category         text references public.categories (code),
  add column specialisations          text[] not null default '{}' check (cardinality(specialisations) <= 8),
  add column audiences                text[] not null default '{}' check (audiences <@ array['school_students',
                                        'university_students', 'recent_graduates', 'working_professionals', 'entrepreneurs',
                                        'teams', 'anyone']::text[]),
  add column formats_offered          text[] not null default '{}' check (formats_offered <@ array['one_to_one',
                                        'small_group', 'workshop', 'cohort']::text[]),
  add column learner_outcomes         text check (char_length(learner_outcomes) <= 300),
  add column portfolio_links          text[] not null default '{}' check (cardinality(portfolio_links) <= 5),
  add column profile_published_at     timestamptz;

comment on column public.teachers.application_status is
  'Expert approval. Separate from listing_status, which is whether the public profile is published.';
comment on column public.teachers.contact_phone is 'Private. Never shown on the public profile.';

-- People already live keep their dashboard: a published profile counts as an approved expert.
update public.teachers
   set application_status = 'approved', application_decided_at = coalesce(approved_at, now()), application_step = 5,
       profile_published_at = approved_at
 where listing_status = 'approved';

create index teachers_application_idx on public.teachers (application_status, application_submitted_at);

-- What the expert may write directly. Statuses, the meeting and the decision change only through the
-- functions below.
grant insert (contact_phone, country_code, city, education_level, education_field, experience_band, achievements, employer,
              website_url, primary_category, specialisations, audiences, formats_offered, learner_outcomes, portfolio_links,
              application_step)
  on public.teachers to authenticated;
grant update (contact_phone, country_code, city, education_level, education_field, experience_band, achievements, employer,
              website_url, primary_category, specialisations, audiences, formats_offered, learner_outcomes, portfolio_links,
              application_step)
  on public.teachers to authenticated;

create or replace function private.word_count(p text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(regexp_split_to_array(nullif(btrim(coalesce(p, '')), ''), '\s+'), 1), 0)
$$;

-- An expert edits freely while the application is theirs (draft, or returned for more information).
-- Once it is with Koobi the application is locked; once approved, what learners see changes only
-- through propose_profile_change, and publication only through publish_profile.
create or replace function private.teachers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_system() or (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    return new;
  end if;
  if new.listing_status is distinct from old.listing_status then
    raise exception 'a profile is published from the Public Profile page' using errcode = 'check_violation';
  end if;
  if old.application_status not in ('draft', 'more_info')
     and (new.display_name, new.headline, new.bio, new.photo_url, new.languages, new.country_code, new.education_level,
          new.education_field, new.experience_band, new.achievements, new.primary_category, new.specialisations,
          new.audiences, new.formats_offered, new.learner_outcomes, new.employment_status)
         is distinct from
         (old.display_name, old.headline, old.bio, old.photo_url, old.languages, old.country_code, old.education_level,
          old.education_field, old.experience_band, old.achievements, old.primary_category, old.specialisations,
          old.audiences, old.formats_offered, old.learner_outcomes, old.employment_status) then
    raise exception 'changes to your profile are sent for review first' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger teachers_05_guard before update on public.teachers
  for each row execute function private.teachers_guard();

-- ---------------------------------------------------------------------------
-- 2. Staff-only notes and the application's history
-- ---------------------------------------------------------------------------
create table public.application_reviews (
  teacher_id      uuid primary key references public.teachers (id) on delete cascade,
  meeting_outcome text check (meeting_outcome is null or meeting_outcome in ('suitable', 'not_suitable', 'unsure')),
  meeting_notes   text check (char_length(meeting_notes) <= 4000),
  recorded_by     uuid references public.profiles (id),
  recorded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.application_reviews is 'What staff recorded about an applicant. Never readable by the applicant.';
create trigger application_reviews_updated_at before update on public.application_reviews
  for each row execute function private.set_updated_at();
alter table public.application_reviews enable row level security;
grant all on public.application_reviews to service_role;
grant select on public.application_reviews to authenticated;
create policy application_reviews_read on public.application_reviews for select to authenticated
  using ((select public.has_any_role(array['reviewer', 'admin']::public.app_role[])));

create table public.application_events (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers (id) on delete cascade,
  kind          text not null check (kind ~ '^[a-z_]+$'),
  note          text check (char_length(note) <= 1000),
  actor_user_id uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index application_events_teacher_idx on public.application_events (teacher_id, created_at);
alter table public.application_events enable row level security;
grant all on public.application_events to service_role;
grant select on public.application_events to authenticated;
create policy application_events_read on public.application_events for select to authenticated
  using ((select public.is_staff()));

-- Records the step and tells the expert. Each event is its own notification (the same step can
-- happen twice, for example returned for more information).
create or replace function private.application_event(p_teacher uuid, p_kind text, p_note text, p_template text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_user uuid;
  v_name text;
begin
  insert into public.application_events (teacher_id, kind, note, actor_user_id)
  values (p_teacher, p_kind, left(nullif(btrim(coalesce(p_note, '')), ''), 1000), auth.uid())
  returning id into v_id;
  if p_template is not null then
    select t.user_id, split_part(t.display_name, ' ', 1) into v_user, v_name from public.teachers t where t.id = p_teacher;
    perform private.notify(v_user, p_template, 'application_event', v_id,
      jsonb_build_object('teacher', v_name, 'note', left(coalesce(btrim(p_note), ''), 600)) || coalesce(p_payload, '{}'::jsonb));
  end if;
  return v_id;
end
$$;

insert into public.message_templates (key, channel, subject, body, urgent) values
  ('application_submitted',   'email',  'We have your Koobi expert application', 'Hello {teacher}. We have your application to teach on Koobi. We check your documents first and write to you at each step. Follow it here: {link}', false),
  ('application_submitted',   'in_app', null, 'We have your application. We check your documents first.', false),
  ('application_in_review',   'in_app', null, 'Your application is under verification. We are checking your documents.', false),
  ('application_meeting',     'email',  'Your 15-minute meeting with Koobi', 'Hello {teacher}. Your documents are in order. The next step is a 15-minute online meeting about your experience and what you would like to teach. Time: {when}. Join here: {meeting}. If the time does not suit you, reply to this email. Details: {link}', true),
  ('application_meeting',     'in_app', null, 'You are invited to a 15-minute online meeting, {when}.', false),
  ('application_more_info',   'email',  'We need a little more for your Koobi application', 'Hello {teacher}. Before we can decide we need more from you: {note} Update your application and send it again: {link}', false),
  ('application_more_info',   'in_app', null, 'We need more information for your application: {note}', false),
  ('application_approved',    'email',  'You are approved as a Koobi expert', 'Hello {teacher}. Your application is approved and your expert dashboard is open. Nothing is public yet: complete your public profile, upload your introduction video and create a learning experience. Each is reviewed before learners see it. Start here: {link}', false),
  ('application_approved',    'in_app', null, 'You are approved as a Koobi expert. Your dashboard is open.', false),
  ('application_rejected',    'email',  'Your Koobi expert application', 'Hello {teacher}. Thank you for applying. We are not able to approve your application. {note}', false),
  ('application_rejected',    'in_app', null, 'We could not approve your application. {note}', false),
  ('video_approved',          'email',  'Your introduction video is approved', 'Hello {teacher}. Your introduction video is approved. See what is left before your profile can be published: {link}', false),
  ('video_approved',          'in_app', null, 'Your introduction video is approved.', false),
  ('video_changes',           'email',  'Your introduction video needs changes', 'Hello {teacher}. Please change your introduction video and send it again: {note} {link}', false),
  ('video_changes',           'in_app', null, 'Your introduction video needs changes: {note}', false),
  ('video_rejected',          'email',  'Your introduction video was not approved', 'Hello {teacher}. We could not approve your introduction video: {note} You can upload a new one: {link}', false),
  ('video_rejected',          'in_app', null, 'Your introduction video was not approved: {note}', false),
  ('credential_approved',     'in_app', null, '{title} is verified and can show on your public profile.', false),
  ('credential_rejected',     'in_app', null, '{title} could not be verified: {note}', false),
  ('profile_change_approved', 'in_app', null, 'Your profile changes are approved and live.', false),
  ('profile_change_rejected', 'in_app', null, 'Your profile changes were not approved: {note}', false),
  ('profile_published',       'email',  'Your Koobi profile is published', 'Hello {teacher}. Your public profile is published. Learners can now find you: {link}', false),
  ('profile_published',       'in_app', null, 'Your public profile is published. Learners can now find you.', false)
on conflict (key, channel, locale) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Documents and credentials, verified one by one
-- ---------------------------------------------------------------------------
create table public.teacher_credentials (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  kind        text not null check (kind in ('identity', 'education', 'certification', 'licence')),
  title       text not null check (char_length(title) between 2 and 120),
  issuer      text check (char_length(issuer) <= 120),
  storage_key text not null unique,
  file_name   text check (char_length(file_name) <= 120),
  status      text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  note        text check (char_length(note) <= 500),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teacher_credentials_rejection_note check (status <> 'rejected' or note is not null)
);
comment on table public.teacher_credentials is
  'The ID or passport and each qualification an expert uploaded. Each row is verified on its own; only approved rows other than identity are public. Files live in the private verification bucket.';
create index teacher_credentials_teacher_idx on public.teacher_credentials (teacher_id) where deleted_at is null;
create index teacher_credentials_queue_idx on public.teacher_credentials (status, created_at) where deleted_at is null;
create trigger teacher_credentials_updated_at before update on public.teacher_credentials
  for each row execute function private.set_updated_at();
alter table public.teacher_credentials enable row level security;
grant all on public.teacher_credentials to service_role;
-- Not the storage key: files open only through credential_key().
grant select (id, teacher_id, kind, title, issuer, file_name, status, note, reviewed_at, deleted_at, created_at, updated_at)
  on public.teacher_credentials to authenticated;
create policy teacher_credentials_read on public.teacher_credentials for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.is_staff()));

create or replace function public.add_credential(p_kind text, p_title text, p_issuer text, p_storage_key text, p_file_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t    public.teachers%rowtype;
  v_id uuid;
begin
  select * into t from public.teachers where user_id = auth.uid();
  if not found then
    raise exception 'start your application first' using errcode = 'check_violation';
  end if;
  if t.application_status in ('submitted', 'under_verification', 'meeting_required', 'rejected') then
    raise exception 'your application is with Koobi; documents can be added again once we answer' using errcode = 'check_violation';
  end if;
  if p_kind is null or p_kind not in ('identity', 'education', 'certification', 'licence') then
    raise exception 'unknown kind of document' using errcode = 'check_violation';
  end if;
  if p_storage_key is null or p_storage_key not like 'expert/' || t.id::text || '/%' then
    raise exception 'that file does not belong to you' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) < 2 then
    raise exception 'give the document a name' using errcode = 'check_violation';
  end if;
  if p_kind = 'identity' then
    -- one identity document on file at a time; a new upload replaces one not yet approved
    update public.teacher_credentials set deleted_at = now()
     where teacher_id = t.id and kind = 'identity' and deleted_at is null and status <> 'approved';
  elsif (select count(*) from public.teacher_credentials c where c.teacher_id = t.id and c.kind <> 'identity' and c.deleted_at is null) >= 10 then
    raise exception 'you can keep up to ten qualifications; remove one first' using errcode = 'check_violation';
  end if;
  insert into public.teacher_credentials (teacher_id, kind, title, issuer, storage_key, file_name)
  values (t.id, p_kind, left(btrim(p_title), 120), left(nullif(btrim(coalesce(p_issuer, '')), ''), 120), p_storage_key,
          left(nullif(btrim(coalesce(p_file_name, '')), ''), 120))
  returning id into v_id;
  return v_id;
end
$$;

-- Returns the storage key so the server can delete the file.
create or replace function public.remove_credential(p_credential uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.teacher_credentials%rowtype;
  t public.teachers%rowtype;
begin
  select * into c from public.teacher_credentials where id = p_credential and deleted_at is null for update;
  if found then
    select * into t from public.teachers where id = c.teacher_id;
  end if;
  if c.id is null or t.user_id is distinct from auth.uid() then
    raise exception 'not your document' using errcode = 'insufficient_privilege';
  end if;
  if t.application_status in ('submitted', 'under_verification', 'meeting_required') then
    raise exception 'your application is with Koobi; documents cannot change until we answer' using errcode = 'check_violation';
  end if;
  if c.kind = 'identity' and c.status = 'approved' then
    raise exception 'a verified identity document stays on file' using errcode = 'check_violation';
  end if;
  update public.teacher_credentials set deleted_at = now() where id = c.id;
  return c.storage_key;
end
$$;

-- The owner or a reviewer opens the file. Staff views are logged.
create or replace function public.credential_key(p_credential uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c       public.teacher_credentials%rowtype;
  v_owner boolean;
begin
  select * into c from public.teacher_credentials where id = p_credential and deleted_at is null;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  v_owner := exists (select 1 from public.teachers t where t.id = c.teacher_id and t.user_id = auth.uid());
  if not v_owner and not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  if not v_owner then
    insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, reason)
    values (auth.uid(), 'user:' || auth.uid()::text, 'document.view', 'teacher_credentials', c.id, 'application review');
  end if;
  return c.storage_key;
end
$$;

create or replace function public.review_credential(p_credential uuid, p_approve boolean, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.teacher_credentials%rowtype;
  t public.teachers%rowtype;
begin
  if not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.teacher_credentials where id = p_credential and deleted_at is null for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'say why it could not be verified; the expert sees this' using errcode = 'check_violation';
  end if;
  update public.teacher_credentials
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = case when p_approve then null else left(btrim(p_note), 500) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = c.id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'credential.review', 'teacher_credentials', c.id,
          jsonb_build_object('kind', c.kind, 'approved', p_approve));
  select * into t from public.teachers where id = c.teacher_id;
  -- During the application the decision email covers it; afterwards each result is its own notice.
  if t.application_status = 'approved' and c.kind <> 'identity' then
    perform private.notify(t.user_id, case when p_approve then 'credential_approved' else 'credential_rejected' end,
      'teacher_credential', c.id,
      jsonb_build_object('title', c.title, 'note', left(coalesce(btrim(p_note), ''), 300), 'link', '/teach/profile/credentials'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Submitting, the meeting and the decision
-- ---------------------------------------------------------------------------
create or replace function public.submit_application(p_terms_version text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.teachers%rowtype;
  v_words integer;
begin
  select * into t from public.teachers where user_id = auth.uid() for update;
  if not found then
    raise exception 'start your application first' using errcode = 'check_violation';
  end if;
  if t.application_status not in ('draft', 'more_info') then
    raise exception 'this application has already been sent' using errcode = 'check_violation';
  end if;
  if p_terms_version is null or p_terms_version !~ '^[a-z0-9][a-z0-9.-]{2,39}$' then
    raise exception 'agree to the terms to send your application' using errcode = 'check_violation';
  end if;
  if t.employment_status = 'tsc_full_time' then
    raise exception 'teachers employed full time by TSC cannot take other paid work, so we cannot accept this application' using errcode = 'check_violation';
  end if;
  if t.contact_phone is null or t.country_code is null or coalesce(btrim(t.city), '') = '' or t.photo_url is null then
    raise exception 'personal information is not complete' using errcode = 'check_violation';
  end if;
  v_words := private.word_count(t.bio);
  if coalesce(btrim(t.headline), '') = '' or v_words < 100 or v_words > 250 or t.experience_band is null
     or coalesce(btrim(t.achievements), '') = '' or t.employment_status is null then
    raise exception 'professional background is not complete' using errcode = 'check_violation';
  end if;
  if t.primary_category is null or cardinality(t.specialisations) = 0 or cardinality(t.audiences) = 0
     or cardinality(t.languages) = 0 or cardinality(t.formats_offered) = 0 or coalesce(btrim(t.learner_outcomes), '') = '' then
    raise exception 'your expertise is not complete' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teacher_credentials c
                  where c.teacher_id = t.id and c.kind = 'identity' and c.deleted_at is null and c.status <> 'rejected') then
    raise exception 'upload your national ID or passport' using errcode = 'check_violation';
  end if;
  update public.teachers
     set application_status = 'submitted', application_submitted_at = now(), application_note = null, application_step = 5,
         terms_version = p_terms_version, terms_accepted_at = now(),
         employment_declaration_version = coalesce(employment_declaration_version, p_terms_version),
         employment_declared_at = now()
   where id = t.id;
  perform private.application_event(t.id, case when t.application_status = 'more_info' then 'resubmitted' else 'submitted' end,
    null, 'application_submitted', jsonb_build_object('link', '/teach/apply/status'));
end
$$;

create or replace function private.application_for_staff(p_teacher uuid)
returns public.teachers
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.teachers%rowtype;
begin
  if not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.teachers where id = p_teacher for update;
  if not found then
    raise exception 'application not found' using errcode = 'no_data_found';
  end if;
  return t;
end
$$;

create or replace function public.application_start_verification(p_teacher uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.teachers%rowtype := private.application_for_staff(p_teacher);
begin
  if t.application_status <> 'submitted' then
    raise exception 'this application is not waiting to be picked up' using errcode = 'check_violation';
  end if;
  update public.teachers set application_status = 'under_verification' where id = t.id;
  perform private.application_event(t.id, 'under_verification', null, 'application_in_review', jsonb_build_object('link', '/teach/apply/status'));
end
$$;

create or replace function public.application_invite_meeting(p_teacher uuid, p_at timestamptz, p_link text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.teachers%rowtype := private.application_for_staff(p_teacher);
begin
  if t.application_status not in ('under_verification', 'meeting_required') then
    raise exception 'check the documents first' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teacher_credentials c
                  where c.teacher_id = t.id and c.kind = 'identity' and c.deleted_at is null and c.status = 'approved') then
    raise exception 'verify the identity document before inviting the expert to a meeting' using errcode = 'check_violation';
  end if;
  if p_at is null or p_at < now() then
    raise exception 'choose a meeting time in the future' using errcode = 'check_violation';
  end if;
  if p_link is null or p_link !~ '^https://[^ ]+$' or char_length(p_link) not between 16 and 300 then
    raise exception 'add the meeting link, starting with https://' using errcode = 'check_violation';
  end if;
  update public.teachers
     set application_status = 'meeting_required', meeting_at = p_at, meeting_link = p_link, meeting_invited_at = now(), meeting_held_at = null
   where id = t.id;
  perform private.application_event(t.id, 'meeting_invited', null, 'application_meeting',
    jsonb_build_object('when', p_at, 'meeting', p_link, 'link', '/teach/apply/status'));
end
$$;

create or replace function public.application_record_meeting(p_teacher uuid, p_outcome text, p_notes text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.teachers%rowtype := private.application_for_staff(p_teacher);
begin
  if t.application_status <> 'meeting_required' then
    raise exception 'no meeting is open for this application' using errcode = 'check_violation';
  end if;
  if p_outcome is null or p_outcome not in ('suitable', 'not_suitable', 'unsure') then
    raise exception 'choose the outcome of the meeting' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 10 then
    raise exception 'write what you observed, for the final review' using errcode = 'check_violation';
  end if;
  insert into public.application_reviews (teacher_id, meeting_outcome, meeting_notes, recorded_by, recorded_at)
  values (t.id, p_outcome, left(btrim(p_notes), 4000), auth.uid(), now())
  on conflict (teacher_id) do update
    set meeting_outcome = excluded.meeting_outcome, meeting_notes = excluded.meeting_notes,
        recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
  update public.teachers set meeting_held_at = now() where id = t.id;
  perform private.application_event(t.id, 'meeting_recorded', p_outcome, null);
end
$$;

-- Approve, reject, or return for more information. Approval needs a verified identity document and
-- a recorded meeting; it opens the dashboard and publishes nothing.
create or replace function public.application_decide(p_teacher uuid, p_decision text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.teachers%rowtype := private.application_for_staff(p_teacher);
  v_check uuid;
  v_note  text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  if p_decision is null or p_decision not in ('approve', 'reject', 'more_info') then
    raise exception 'choose a decision' using errcode = 'check_violation';
  end if;
  if p_decision = 'more_info' and t.application_status = 'rejected' then
    if not (select public.has_role('admin')) then
      raise exception 'only an admin reopens a rejected application' using errcode = 'insufficient_privilege';
    end if;
  elsif t.application_status not in ('submitted', 'under_verification', 'meeting_required') then
    raise exception 'this application is not waiting for a decision' using errcode = 'check_violation';
  end if;
  if p_decision <> 'approve' and char_length(coalesce(v_note, '')) < 10 then
    raise exception 'write the reason; the expert reads it' using errcode = 'check_violation';
  end if;

  if p_decision = 'approve' then
    if t.application_status <> 'meeting_required' or t.meeting_held_at is null then
      raise exception 'record the meeting before approving' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.teacher_credentials c
                    where c.teacher_id = t.id and c.kind = 'identity' and c.deleted_at is null and c.status = 'approved') then
      raise exception 'verify the identity document before approving' using errcode = 'check_violation';
    end if;
    update public.teachers
       set application_status = 'approved', application_decided_at = now(), application_note = null
     where id = t.id;
    -- The verified ID is the identity check of the booking gate.
    if not exists (select 1 from public.verification_checks vc
                    where vc.teacher_id = t.id and vc.check_type = 'identity_iprs' and vc.status = 'passed'
                      and (vc.expires_at is null or vc.expires_at > now())) then
      select id into v_check from public.verification_checks
       where teacher_id = t.id and check_type = 'identity_iprs' and status in ('pending', 'in_review')
       order by created_at desc limit 1;
      if v_check is null then
        insert into public.verification_checks (teacher_id, tier, check_type, attempt_no, result_summary)
        values (t.id, 1, 'identity_iprs',
                coalesce((select max(attempt_no) from public.verification_checks where teacher_id = t.id and check_type = 'identity_iprs'), 0) + 1,
                jsonb_build_object('source', 'application'))
        returning id into v_check;
      end if;
      update public.verification_checks set status = 'in_review' where id = v_check and status = 'pending';
      update public.verification_checks set status = 'passed', reviewer_id = auth.uid(), reviewed_at = now() where id = v_check;
    end if;
    perform private.recompute_tiers(t.id);
    perform private.application_event(t.id, 'approved', v_note, 'application_approved', jsonb_build_object('link', '/teach'));
  elsif p_decision = 'reject' then
    update public.teachers
       set application_status = 'rejected', application_decided_at = now(), application_note = v_note
     where id = t.id;
    perform private.application_event(t.id, 'rejected', v_note, 'application_rejected', '{}'::jsonb);
  else
    update public.teachers
       set application_status = 'more_info', application_decided_at = null, application_note = v_note
     where id = t.id;
    perform private.application_event(t.id, 'more_info', v_note, 'application_more_info', jsonb_build_object('link', '/teach/apply'));
  end if;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after, reason)
  values (auth.uid(), 'user:' || auth.uid()::text, 'application.' || p_decision, 'teachers', t.id,
          jsonb_build_object('from', t.application_status), v_note);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. The introduction video
-- ---------------------------------------------------------------------------
create table public.teacher_videos (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  storage_key      text not null unique,
  mime             text not null check (mime in ('video/mp4', 'video/quicktime')),
  size_bytes       bigint not null check (size_bytes between 1 and 209715200),      -- 200 MB
  duration_seconds integer not null check (duration_seconds between 60 and 180),   -- 1 to 3 minutes
  status           text not null default 'uploaded' check (status in
                     ('uploaded', 'submitted', 'under_review', 'changes_required', 'approved', 'rejected', 'replaced')),
  note             text check (char_length(note) <= 500),
  submitted_at     timestamptz,
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.teacher_videos is
  'Introduction videos in the private expert-videos bucket. The approved one plays on the public profile; a newer upload replaces it only once approved.';
create index teacher_videos_teacher_idx on public.teacher_videos (teacher_id, created_at desc);
create unique index teacher_videos_one_approved on public.teacher_videos (teacher_id) where status = 'approved';
create trigger teacher_videos_updated_at before update on public.teacher_videos
  for each row execute function private.set_updated_at();
alter table public.teacher_videos enable row level security;
grant all on public.teacher_videos to service_role;
grant select (id, teacher_id, mime, size_bytes, duration_seconds, status, note, submitted_at, reviewed_at, created_at, updated_at)
  on public.teacher_videos to authenticated;
create policy teacher_videos_read on public.teacher_videos for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.is_staff()));

-- Records an uploaded file. Returns the keys of earlier uploads that were never sent, for the server to delete.
create or replace function public.add_video(p_storage_key text, p_mime text, p_size_bytes bigint, p_duration_seconds integer)
returns table (id uuid, stale_keys text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.teachers%rowtype;
  v_id    uuid;
  v_stale text[];
begin
  select * into t from public.teachers where user_id = auth.uid();
  if not found or t.application_status <> 'approved' then
    raise exception 'the introduction video is uploaded after your application is approved' using errcode = 'check_violation';
  end if;
  if p_storage_key is null or p_storage_key not like 'expert/' || t.id::text || '/%' then
    raise exception 'that file does not belong to you' using errcode = 'insufficient_privilege';
  end if;
  if p_mime is null or p_mime not in ('video/mp4', 'video/quicktime') then
    raise exception 'use an MP4 or MOV file' using errcode = 'check_violation';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 209715200 then
    raise exception 'the video must be 200 MB or smaller' using errcode = 'check_violation';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 60 or p_duration_seconds > 180 then
    raise exception 'the video must be between 1 and 3 minutes long' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.teacher_videos v where v.teacher_id = t.id and v.status in ('submitted', 'under_review')) then
    raise exception 'a video is already with Koobi for review' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(v.storage_key), '{}') into v_stale
    from public.teacher_videos v where v.teacher_id = t.id and v.status = 'uploaded';
  delete from public.teacher_videos v where v.teacher_id = t.id and v.status = 'uploaded';
  insert into public.teacher_videos (teacher_id, storage_key, mime, size_bytes, duration_seconds)
  values (t.id, p_storage_key, p_mime, p_size_bytes, p_duration_seconds)
  returning teacher_videos.id into v_id;
  return query select v_id, v_stale;
end
$$;

create or replace function public.submit_video(p_video uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.teacher_videos v set status = 'submitted', submitted_at = now(), note = null
   where v.id = p_video and v.status = 'uploaded'
     and exists (select 1 from public.teachers t where t.id = v.teacher_id and t.user_id = auth.uid());
  if not found then
    raise exception 'choose a video first' using errcode = 'check_violation';
  end if;
end
$$;

-- The owner or a reviewer plays the file. A reviewer opening a submitted video starts the review.
create or replace function public.video_key(p_video uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v       public.teacher_videos%rowtype;
  v_owner boolean;
begin
  select * into v from public.teacher_videos where id = p_video;
  if not found then
    raise exception 'video not found' using errcode = 'no_data_found';
  end if;
  v_owner := exists (select 1 from public.teachers t where t.id = v.teacher_id and t.user_id = auth.uid());
  if not v_owner and not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  if not v_owner and v.status = 'submitted' then
    update public.teacher_videos set status = 'under_review' where id = v.id;
  end if;
  return v.storage_key;
end
$$;

create or replace function public.review_video(p_video uuid, p_decision text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v      public.teacher_videos%rowtype;
  v_user uuid;
  v_name text;
begin
  if not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.teacher_videos where id = p_video for update;
  if not found or v.status not in ('submitted', 'under_review') then
    raise exception 'this video is not waiting for review' using errcode = 'check_violation';
  end if;
  if p_decision is null or p_decision not in ('approve', 'changes', 'reject') then
    raise exception 'choose a decision' using errcode = 'check_violation';
  end if;
  if p_decision <> 'approve' and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'say what needs to change; the expert sees this' using errcode = 'check_violation';
  end if;
  if p_decision = 'approve' then
    update public.teacher_videos set status = 'replaced' where teacher_id = v.teacher_id and status = 'approved';
  end if;
  update public.teacher_videos
     set status = case p_decision when 'approve' then 'approved' when 'changes' then 'changes_required' else 'rejected' end,
         note = case when p_decision = 'approve' then null else left(btrim(p_note), 500) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'video.review', 'teacher_videos', v.id, jsonb_build_object('decision', p_decision));
  select t.user_id, split_part(t.display_name, ' ', 1) into v_user, v_name from public.teachers t where t.id = v.teacher_id;
  perform private.notify(v_user,
    case p_decision when 'approve' then 'video_approved' when 'changes' then 'video_changes' else 'video_rejected' end,
    'teacher_video', v.id,
    jsonb_build_object('teacher', v_name, 'note', left(coalesce(btrim(p_note), ''), 300), 'link', '/teach/profile/video'));
end
$$;

-- The server asks for the file behind a published profile's video. Nothing else is ever public.
create or replace function public.public_video_key(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.storage_key
    from public.teacher_videos v
    join public.teachers t on t.id = v.teacher_id
    join private.visible_teachers vt on vt.id = t.id
   where t.slug = p_slug and v.status = 'approved'
$$;

-- ---------------------------------------------------------------------------
-- 6. Changes to public information after approval: reviewed before they go live
-- ---------------------------------------------------------------------------
create table public.teacher_profile_changes (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  changes          jsonb not null check (jsonb_typeof(changes) = 'object'),
  identity_recheck boolean not null default false,  -- the legal name changed
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  note             text check (char_length(note) <= 500),
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.teacher_profile_changes is
  'Draft changes to an approved expert''s public information. The teachers row keeps what is live until a reviewer approves.';
create unique index teacher_profile_changes_one_pending on public.teacher_profile_changes (teacher_id) where status = 'pending';
create trigger teacher_profile_changes_updated_at before update on public.teacher_profile_changes
  for each row execute function private.set_updated_at();
alter table public.teacher_profile_changes enable row level security;
grant all on public.teacher_profile_changes to service_role;
grant select on public.teacher_profile_changes to authenticated;
create policy teacher_profile_changes_read on public.teacher_profile_changes for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.is_staff()));

create or replace function private.reviewed_profile_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['display_name', 'headline', 'bio', 'photo_url', 'country_code', 'languages', 'education_level', 'education_field',
               'experience_band', 'achievements', 'primary_category', 'specialisations', 'audiences', 'formats_offered',
               'learner_outcomes']
$$;

-- Adds to the expert's pending change (or opens one). Values equal to what is live are dropped.
create or replace function public.propose_profile_change(p_changes jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t      public.teachers%rowtype;
  v_live jsonb;
  v_new  jsonb := '{}'::jsonb;
  v_id   uuid;
  k      text;
  v_words integer;
begin
  select * into t from public.teachers where user_id = auth.uid() for update;
  if not found or t.application_status <> 'approved' then
    raise exception 'your profile opens for editing once your application is approved' using errcode = 'check_violation';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'nothing to change' using errcode = 'check_violation';
  end if;
  v_live := to_jsonb(t);
  select c.changes into v_new from public.teacher_profile_changes c where c.teacher_id = t.id and c.status = 'pending' for update;
  v_new := coalesce(v_new, '{}'::jsonb);
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any (private.reviewed_profile_fields())) then
      raise exception 'that field cannot be changed here' using errcode = 'check_violation';
    end if;
    if p_changes -> k is not distinct from v_live -> k then
      v_new := v_new - k;
    else
      v_new := v_new || jsonb_build_object(k, p_changes -> k);
    end if;
  end loop;
  if v_new ? 'display_name' and char_length(btrim(coalesce(v_new ->> 'display_name', ''))) < 2 then
    raise exception 'enter your full legal name' using errcode = 'check_violation';
  end if;
  if v_new ? 'headline' and char_length(btrim(coalesce(v_new ->> 'headline', ''))) < 3 then
    raise exception 'enter your professional title' using errcode = 'check_violation';
  end if;
  if v_new ? 'bio' then
    v_words := private.word_count(v_new ->> 'bio');
    if v_words < 100 or v_words > 250 then
      raise exception 'write a biography of 100 to 250 words' using errcode = 'check_violation';
    end if;
  end if;
  if v_new = '{}'::jsonb then
    update public.teacher_profile_changes set status = 'withdrawn' where teacher_id = t.id and status = 'pending';
    return null;
  end if;
  insert into public.teacher_profile_changes (teacher_id, changes, identity_recheck)
  values (t.id, v_new, v_new ? 'display_name')
  on conflict (teacher_id) where status = 'pending'
  do update set changes = excluded.changes, identity_recheck = excluded.identity_recheck
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.withdraw_profile_change()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.teacher_profile_changes set status = 'withdrawn'
   where teacher_id = (select public.my_teacher_id()) and status = 'pending'
$$;

create or replace function private.jsonb_text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)), '{}'::text[])
$$;

create or replace function public.review_profile_change(p_change uuid, p_approve boolean, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c      public.teacher_profile_changes%rowtype;
  d      jsonb;
  v_user uuid;
begin
  if not (select public.has_any_role(array['reviewer', 'admin']::public.app_role[])) then
    raise exception 'reviewers only' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.teacher_profile_changes where id = p_change for update;
  if not found or c.status <> 'pending' then
    raise exception 'this change is not waiting for review' using errcode = 'check_violation';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'say why; the expert sees this' using errcode = 'check_violation';
  end if;
  d := c.changes;
  if p_approve then
    update public.teachers t set
      display_name     = case when d ? 'display_name' then btrim(d ->> 'display_name') else t.display_name end,
      headline         = case when d ? 'headline' then btrim(d ->> 'headline') else t.headline end,
      bio              = case when d ? 'bio' then d ->> 'bio' else t.bio end,
      photo_url        = case when d ? 'photo_url' then d ->> 'photo_url' else t.photo_url end,
      country_code     = case when d ? 'country_code' then d ->> 'country_code' else t.country_code end,
      languages        = case when d ? 'languages' then private.jsonb_text_array(d -> 'languages') else t.languages end,
      education_level  = case when d ? 'education_level' then d ->> 'education_level' else t.education_level end,
      education_field  = case when d ? 'education_field' then d ->> 'education_field' else t.education_field end,
      experience_band  = case when d ? 'experience_band' then d ->> 'experience_band' else t.experience_band end,
      achievements     = case when d ? 'achievements' then d ->> 'achievements' else t.achievements end,
      primary_category = case when d ? 'primary_category' then d ->> 'primary_category' else t.primary_category end,
      specialisations  = case when d ? 'specialisations' then private.jsonb_text_array(d -> 'specialisations') else t.specialisations end,
      audiences        = case when d ? 'audiences' then private.jsonb_text_array(d -> 'audiences') else t.audiences end,
      formats_offered  = case when d ? 'formats_offered' then private.jsonb_text_array(d -> 'formats_offered') else t.formats_offered end,
      learner_outcomes = case when d ? 'learner_outcomes' then d ->> 'learner_outcomes' else t.learner_outcomes end
    where t.id = c.teacher_id;
  end if;
  update public.teacher_profile_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = case when p_approve then null else left(btrim(p_note), 500) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = c.id;
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'user:' || auth.uid()::text, 'profile_change.review', 'teacher_profile_changes', c.id, null,
          jsonb_build_object('approved', p_approve, 'fields', (select jsonb_agg(x) from jsonb_object_keys(d) x)));
  select t.user_id into v_user from public.teachers t where t.id = c.teacher_id;
  perform private.notify(v_user, case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,
    'teacher_profile_change', c.id,
    jsonb_build_object('note', left(coalesce(btrim(p_note), ''), 300), 'link', '/teach/profile'));
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Publication: every requirement, from real records
-- ---------------------------------------------------------------------------
create or replace function private.profile_requirements(p_teacher uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'approved',   t.application_status = 'approved',
    'photo',      t.photo_url is not null,
    'basic',      coalesce(btrim(t.display_name), '') <> '' and coalesce(btrim(t.headline), '') <> '' and t.country_code is not null,
    'biography',  private.word_count(t.bio) >= 100,
    'background', t.experience_band is not null and coalesce(btrim(t.achievements), '') <> '',
    'expertise',  t.primary_category is not null and cardinality(t.specialisations) > 0 and cardinality(t.audiences) > 0
                  and cardinality(t.languages) > 0 and coalesce(btrim(t.learner_outcomes), '') <> '',
    'video',      exists (select 1 from public.teacher_videos v where v.teacher_id = t.id and v.status = 'approved'),
    'experience', exists (select 1 from public.offerings o where o.teacher_id = t.id and o.listing_status = 'approved'),
    'published',  t.listing_status = 'approved')
    from public.teachers t
   where t.id = p_teacher
$$;

create or replace function public.my_profile_requirements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_requirements((select public.my_teacher_id()))
$$;

create or replace function public.publish_profile()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.teachers%rowtype;
  r jsonb;
begin
  select * into t from public.teachers where user_id = auth.uid() for update;
  if not found then
    raise exception 'start your application first' using errcode = 'check_violation';
  end if;
  if t.status in ('suspended', 'offboarded') then
    raise exception 'this account cannot publish a profile' using errcode = 'check_violation';
  end if;
  r := private.profile_requirements(t.id);
  if (r ->> 'published')::boolean then
    return;
  end if;
  if not (r ->> 'approved')::boolean then
    raise exception 'your application must be approved first' using errcode = 'check_violation';
  end if;
  if not ((r ->> 'photo')::boolean and (r ->> 'basic')::boolean and (r ->> 'biography')::boolean
          and (r ->> 'background')::boolean and (r ->> 'expertise')::boolean) then
    raise exception 'complete your profile information and photo first' using errcode = 'check_violation';
  end if;
  if not (r ->> 'video')::boolean then
    raise exception 'your introduction video must be uploaded and approved first' using errcode = 'check_violation';
  end if;
  if not (r ->> 'experience')::boolean then
    raise exception 'at least one learning experience must be approved first' using errcode = 'check_violation';
  end if;
  if t.listing_status = 'rejected' then
    update public.teachers set listing_status = 'draft', rejection_reason = null where id = t.id;
  end if;
  if t.listing_status <> 'pending_review' then
    update public.teachers set listing_status = 'pending_review' where id = t.id;
  end if;
  update public.teachers set listing_status = 'approved', profile_published_at = now() where id = t.id;
  perform private.application_event(t.id, 'profile_published', null, 'profile_published', jsonb_build_object('link', '/teachers/' || t.slug));
end
$$;

-- The expert takes their own profile off Koobi (their learning experiences leave Explore with it).
create or replace function public.unpublish_profile()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.teachers set listing_status = 'draft' where user_id = auth.uid() and listing_status = 'approved';
  if not found then
    raise exception 'your profile is not published' using errcode = 'check_violation';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. What the public profile shows (new columns are added at the end)
-- ---------------------------------------------------------------------------
create or replace view public.public_teachers with (security_invoker = false) as
select
  t.slug,
  t.display_name,
  t.headline,
  t.bio,
  t.photo_url,
  private.language_labels(t.languages) as languages,
  c.label as county,
  private.teacher_badges(t.id, null) as badges,
  t.response_median_minutes as response_time_minutes,
  rv.review_count::integer as review_count,
  (case when rv.review_count >= private.rating_min_reviews() then rv.rating_avg end) as rating_avg,
  (t.created_at at time zone 'Africa/Nairobi')::date as member_since,
  t.country_code,
  t.experience_band,
  t.achievements,
  t.primary_category,
  t.specialisations,
  t.audiences,
  t.formats_offered,
  t.learner_outcomes,
  (t.application_status = 'approved') as verified,
  exists (select 1 from public.teacher_videos v where v.teacher_id = t.id and v.status = 'approved') as has_video,
  coalesce((select jsonb_agg(jsonb_build_object('title', tc.title, 'kind', tc.kind, 'issuer', tc.issuer) order by tc.created_at)
              from public.teacher_credentials tc
             where tc.teacher_id = t.id and tc.kind <> 'identity' and tc.status = 'approved' and tc.deleted_at is null), '[]'::jsonb) as credentials,
  coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'starts', to_char(w.starts, 'HH24:MI'), 'ends', to_char(w.ends, 'HH24:MI'))
                             order by w.weekday, w.starts)
              from (select distinct aw.weekday, aw.starts, aw.ends
                      from public.availability_windows aw
                      join private.visible_offerings vo on vo.id = aw.offering_id
                     where vo.teacher_id = t.id and aw.kind = 'weekly') w), '[]'::jsonb) as weekly_hours
from public.teachers t
join private.visible_teachers v on v.id = t.id
left join public.counties c on c.code = t.county_code
left join lateral (
  select count(*) as review_count, round(avg(r.rating)::numeric, 2) as rating_avg
    from public.reviews r
   where r.teacher_id = t.id and r.status = 'published') rv on true;

-- ---------------------------------------------------------------------------
-- 9. Storage: videos stay private, profile photos are public once the profile is
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('expert-videos', 'expert-videos', false, 209715200, array['video/mp4', 'video/quicktime']),
           ('expert-photos', 'expert-photos', true, 5242880, array['image/jpeg', 'image/png'])
    on conflict (id) do nothing;
    -- ID documents and certificates of up to 10 MB go to the existing private bucket.
    update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
     where id = 'verification' and file_size_limit is null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.word_count(text), private.teachers_guard(), private.application_event(uuid, text, text, text, jsonb),
  private.application_for_staff(uuid), private.reviewed_profile_fields(), private.jsonb_text_array(jsonb),
  private.profile_requirements(uuid) from public, anon, authenticated;
grant execute on function private.teachers_guard(), private.word_count(text) to authenticated;

revoke all on function public.add_credential(text, text, text, text, text), public.remove_credential(uuid), public.credential_key(uuid),
  public.review_credential(uuid, boolean, text), public.submit_application(text), public.application_start_verification(uuid),
  public.application_invite_meeting(uuid, timestamptz, text), public.application_record_meeting(uuid, text, text),
  public.application_decide(uuid, text, text), public.add_video(text, text, bigint, integer), public.submit_video(uuid),
  public.video_key(uuid), public.review_video(uuid, text, text), public.propose_profile_change(jsonb),
  public.withdraw_profile_change(), public.review_profile_change(uuid, boolean, text), public.my_profile_requirements(),
  public.publish_profile(), public.unpublish_profile() from public, anon;
grant execute on function public.add_credential(text, text, text, text, text), public.remove_credential(uuid), public.credential_key(uuid),
  public.review_credential(uuid, boolean, text), public.submit_application(text), public.application_start_verification(uuid),
  public.application_invite_meeting(uuid, timestamptz, text), public.application_record_meeting(uuid, text, text),
  public.application_decide(uuid, text, text), public.add_video(text, text, bigint, integer), public.submit_video(uuid),
  public.video_key(uuid), public.review_video(uuid, text, text), public.propose_profile_change(jsonb),
  public.withdraw_profile_change(), public.review_profile_change(uuid, boolean, text), public.my_profile_requirements(),
  public.publish_profile(), public.unpublish_profile() to authenticated, service_role;

revoke all on function public.public_video_key(text) from public, anon, authenticated;
grant execute on function public.public_video_key(text) to service_role;
