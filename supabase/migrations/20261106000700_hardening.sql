-- Koobi sprint 8: hardening before the controlled launch (PRD §9, NFR-1, NFR-3).
--
-- 1. Staff MFA enforced in the database, behind a dated parameter (on for production, off on the test site).
-- 2. Money and decisions move only through the audited functions: no direct writes to payouts, batches,
--    verification results, disputes, refunds, parameters or flags; booking states only through actions.
-- 3. A teacher cannot be double-booked; unpaid checkouts are released after 24 hours.
-- 4. Price bands are dated parameters, enforced on every offer.
-- 5. Each booking points at the listing as it was approved (what the learner saw).

-- ---------------------------------------------------------------------------
-- 1. Staff roles need a second factor (AAL2) when staff_mfa_required is true
-- ---------------------------------------------------------------------------
insert into public.parameters (key, track, format, mode, value, effective_from, note) values
  ('staff_mfa_required', null, null, null, 'false', '2026-11-01 00:00:00+03',
   'Turn on (new row, value true) for production. Off only on the test site, where test logins skip the authenticator.')
on conflict do nothing;

create or replace function private.staff_aal_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((private.param('staff_mfa_required') #>> '{}')::boolean, false)
      or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create or replace function public.has_role(role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = $1
  ) and ($1 not in ('concierge', 'reviewer', 'finance', 'admin') or private.staff_aal_ok())
$$;

create or replace function public.has_any_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = any ($1)
      and (ur.role not in ('concierge', 'reviewer', 'finance', 'admin') or private.staff_aal_ok())
  )
$$;

-- State machines check roles too (caller_may): same rule.
create or replace function private.caller_may(p_allowed text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select 'any' = any (p_allowed)
      or exists (select 1 from public.user_roles ur
                  where ur.user_id = (select auth.uid()) and ur.role::text = any (p_allowed)
                    and (ur.role not in ('concierge', 'reviewer', 'finance', 'admin') or private.staff_aal_ok()))
$$;

-- ---------------------------------------------------------------------------
-- 2. Decisions and money only through the audited functions
-- ---------------------------------------------------------------------------
-- Payouts: two approvers in approve_payout_batch; nobody can set a payout or batch approved by hand.
revoke update on public.payouts, public.payout_batches from authenticated;
-- Verification results go through review_check (minutes, audit, tier recompute).
revoke update on public.verification_checks from authenticated;
-- Disputes are opened by open_dispute (which holds the lesson) and decided by resolve_dispute (which posts the ledger).
revoke insert, update on public.disputes from authenticated;
-- Refunds start from a payer's request or a dispute outcome, never from a Finance insert.
revoke insert on public.refunds from authenticated;
-- Parameters are dated rows added by add_parameter; flags change through set_feature_flag.
revoke insert, update, delete on public.parameters, public.feature_flags from authenticated;

-- Booking states: people may only move their own unpaid checkout forward or abandon it; every other
-- change goes through a function (accept, check in, confirm, cancel...).
create or replace function private.bookings_direct_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_system() or new.status is not distinct from old.status then
    return new;
  end if;
  if (old.status, new.status) in (('requested', 'awaiting_payment'), ('requested', 'cancelled'), ('awaiting_payment', 'cancelled')) then
    return new;
  end if;
  raise exception 'booking % -> % must go through the booking actions', old.status, new.status using errcode = 'insufficient_privilege';
end
$$;
create trigger bookings_09_direct_status_guard before update of status on public.bookings
  for each row execute function private.bookings_direct_status_guard();

-- ---------------------------------------------------------------------------
-- 3. No double-booking; unpaid checkouts released
-- ---------------------------------------------------------------------------
-- Matches the open-slot rule: any booking not cancelled or lapsed holds the teacher's time. The check
-- runs with owner rights (a learner cannot see other learners' bookings); the trigger itself runs as the
-- caller so staff corrections made inside the system functions can move a lesson.
create or replace function private.teacher_time_taken(p_teacher uuid, p_booking uuid, p_starts timestamptz, p_minutes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('teacher-time:' || p_teacher::text));
  return exists (
    select 1 from public.bookings b
     where b.teacher_id = p_teacher and b.id <> p_booking and b.kind <> 'seat'
       and b.status not in ('cancelled', 'lapsed')
       and b.starts_at < p_starts + make_interval(mins => p_minutes)
       and p_starts < b.starts_at + make_interval(mins => b.duration_minutes));
end
$$;

create or replace function private.bookings_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'seat' or new.status in ('cancelled', 'lapsed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and (private.is_system() or (new.starts_at = old.starts_at and new.duration_minutes = old.duration_minutes)) then
    return new;
  end if;
  if private.teacher_time_taken(new.teacher_id, new.id, new.starts_at, new.duration_minutes) then
    raise exception 'that time was just taken; choose another' using errcode = 'unique_violation';
  end if;
  return new;
end
$$;
create trigger bookings_08_no_overlap before insert or update of starts_at, duration_minutes on public.bookings
  for each row execute function private.bookings_no_overlap();

-- Checkouts not paid within 24 hours free the slot; unpaid packages too (FR-BOOK-2).
create or replace function private.job_release_abandoned()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b integer;
  v_p integer;
begin
  perform set_config('app.actor', 'system:release_abandoned', true);
  update public.bookings b
     set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'system', cancellation_rule = 'Not paid within 24 hours'
   where b.status in ('requested', 'awaiting_payment') and b.created_at < now() - interval '24 hours'
     and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status in ('pending', 'succeeded'));
  get diagnostics v_b = row_count;
  update public.packages pk set status = 'cancelled'
   where pk.status = 'pending_payment' and pk.created_at < now() - interval '24 hours'
     and not exists (select 1 from public.payments p where p.package_id = pk.id and p.status in ('pending', 'succeeded'));
  get diagnostics v_p = row_count;
  return v_b + v_p;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Price bands as dated parameters (FR-OFF-3), enforced on every offer
-- ---------------------------------------------------------------------------
-- Also in seed.sql; inserted here only where the tracks already exist (a database seeded earlier).
insert into public.parameters (key, track, format, mode, value, effective_from, note)
select v.key, v.track, null, null, v.value::jsonb, '2026-11-01 00:00:00+03', v.note
  from (values
    ('price_band_kes', 'school',              '{"min": 500, "max": 5000}', 'Hourly price band, school track.'),
    ('price_band_kes', 'adults_professional', '{"min": 700, "max": 2500}', 'Hourly price band, adults and professionals.'),
    ('price_band_kes', 'practical',           '{"min": 500, "max": 2000}', 'Hourly price band, practical skills.')) as v(key, track, value, note)
 where exists (select 1 from public.tracks t where t.code = v.track)
on conflict do nothing;

create or replace function private.offerings_price_band()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_band jsonb := private.param('price_band_kes', new.track);
begin
  if v_band is null or new.price_hour_kes is null then
    return new;
  end if;
  if new.price_hour_kes < (v_band ->> 'min')::integer or new.price_hour_kes > (v_band ->> 'max')::integer then
    raise exception 'the hourly price must be between KES % and KES % for this track', v_band ->> 'min', v_band ->> 'max'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger offerings_06_price_band before insert or update of price_hour_kes, track on public.offerings
  for each row execute function private.offerings_price_band();

-- Readable by every signed-in teacher for the offer editor.
create or replace function public.price_bands()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.code, private.param('price_band_kes', t.code)), '{}'::jsonb)
    from public.tracks t where private.param('price_band_kes', t.code) is not null
$$;

-- ---------------------------------------------------------------------------
-- 5. Listing snapshots: what the learner saw when they booked
-- ---------------------------------------------------------------------------
create table public.listing_snapshots (
  id          uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.offerings (id) on delete cascade,
  version     integer not null,
  data        jsonb not null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz not null default now(),
  unique (offering_id, version)
);
alter table public.bookings add column if not exists listing_snapshot_id uuid references public.listing_snapshots (id);
alter table public.listing_snapshots enable row level security;
grant select on public.listing_snapshots to authenticated;
create policy listing_snapshots_read on public.listing_snapshots for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.offerings o where o.id = offering_id and o.teacher_id = (select public.my_teacher_id()))
         or exists (select 1 from public.bookings b where b.listing_snapshot_id = listing_snapshots.id and public.is_booking_payer(b.id)));

create or replace function private.offerings_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_status = 'approved' and old.listing_status is distinct from 'approved' then
    insert into public.listing_snapshots (offering_id, version, data, approved_by)
    values (new.id,
            coalesce((select max(version) from public.listing_snapshots where offering_id = new.id), 0) + 1,
            to_jsonb(new) - 'updated_at' - 'created_at',
            auth.uid());
  end if;
  return new;
end
$$;
create trigger offerings_30_snapshot after update of listing_status on public.offerings
  for each row execute function private.offerings_snapshot();


create or replace function private.bookings_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.listing_snapshot_id := (select s.id from public.listing_snapshots s where s.offering_id = new.offering_id order by s.version desc limit 1);
  return new;
end
$$;
create trigger bookings_06_snapshot before insert on public.bookings
  for each row execute function private.bookings_snapshot();

-- Offers approved before this migration get their first snapshot now.
insert into public.listing_snapshots (offering_id, version, data)
select o.id, 1, to_jsonb(o) - 'updated_at' - 'created_at'
  from public.offerings o
 where o.listing_status = 'approved' and not exists (select 1 from public.listing_snapshots s where s.offering_id = o.id);

-- ---------------------------------------------------------------------------
-- 6. Launch readiness (admin): what the database can tell about itself
-- ---------------------------------------------------------------------------
create or replace function public.readiness_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'staff_mfa_required', coalesce((private.param('staff_mfa_required') #>> '{}')::boolean, false),
    'last_reconciliation', (select jsonb_build_object('status', r.status, 'at', r.created_at, 'findings', jsonb_array_length(r.findings))
                              from public.reconciliation_runs r order by r.created_at desc limit 1),
    'whatsapp_templates_without_name', (select count(*) from public.message_templates where channel = 'whatsapp' and active and whatsapp_template_name is null),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('kind', p.kind, 'version', p.version) order by p.kind), '[]') from public.policy_versions p),
    'teachers_approved', (select count(*) from public.teachers where listing_status = 'approved'),
    'teachers_bookable', (select count(*) from public.teachers where status = 'bookable'),
    'offers_live', (select count(*) from private.visible_offerings),
    'staff', (select coalesce(jsonb_object_agg(x.role, x.n), '{}') from (select role::text, count(*) n from public.user_roles
               where role in ('concierge', 'reviewer', 'finance', 'admin') group by role) x),
    'vat_registered', coalesce((private.param('vat_registered') #>> '{}')::boolean, false),
    'queued_messages', (select count(*) from public.notifications where status = 'queued'),
    'failed_messages_7d', (select count(*) from public.notifications where status = 'failed' and created_at > now() - interval '7 days'),
    'dead_outbox', (select count(*) from public.outbox where status = 'dead'));
end
$$;
revoke all on function public.readiness_checks() from public, anon;
grant execute on function public.readiness_checks() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.staff_aal_ok(), private.job_release_abandoned(),
  private.offerings_price_band(), private.offerings_snapshot(), private.bookings_snapshot() from public, anon, authenticated;
grant execute on function private.job_release_abandoned() to service_role;
grant execute on function private.teacher_time_taken(uuid, uuid, timestamptz, integer) to authenticated, service_role;
revoke all on function public.price_bands() from public, anon;
grant execute on function public.price_bands() to authenticated, service_role;
