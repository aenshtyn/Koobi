-- Koobi 0900: privileges and row-level security (PRD §2.2 permission matrix; §6.4 rule 9:
-- RLS is the floor, the API the ceiling).
--
-- Model:
--   * Supabase grants ALL on public tables to anon and authenticated by default; this migration revokes
--     that and grants back table- or column-level privileges explicitly. Columns the system derives
--     (tiers, prices, caches, ledger state) are not granted, so only the service role or SECURITY DEFINER
--     functions can write them.
--   * anon reads only the taxonomy tables, policy texts and the public views (1000).
--   * State columns are additionally guarded by private.enforce_transition (who may make which move).
--   * Admin has broad rights except where the matrix requires dual control (ledger) or none at all
--     (identity documents are served only by the document service).

-- ---------------------------------------------------------------------------
-- 1. Reset privileges, then grant explicitly
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
-- Trigger and policy helpers in `private` run with the caller's rights and need USAGE; the schema is not
-- exposed through the Data API, so nothing here is callable over HTTP.
grant usage on schema private to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- Policy helpers (public, SECURITY DEFINER, answer only about the caller)
grant execute on function
  public.has_role(public.app_role), public.has_any_role(public.app_role[]), public.is_staff(), public.my_roles(),
  public.my_teacher_id(), public.my_guardian_id(), public.owns_learner(uuid), public.owns_offering(uuid),
  public.owns_run(uuid), public.owns_request(uuid), public.request_open_to_me(uuid),
  public.is_booking_payer(uuid), public.is_booking_teacher(uuid), public.is_booking_party(uuid),
  public.holds_run_seat(uuid), public.is_session_teacher(uuid), public.is_session_party(uuid),
  public.is_thread_participant(uuid), public.can_read_message(uuid, uuid, uuid), public.can_post_message(uuid, uuid)
  to authenticated;
grant execute on function public.has_role(public.app_role), public.has_any_role(public.app_role[]), public.is_staff(), public.my_roles()
  to anon;
grant execute on function public.claim_role(text) to authenticated;

-- Helpers called from triggers and defaults while the caller's role is active
grant execute on function
  private.is_system(), private.caller_may(text[]), private.log_transition(text, uuid, text, text, text),
  private.current_actor(), private.slugify(text), private.normalise_phone(text),
  private.quote_booking(uuid, public.booking_kind, uuid, uuid, integer), private.quote_package(uuid, integer),
  private.payment_amount(uuid, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on every table in public (and keep it on for tables added later in this file)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Taxonomy and public reference data: readable by everyone, written by admin
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['tracks', 'categories', 'category_tracks', 'formats', 'modes', 'curricula', 'levels', 'subjects',
                           'exams', 'practical_domains', 'counties', 'sub_counties', 'estates', 'languages', 'special_needs',
                           'check_types', 'policy_versions']
  loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.has_role(''admin''))) with check ((select public.has_role(''admin'')))',
                   t || '_admin_write', t);
  end loop;
end
$$;

-- Configuration: concierge and finance read; admin writes (§2.2 "Taxonomy, commission rates, ...")
grant select, insert, update, delete on public.parameters, public.feature_flags, public.fx_rates to authenticated;
create policy parameters_staff_read on public.parameters for select to authenticated
  using ((select public.has_any_role('{concierge,finance,admin}')));
create policy parameters_admin_write on public.parameters for all to authenticated
  using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));
create policy feature_flags_staff_read on public.feature_flags for select to authenticated
  using ((select public.has_any_role('{concierge,finance,admin}')));
create policy feature_flags_admin_write on public.feature_flags for all to authenticated
  using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);
create policy fx_rates_admin_write on public.fx_rates for all to authenticated
  using ((select public.has_any_role('{finance,admin}'))) with check ((select public.has_any_role('{finance,admin}')));

grant select on public.state_transitions to authenticated;
create policy state_transitions_read on public.state_transitions for select to authenticated using (true);

grant select on public.state_history to authenticated;
create policy state_history_staff_read on public.state_history for select to authenticated
  using ((select public.has_any_role('{concierge,finance,admin}')));

grant select on public.audit_log to authenticated;
create policy audit_log_read on public.audit_log for select to authenticated
  using ((select public.has_any_role('{finance,admin}')));

-- outbox: no grants, no policies (service role only).

-- ---------------------------------------------------------------------------
-- 4. Accounts and roles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, country_code, time_zone, display_currency, locale) on public.profiles to authenticated;
grant update (status) on public.profiles to authenticated;  -- admin only, by policy and the trigger below
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_role('admin')))
  with check (id = (select auth.uid()) or (select public.has_role('admin')));

create or replace function private.profiles_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not private.is_system() and not public.has_role('admin') then
    raise exception 'only admin can change an account status' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger profiles_05_guard_status before update of status on public.profiles
  for each row execute function private.profiles_guard_status();

grant select, insert, delete on public.user_roles to authenticated;
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('admin')));
-- Self-service roles go through public.claim_role(); direct inserts are admin-only.
create policy user_roles_admin_insert on public.user_roles for insert to authenticated
  with check ((select public.has_role('admin')));
create policy user_roles_admin_delete on public.user_roles for delete to authenticated
  using ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- 5. Guardians, learners, consent (minors' data: guardian, matched teacher via view, staff)
-- ---------------------------------------------------------------------------
grant select on public.guardians to authenticated;
grant insert (user_id, display_name, locality_estate_code) on public.guardians to authenticated;
grant update (display_name, locality_estate_code) on public.guardians to authenticated;
create policy guardians_read on public.guardians for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));
create policy guardians_insert_own on public.guardians for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy guardians_update_own on public.guardians for update to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('admin')))
  with check (user_id = (select auth.uid()) or (select public.has_role('admin')));

grant select, delete on public.learners to authenticated;
grant insert (guardian_id, user_id, alias, year_of_birth, curriculum_code, level_code, subject_codes,
              practical_domain_codes, language_code, special_needs_codes) on public.learners to authenticated;
grant update (alias, year_of_birth, curriculum_code, level_code, subject_codes, practical_domain_codes,
              language_code, special_needs_codes, baseline_score, followup_score) on public.learners to authenticated;
-- Row-based ownership checks (not lookups by id) so INSERT ... RETURNING sees the new row.
create policy learners_read on public.learners for select to authenticated
  using (user_id = (select auth.uid()) or guardian_id = (select public.my_guardian_id())
         or (select public.has_any_role('{concierge,admin}')));
create policy learners_insert_own on public.learners for insert to authenticated
  with check ((user_id = (select auth.uid()) and guardian_id is null)
           or (guardian_id = (select public.my_guardian_id()) and user_id is null));
create policy learners_update_own on public.learners for update to authenticated
  using (user_id = (select auth.uid()) or guardian_id = (select public.my_guardian_id()))
  with check (user_id = (select auth.uid()) or guardian_id = (select public.my_guardian_id()));
create policy learners_delete_own on public.learners for delete to authenticated
  using (user_id = (select auth.uid()) or guardian_id = (select public.my_guardian_id()));

grant select on public.consents to authenticated;
grant insert (guardian_id, learner_id, text_version, channel) on public.consents to authenticated;
grant update (withdrawn_at) on public.consents to authenticated;
create policy consents_read on public.consents for select to authenticated
  using (guardian_id = (select public.my_guardian_id()) or (select public.has_any_role('{concierge,admin}')));
create policy consents_insert_own on public.consents for insert to authenticated
  with check (guardian_id = (select public.my_guardian_id()));
create policy consents_update_own on public.consents for update to authenticated
  using (guardian_id = (select public.my_guardian_id())) with check (guardian_id = (select public.my_guardian_id()));

-- ---------------------------------------------------------------------------
-- 6. Teachers, tracks, locations, verification
-- ---------------------------------------------------------------------------
grant select on public.teachers to authenticated;
grant insert (user_id, slug, display_name, headline, bio, photo_url, languages, county_code, base_estate_code,
              teacher_type, employment_status, employment_declaration_version, employment_declared_at,
              kra_pin_enc, payout_phone_enc, travel_radius_km, alternative_rate_kes, demo_video_key)
  on public.teachers to authenticated;
grant update (slug, display_name, headline, bio, photo_url, languages, county_code, base_estate_code,
              teacher_type, employment_status, employment_declaration_version, employment_declared_at,
              kra_pin_enc, payout_phone_enc, travel_radius_km, alternative_rate_kes, demo_video_key,
              listing_status, rejection_reason, status, status_reason)
  on public.teachers to authenticated;
create policy teachers_read on public.teachers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy teachers_insert_own on public.teachers for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.has_role('admin')));
create policy teachers_update on public.teachers for update to authenticated
  using (user_id = (select auth.uid()) or (select public.has_any_role('{concierge,reviewer,admin}')))
  with check (user_id = (select auth.uid()) or (select public.has_any_role('{concierge,reviewer,admin}')));

grant select on public.teacher_tracks to authenticated;
grant insert (teacher_id, track, waitlist_status) on public.teacher_tracks to authenticated;
grant update (waitlist_status, released_at) on public.teacher_tracks to authenticated;
create policy teacher_tracks_read on public.teacher_tracks for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.is_staff()));
create policy teacher_tracks_insert on public.teacher_tracks for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));
create policy teacher_tracks_update_staff on public.teacher_tracks for update to authenticated
  using ((select public.has_any_role('{concierge,admin}'))) with check ((select public.has_any_role('{concierge,admin}')));

grant select on public.locations to authenticated;
grant insert (kind, label, address_enc, lat, lng, county_code, sub_county_code, estate_code) on public.locations to authenticated;
grant update (kind, label, address_enc, lat, lng, county_code, sub_county_code, estate_code, status, reviewed_by, reviewed_at)
  on public.locations to authenticated;
create policy locations_read on public.locations for select to authenticated
  using (owner_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));
create policy locations_insert_own on public.locations for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy locations_update on public.locations for update to authenticated
  using (owner_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')))
  with check (owner_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));

-- Teachers create their own checks and see status only (view my_verification_checks, 1000).
grant select on public.verification_checks to authenticated;
grant insert (teacher_id, offering_id, track, tier, check_type) on public.verification_checks to authenticated;
grant update (status, vendor, vendor_ref, result_summary, cost_kes, staff_minutes, attempt_no, failure_reason,
              reviewer_id, reviewed_at, expires_at, badge_suspended_at, badge_suspended_reason)
  on public.verification_checks to authenticated;
create policy verification_checks_read on public.verification_checks for select to authenticated
  using ((select public.has_any_role('{reviewer,admin}')));
create policy verification_checks_insert on public.verification_checks for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{reviewer,admin}')));
create policy verification_checks_update on public.verification_checks for update to authenticated
  using ((select public.has_any_role('{reviewer,admin}'))) with check ((select public.has_any_role('{reviewer,admin}')));

-- Identity documents: teachers upload their own; nobody lists them (document service only).
grant insert (check_id, teacher_id, storage_key, kind) on public.verification_documents to authenticated;
create policy verification_documents_upload_own on public.verification_documents for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id())
              and exists (select 1 from public.verification_checks c where c.id = check_id and c.teacher_id = (select public.my_teacher_id())));

grant select, insert on public.staff_time_log to authenticated;
create policy staff_time_log_read on public.staff_time_log for select to authenticated
  using (staff_user_id = (select auth.uid()) or (select public.has_any_role('{finance,admin}')));
create policy staff_time_log_insert on public.staff_time_log for insert to authenticated
  with check (staff_user_id = (select auth.uid()) and (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- 7. Offerings, availability, runs
-- ---------------------------------------------------------------------------
grant select on public.offerings to authenticated;
grant insert (teacher_id, slug, title, summary, description, outcomes, category, track, format, curriculum_code, level_codes,
              subject_code, subject_text, exam_code, practical_domain_code, goal, modes, meeting_tool, location_id,
              price_hour_kes, price_seat_kes, price_visit_kes, capacity_min, capacity_max, duration_minutes,
              sessions_in_run, price_pkg8_kes, price_pkg12_kes, price_pkg16_kes, trial_discount_pct,
              language_codes, special_needs_codes, demo_video_key)
  on public.offerings to authenticated;
grant update (slug, title, summary, description, outcomes, category, track, format, curriculum_code, level_codes,
              subject_code, subject_text, exam_code, practical_domain_code, goal, modes, meeting_tool, location_id,
              price_hour_kes, price_seat_kes, price_visit_kes, capacity_min, capacity_max, duration_minutes,
              sessions_in_run, price_pkg8_kes, price_pkg12_kes, price_pkg16_kes, trial_discount_pct,
              language_codes, special_needs_codes, demo_video_key, listing_status, rejection_reason)
  on public.offerings to authenticated;
grant delete on public.offerings to authenticated;
create policy offerings_read on public.offerings for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.is_staff()));
create policy offerings_insert_own on public.offerings for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_role('admin')));
create policy offerings_update on public.offerings for update to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,reviewer,admin}')))
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,reviewer,admin}')));
create policy offerings_delete on public.offerings for delete to authenticated
  using ((teacher_id = (select public.my_teacher_id()) and listing_status = 'draft') or (select public.has_role('admin')));

grant select, insert, update, delete on public.availability_windows to authenticated;
create policy availability_windows_read on public.availability_windows for select to authenticated
  using (public.owns_offering(offering_id) or (select public.is_staff()));
create policy availability_windows_write on public.availability_windows for all to authenticated
  using (public.owns_offering(offering_id) or (select public.has_any_role('{concierge,admin}')))
  with check (public.owns_offering(offering_id) or (select public.has_any_role('{concierge,admin}')));

grant select on public.runs to authenticated;
grant insert (offering_id, location_id, starts_at, ends_at, capacity_min, capacity_max, price_kes, cutoff_at) on public.runs to authenticated;
grant update (location_id, starts_at, ends_at, capacity_min, capacity_max, price_kes, cutoff_at, status, cancel_reason) on public.runs to authenticated;
grant delete on public.runs to authenticated;
create policy runs_read on public.runs for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or public.holds_run_seat(id) or (select public.is_staff()));
create policy runs_insert on public.runs for insert to authenticated
  with check (public.owns_offering(offering_id) or (select public.has_any_role('{concierge,admin}')));
create policy runs_update on public.runs for update to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')))
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));
create policy runs_delete on public.runs for delete to authenticated
  using ((teacher_id = (select public.my_teacher_id()) and status = 'draft') or (select public.has_any_role('{concierge,admin}')));

grant select, delete on public.run_waiting_list to authenticated;
grant insert (run_id, learner_id, position) on public.run_waiting_list to authenticated;
create policy run_waiting_list_read on public.run_waiting_list for select to authenticated
  using (public.owns_learner(learner_id) or public.owns_run(run_id) or (select public.has_any_role('{concierge,finance,admin}')));
create policy run_waiting_list_insert on public.run_waiting_list for insert to authenticated
  with check (public.owns_learner(learner_id) or (select public.has_any_role('{concierge,admin}')));
create policy run_waiting_list_delete on public.run_waiting_list for delete to authenticated
  using (public.owns_learner(learner_id) or (select public.has_any_role('{concierge,admin}')));

-- ---------------------------------------------------------------------------
-- 8. Requests, matches, shortlists, applications
-- ---------------------------------------------------------------------------
grant select, delete on public.requests to authenticated;
grant insert (requester_id, learner_id, category, track, subject, goal, level, mode, county, estate, budget_max_kes,
              schedule_notes, notes, format_pref, learner_time_zone)
  on public.requests to authenticated;
grant update (learner_id, category, track, subject, goal, level, mode, county, estate, budget_max_kes, schedule_notes,
              notes, format_pref, learner_time_zone, status, curriculum_code, level_code, subject_code, exam_code,
              practical_domain_code, county_code, estate_code, assigned_concierge_id)
  on public.requests to authenticated;
create policy requests_read on public.requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select public.has_any_role('{concierge,finance,admin}')));
create policy requests_insert_own on public.requests for insert to authenticated
  with check (requester_id = (select auth.uid())
              and (learner_id is null or public.owns_learner(learner_id)));
create policy requests_insert_staff on public.requests for insert to authenticated
  with check ((select public.has_any_role('{concierge,admin}')));
create policy requests_update on public.requests for update to authenticated
  using (requester_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')))
  with check (requester_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));
create policy requests_delete on public.requests for delete to authenticated
  using ((requester_id = (select auth.uid()) and status = 'submitted') or (select public.has_any_role('{concierge,admin}')));

grant select on public.matches to authenticated;
grant insert (request_id, teacher_id, offering_id, run_id, rank, source, concierge_reason, pitch, proposed_price_kes, ranking_snapshot)
  on public.matches to authenticated;
grant update (status, decline_reason, rank, concierge_reason, run_id) on public.matches to authenticated;
create policy matches_read on public.matches for select to authenticated
  using (public.owns_request(request_id) or teacher_id = (select public.my_teacher_id())
         or (select public.has_any_role('{concierge,finance,admin}')));
create policy matches_insert_staff on public.matches for insert to authenticated
  with check ((select public.has_any_role('{concierge,admin}')));
create policy matches_update on public.matches for update to authenticated
  using (public.owns_request(request_id) or (select public.has_any_role('{concierge,admin}')))
  with check (public.owns_request(request_id) or (select public.has_any_role('{concierge,admin}')));

grant select on public.shortlists to authenticated;
grant insert (request_id, status, sent_at, expires_at) on public.shortlists to authenticated;
grant update (status, sent_at, expires_at) on public.shortlists to authenticated;
create policy shortlists_read on public.shortlists for select to authenticated
  using (public.owns_request(request_id) or (select public.has_any_role('{concierge,finance,admin}')));
create policy shortlists_write_staff on public.shortlists for all to authenticated
  using ((select public.has_any_role('{concierge,admin}'))) with check ((select public.has_any_role('{concierge,admin}')));

grant select, insert, update, delete on public.shortlist_entries to authenticated;
create policy shortlist_entries_read on public.shortlist_entries for select to authenticated
  using (exists (select 1 from public.shortlists s where s.id = shortlist_id and public.owns_request(s.request_id))
         or (select public.has_any_role('{concierge,finance,admin}')));
create policy shortlist_entries_write_staff on public.shortlist_entries for all to authenticated
  using ((select public.has_any_role('{concierge,admin}'))) with check ((select public.has_any_role('{concierge,admin}')));

grant select on public.teacher_applications to authenticated;
grant insert (request_id, teacher_id, offering_id, pitch, proposed_price_kes) on public.teacher_applications to authenticated;
grant update (status, pitch, proposed_price_kes, match_id) on public.teacher_applications to authenticated;
create policy teacher_applications_read on public.teacher_applications for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,finance,admin}')));
create policy teacher_applications_insert_own on public.teacher_applications for insert to authenticated
  with check ((teacher_id = (select public.my_teacher_id()) and public.request_open_to_me(request_id))
              or (select public.has_any_role('{concierge,admin}')));
create policy teacher_applications_update on public.teacher_applications for update to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')))
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));

-- ---------------------------------------------------------------------------
-- 9. Packages, bookings, sessions, attendance, notes
-- ---------------------------------------------------------------------------
grant select on public.packages to authenticated;
grant insert (learner_id, offering_id, plan_type, sessions_total, starts_on, ends_on, cadence_per_week, is_renewal,
              previous_package_id, billing_day)
  on public.packages to authenticated;
grant update (status) on public.packages to authenticated;
create policy packages_read on public.packages for select to authenticated
  using (booked_by_user_id = (select auth.uid()) or public.owns_learner(learner_id)
         or teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,finance,admin}')));
create policy packages_insert_own on public.packages for insert to authenticated
  with check (public.owns_learner(learner_id) or (select public.has_any_role('{concierge,admin}')));
create policy packages_update on public.packages for update to authenticated
  using (booked_by_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')))
  with check (booked_by_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));

grant select on public.bookings to authenticated;
grant insert (offering_id, learner_id, booked_by_user_id, match_id, package_id, run_id, location_id, kind, mode,
              starts_at, duration_minutes, learner_time_zone, charge_currency, policy_version, policy_acknowledged_at)
  on public.bookings to authenticated;
grant update (meeting_link_enc, location_id, policy_version, policy_acknowledged_at, learner_time_zone, teacher_time_zone,
              guardian_present_ack_teacher, guardian_present_ack_guardian, status)
  on public.bookings to authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (booked_by_user_id = (select auth.uid()) or public.owns_learner(learner_id)
         or teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,finance,admin}')));
create policy bookings_insert_own on public.bookings for insert to authenticated
  with check ((booked_by_user_id = (select auth.uid()) and public.owns_learner(learner_id))
              or (select public.has_any_role('{concierge,admin}')));
create policy bookings_update on public.bookings for update to authenticated
  using (booked_by_user_id = (select auth.uid()) or public.owns_learner(learner_id)
         or teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')))
  with check (booked_by_user_id = (select auth.uid()) or public.owns_learner(learner_id)
         or teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));

grant select on public.sessions to authenticated;
grant insert (booking_id, run_id, sequence_no, starts_at, ends_at) on public.sessions to authenticated;
grant update (checked_in_at, checkin_method, checkin_distance_m, link_opened_at, checked_out_at, actual_minutes,
              device_checkin_at, device_checkout_at, status)
  on public.sessions to authenticated;
create policy sessions_read on public.sessions for select to authenticated
  using ((booking_id is not null and public.is_booking_party(booking_id))
         or (run_id is not null and (public.owns_run(run_id) or public.holds_run_seat(run_id)))
         or (select public.has_any_role('{concierge,finance,admin}')));
create policy sessions_insert on public.sessions for insert to authenticated
  with check ((run_id is not null and public.owns_run(run_id)) or (select public.has_any_role('{concierge,admin}')));
create policy sessions_update on public.sessions for update to authenticated
  using (public.is_session_teacher(id) or (select public.has_any_role('{concierge,admin}')))
  with check (public.is_session_teacher(id) or (select public.has_any_role('{concierge,admin}')));

grant select on public.attendance to authenticated;
grant insert (session_id, booking_id, status) on public.attendance to authenticated;
grant update (status, corrected_by) on public.attendance to authenticated;
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_booking_payer(booking_id) or public.is_session_teacher(session_id)
         or (select public.has_any_role('{concierge,finance,admin}')));
create policy attendance_write on public.attendance for insert to authenticated
  with check (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')));
create policy attendance_update on public.attendance for update to authenticated
  using (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')))
  with check (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')));

grant select on public.lesson_notes to authenticated;
grant insert (session_id, covered, progress, next_steps, per_learner_lines, prep_minutes, travel_minutes) on public.lesson_notes to authenticated;
grant update (covered, progress, next_steps, per_learner_lines, prep_minutes, travel_minutes) on public.lesson_notes to authenticated;
create policy lesson_notes_read on public.lesson_notes for select to authenticated
  using (public.is_session_party(session_id) or (select public.has_any_role('{concierge,admin}')));
create policy lesson_notes_insert on public.lesson_notes for insert to authenticated
  with check (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')));
create policy lesson_notes_update on public.lesson_notes for update to authenticated
  using (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')))
  with check (public.is_session_teacher(session_id) or (select public.has_any_role('{concierge,admin}')));

-- ---------------------------------------------------------------------------
-- 10. Money. Ledger writes are service-role only; teachers read their own statement entries.
-- ---------------------------------------------------------------------------
grant select on public.payments to authenticated;
grant insert (booking_id, package_id, method, charge_currency, payer_country) on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (payer_user_id = (select auth.uid()) or (select public.has_any_role('{concierge,finance,admin}')));
create policy payments_insert_own on public.payments for insert to authenticated
  with check (payer_user_id = (select auth.uid())
              and ((booking_id is not null and public.is_booking_payer(booking_id))
                or (package_id is not null and exists (select 1 from public.packages p where p.id = package_id
                                                         and (p.booked_by_user_id = (select auth.uid()) or public.owns_learner(p.learner_id))))));

grant select on public.provider_events to authenticated;
create policy provider_events_read on public.provider_events for select to authenticated
  using ((select public.has_any_role('{finance,admin}')));

grant select on public.ledger_accounts to authenticated;
create policy ledger_accounts_read on public.ledger_accounts for select to authenticated using (true);

grant select on public.ledger_entries to authenticated;
create policy ledger_entries_read on public.ledger_entries for select to authenticated
  using (counterparty_user_id = (select auth.uid()) or (select public.has_any_role('{finance,admin}')));

grant select on public.ledger_transactions to authenticated;
create policy ledger_transactions_read on public.ledger_transactions for select to authenticated
  using ((select public.has_any_role('{finance,admin}'))
         or exists (select 1 from public.ledger_entries e
                     where e.txn_id = ledger_transactions.id and e.counterparty_user_id = (select auth.uid())));

grant select on public.ledger_account_balances to authenticated;

grant select on public.ledger_adjustment_requests to authenticated;
grant insert (reason, proposed_entries, reversal_of_txn_id) on public.ledger_adjustment_requests to authenticated;
grant update (status, approved_by, decided_at) on public.ledger_adjustment_requests to authenticated;
create policy ledger_adjustments_read on public.ledger_adjustment_requests for select to authenticated
  using ((select public.has_any_role('{finance,admin}')));
create policy ledger_adjustments_insert on public.ledger_adjustment_requests for insert to authenticated
  with check ((select public.has_any_role('{finance,admin}')) and requested_by = (select auth.uid()));
create policy ledger_adjustments_approve on public.ledger_adjustment_requests for update to authenticated
  using ((select public.has_any_role('{finance,admin}')) and requested_by <> (select auth.uid()))
  with check ((select public.has_any_role('{finance,admin}')) and approved_by = (select auth.uid()));

grant select on public.payout_batches to authenticated;
grant update (status, approved_by, second_approver, approved_at) on public.payout_batches to authenticated;
create policy payout_batches_read on public.payout_batches for select to authenticated
  using ((select public.has_any_role('{finance,admin}')));
create policy payout_batches_update on public.payout_batches for update to authenticated
  using ((select public.has_any_role('{finance,admin}'))) with check ((select public.has_any_role('{finance,admin}')));

grant select on public.payouts to authenticated;
grant update (status, approved_by, second_approver, exclusion_reason) on public.payouts to authenticated;
create policy payouts_read on public.payouts for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{finance,admin}')));
create policy payouts_update on public.payouts for update to authenticated
  using ((select public.has_any_role('{finance,admin}'))) with check ((select public.has_any_role('{finance,admin}')));

grant select on public.payout_lines to authenticated;
create policy payout_lines_read on public.payout_lines for select to authenticated
  using ((select public.has_any_role('{finance,admin}'))
         or exists (select 1 from public.payouts p where p.id = payout_id and p.teacher_id = (select public.my_teacher_id())));

grant select on public.refunds to authenticated;
grant insert (payment_id, booking_id, package_id, dispute_id, amount_kes, method, reason) on public.refunds to authenticated;
grant update (status, approved_by) on public.refunds to authenticated;
create policy refunds_read on public.refunds for select to authenticated
  using ((select public.has_any_role('{concierge,finance,admin}'))
         or exists (select 1 from public.payments p where p.id = payment_id and p.payer_user_id = (select auth.uid())));
create policy refunds_insert on public.refunds for insert to authenticated
  with check ((select public.has_any_role('{finance,admin}')));
create policy refunds_update on public.refunds for update to authenticated
  using ((select public.has_any_role('{finance,admin}'))) with check ((select public.has_any_role('{finance,admin}')));

grant select on public.reconciliation_runs to authenticated;
create policy reconciliation_runs_read on public.reconciliation_runs for select to authenticated
  using ((select public.has_any_role('{finance,admin}')));

-- ---------------------------------------------------------------------------
-- 11. Reviews, disputes, messaging, notifications
-- ---------------------------------------------------------------------------
grant select on public.reviews to authenticated;
grant insert (booking_id, rating, body) on public.reviews to authenticated;
grant update (teacher_reply, status, moderation_reason) on public.reviews to authenticated;
create policy reviews_read on public.reviews for select to authenticated
  using (status = 'published' or author_user_id = (select auth.uid()) or teacher_id = (select public.my_teacher_id())
         or (select public.has_any_role('{concierge,admin}')));
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (author_user_id = (select auth.uid()));
create policy reviews_update on public.reviews for update to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')))
  with check (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));

grant select on public.learner_reliability_ratings to authenticated;
grant insert (booking_id, teacher_id, rating, note) on public.learner_reliability_ratings to authenticated;
grant update (rating, note) on public.learner_reliability_ratings to authenticated;
create policy learner_reliability_read on public.learner_reliability_ratings for select to authenticated
  using (teacher_id = (select public.my_teacher_id()) or (select public.has_any_role('{concierge,admin}')));
create policy learner_reliability_write on public.learner_reliability_ratings for insert to authenticated
  with check (teacher_id = (select public.my_teacher_id()) and public.is_booking_teacher(booking_id));
create policy learner_reliability_update on public.learner_reliability_ratings for update to authenticated
  using (teacher_id = (select public.my_teacher_id())) with check (teacher_id = (select public.my_teacher_id()));

grant select on public.disputes to authenticated;
grant insert (booking_id, session_id, type, description) on public.disputes to authenticated;
grant update (status, outcome, refund_kes, credit_kes, clawback_kes, staff_minutes, handled_by, evidence_snapshot)
  on public.disputes to authenticated;
create policy disputes_read on public.disputes for select to authenticated
  using (opened_by_user_id = (select auth.uid()) or public.is_booking_party(booking_id)
         or (select public.has_any_role('{concierge,finance,admin}')));
create policy disputes_insert on public.disputes for insert to authenticated
  with check (public.is_booking_party(booking_id) or (select public.has_any_role('{concierge,admin}')));
create policy disputes_update_staff on public.disputes for update to authenticated
  using ((select public.has_any_role('{concierge,finance,admin}')))
  with check ((select public.has_any_role('{concierge,finance,admin}')));

grant select on public.message_threads to authenticated;
grant insert (kind, owner_user_id, match_id, booking_id, run_id, request_id) on public.message_threads to authenticated;
create policy message_threads_read on public.message_threads for select to authenticated
  using (public.is_thread_participant(id) or (select public.has_any_role('{concierge,admin}')));
create policy message_threads_insert_staff on public.message_threads for insert to authenticated
  with check ((select public.has_any_role('{concierge,admin}')));

grant select on public.thread_participants to authenticated;
grant insert (thread_id, user_id, role) on public.thread_participants to authenticated;
grant update (last_read_at) on public.thread_participants to authenticated;
create policy thread_participants_read on public.thread_participants for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_any_role('{concierge,admin}')));
create policy thread_participants_insert_staff on public.thread_participants for insert to authenticated
  with check ((select public.has_any_role('{concierge,admin}')));
create policy thread_participants_update_own on public.thread_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.messages to authenticated;
grant insert (thread_id, recipient_user_id, body, attachment_key) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated
  using (public.can_read_message(thread_id, sender_user_id, recipient_user_id)
         or (select public.has_any_role('{concierge,admin}')));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_user_id = (select auth.uid()) and public.can_post_message(thread_id, recipient_user_id));
create policy messages_mark_read on public.messages for update to authenticated
  using (sender_user_id <> (select auth.uid()) and public.can_read_message(thread_id, sender_user_id, recipient_user_id))
  with check (sender_user_id <> (select auth.uid()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('admin')));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.notification_preferences to authenticated;
create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('admin')))
  with check (user_id = (select auth.uid()) or (select public.has_role('admin')));
