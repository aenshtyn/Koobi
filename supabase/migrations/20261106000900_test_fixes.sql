-- Koobi: fixes from the first end-to-end browser test on koobi-dev (5 Nov 2026).
--
-- 1. Tables added after sprint 1 were never granted to the server role (sprint 1 granted "all tables"
--    once). The message dispatcher could not read templates. Grant them explicitly, and reset the
--    signed-in roles to exactly what the screens need.
-- 2. At most one trial per learner per offering (PRD FR-BOOK-5 AC). An unused trial (cancelled in time,
--    declined, lapsed, teacher no-show) does not count.
-- 3. Pilot metric M2 counted fast matches on requests younger than 48 hours above the line but not below.
-- 4. A teacher's ID number is stored encrypted by the app, like a parent's.

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------
grant all on public.message_templates, public.guardian_identity_checks, public.guardian_documents,
  public.data_requests, public.listing_snapshots to service_role;

revoke all on public.message_templates, public.guardian_identity_checks, public.guardian_documents,
  public.data_requests, public.listing_snapshots from anon, authenticated;
grant select on public.message_templates to authenticated;
grant select on public.guardian_identity_checks to authenticated;
grant insert (check_id, storage_key, kind) on public.guardian_documents to authenticated;
grant select on public.data_requests to authenticated;
grant insert (kind, note) on public.data_requests to authenticated;
grant select on public.listing_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One trial per learner per offering
-- ---------------------------------------------------------------------------
create or replace function private.bookings_one_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'trial' then
    return new;
  end if;
  if exists (
    select 1 from public.bookings x
     where x.learner_id = new.learner_id and x.offering_id = new.offering_id and x.kind = 'trial' and x.id <> new.id
       and (x.status not in ('cancelled', 'lapsed', 'no_show_teacher')
            or exists (select 1 from public.payments p where p.booking_id = x.id and p.hold_status = 'released'))) then
    raise exception 'there is already a trial for this offer; book a full lesson instead' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger bookings_04_one_trial before insert on public.bookings
  for each row execute function private.bookings_one_trial();
revoke all on function private.bookings_one_trial() from public, anon, authenticated;

-- Explore and the booking screen can hide the trial once it is used.
create or replace function public.trial_available(p_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.bookings x
      join public.learners l on l.id = x.learner_id
     where x.offering_id = p_offering and x.kind = 'trial'
       and (l.user_id = (select auth.uid()) or x.booked_by_user_id = (select auth.uid()))
       and l.guardian_id is null
       and (x.status not in ('cancelled', 'lapsed', 'no_show_teacher')
            or exists (select 1 from public.payments p where p.booking_id = x.id and p.hold_status = 'released')))
$$;
revoke all on function public.trial_available(uuid) from public, anon;
grant execute on function public.trial_available(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. M2: the same requests above and below the line
-- ---------------------------------------------------------------------------
create or replace function private.m2_requests(p_track text)
returns table (matched_in_time bigint, eligible bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where r.matched_at is not null and r.matched_at <= r.submitted_at + interval '48 hours'),
         count(*)
    from public.requests r
   where r.status <> 'withdrawn'
     and (r.submitted_at < now() - interval '48 hours' or r.matched_at is not null)
     and (p_track is null or r.track = p_track)
$$;
revoke all on function private.m2_requests(text) from public, anon, authenticated;

create or replace function public.pilot_metrics_v2(p_track text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := public.pilot_metrics(p_track);
  r record;
begin
  select * into r from private.m2_requests(p_track);
  return jsonb_set(v, '{metrics}', (
    select jsonb_agg(case when m ->> 'id' = 'M2' then m || jsonb_build_object('num', r.matched_in_time, 'den', r.eligible) else m end order by ord)
      from jsonb_array_elements(v -> 'metrics') with ordinality as t(m, ord)));
end
$$;
revoke all on function public.pilot_metrics_v2(text) from public, anon;
grant execute on function public.pilot_metrics_v2(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Teacher ID number: the app sends it encrypted (id_number_enc)
-- ---------------------------------------------------------------------------
create or replace function public.submit_check(p_check uuid, p_details jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.verification_checks%rowtype;
  d jsonb := coalesce(p_details, '{}'::jsonb);
begin
  select * into c from public.verification_checks where id = p_check for update;
  if not found or c.teacher_id is distinct from public.my_teacher_id() then
    raise exception 'not your check' using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'pending' then
    raise exception 'this check is %, not waiting for you', c.status using errcode = 'check_violation';
  end if;
  if char_length(d::text) > 4000 then
    raise exception 'too much detail; keep it short' using errcode = 'check_violation';
  end if;
  if c.check_type = 'payout_ownership' then
    raise exception 'the test payout completes this check' using errcode = 'check_violation';
  end if;
  if c.check_type in ('identity_iprs', 'certificate_kcse', 'certificate_degree', 'certificate_tsc', 'good_conduct',
                      'credential_professional', 'experience_evidence', 'portfolio', 'work_history')
     and not exists (select 1 from public.verification_documents vd where vd.check_id = c.id and vd.deleted_at is null) then
    raise exception 'upload the document first' using errcode = 'check_violation';
  end if;
  if c.check_type = 'demo_lesson' and coalesce(d ->> 'video_url', '') !~ '^https://[^ ]{8,300}$' then
    raise exception 'add the link to your recorded lesson' using errcode = 'check_violation';
  end if;
  if c.check_type = 'identity_iprs' and coalesce(d ->> 'id_number_enc', '') !~ '^v1:[A-Za-z0-9+/=]{20,}$' then
    raise exception 'enter your ID number as it appears on the card' using errcode = 'check_violation';
  end if;
  if c.check_type = 'identity_iprs' then
    d := d - 'id_number';  -- never keep a readable copy
  end if;
  if c.check_type = 'tsc_lookup' and coalesce(d ->> 'tsc_number', '') !~ '^[0-9]{4,8}$' then
    raise exception 'enter your TSC number' using errcode = 'check_violation';
  end if;
  if c.check_type in ('teaching_reference', 'reference') and jsonb_array_length(coalesce(d -> 'references', '[]'::jsonb)) < 2 then
    raise exception 'add two references' using errcode = 'check_violation';
  end if;
  update public.verification_checks
     set status = 'in_review', result_summary = result_summary || jsonb_build_object('submitted', d, 'submitted_at', now())
   where id = c.id;
end
$$;

-- The one readable ID number already on koobi-dev came from a test account; drop it.
update public.verification_checks
   set result_summary = jsonb_set(result_summary, '{submitted}', (result_summary -> 'submitted') - 'id_number')
 where check_type = 'identity_iprs' and result_summary -> 'submitted' ? 'id_number';

-- ---------------------------------------------------------------------------
-- 5. A download from Settings is an export already done: record it as completed
-- ---------------------------------------------------------------------------
create or replace function public.log_data_export()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.data_requests (user_id, kind, status, note, completed_at)
  select (select auth.uid()), 'export', 'completed', 'Downloaded from Settings', now()
   where (select auth.uid()) is not null
$$;
revoke all on function public.log_data_export() from public, anon;
grant execute on function public.log_data_export() to authenticated, service_role;
