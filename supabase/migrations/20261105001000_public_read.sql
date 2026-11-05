-- Koobi 1000: public read contract (the UI codes against these names and columns).
--   public.explore_offers, public.offer_details, public.public_teachers, public.public_reviews
-- They are owner-rights views (security_invoker = false) so anon can read them without any access to
-- the base tables. They expose only approved offerings of approved, non-suspended teachers who are not
-- waitlisted on the offering's track (FR-OFF-5, FR-OFF-6), and never phone, email, ID, KRA PIN, exact
-- address or certificates (FR-OFF-4). Ratings appear only from rating_min_reviews published reviews
-- (dated parameter, default 3; FR-MATCH-6). Badges list passed, unexpired, unsuspended checks only.
--
-- Also: signed-in helper views for teachers and staff (my_verification_checks, teacher_learner_cards,
-- teacher_open_requests).

-- ---------------------------------------------------------------------------
-- Visibility rules, in one place
-- ---------------------------------------------------------------------------
create view private.visible_teachers as
select t.id
  from public.teachers t
 where t.listing_status = 'approved'
   and t.status not in ('suspended', 'offboarded')
   and (exists (select 1 from public.teacher_tracks tt where tt.teacher_id = t.id and tt.waitlist_status <> 'waitlisted')
        or not exists (select 1 from public.teacher_tracks tt where tt.teacher_id = t.id));

create view private.visible_offerings as
select o.id, o.teacher_id
  from public.offerings o
  join public.teachers t on t.id = o.teacher_id
 where o.listing_status = 'approved'
   and t.listing_status = 'approved'
   and t.status not in ('suspended', 'offboarded')
   and not exists (select 1 from public.teacher_tracks tt
                    where tt.teacher_id = t.id and tt.track = o.track and tt.waitlist_status = 'waitlisted');

create or replace function private.rating_min_reviews()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.param('rating_min_reviews') #>> '{}')::integer, 3)
$$;

-- Badges: [{"label": text, "passed_at": date}] for passed checks only. p_offering adds that offering's
-- own checks (subject test); null returns teacher-level badges.
create or replace function private.teacher_badges(p_teacher uuid, p_offering uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'passed_at', b.passed_at) order by b.sort_order, b.label), '[]'::jsonb)
    from (
      select ct.badge_label as label,
             (max(vc.passed_at) at time zone 'Africa/Nairobi')::date as passed_at,
             min(ct.sort_order) as sort_order
        from public.verification_checks vc
        join public.check_types ct on ct.code = vc.check_type
       where vc.teacher_id = p_teacher
         and vc.status = 'passed'
         and ct.badge_label is not null
         and vc.badge_suspended_at is null
         and (vc.expires_at is null or vc.expires_at > now())
         and (vc.offering_id is null or vc.offering_id = p_offering)
       group by ct.badge_label
    ) b
$$;

create or replace function private.language_labels(p_codes text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select coalesce(l.label, x.code)
      from unnest(p_codes) with ordinality as x(code, ord)
      left join public.languages l on l.code = x.code
     order by x.ord), '{}'::text[])
$$;

-- Upcoming open start times for a visible offering.
--   one_to_one: slots of duration_minutes inside weekly and extra availability windows over the next
--     p_days days (Africa/Nairobi), minus blocked dates and anything overlapping the teacher's active
--     bookings, run sessions or single-occurrence runs.
--   seat formats: start times of open or confirmed runs with seats left.
-- TODO: add the in-person travel buffer (§9.6) and the minimum lead time (FR-BOOK-1) once they are
-- dated parameters.
create or replace function private.offering_open_slots(p_offering uuid, p_limit integer default 6, p_days integer default 28)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select o.id, o.teacher_id, o.format, o.duration_minutes
      from public.offerings o
      join private.visible_offerings v on v.id = o.id
     where o.id = p_offering
  ),
  today as (
    select (now() at time zone 'Africa/Nairobi')::date as d
  ),
  windows as (
    select (g.dd::date + w.starts) as ws, (g.dd::date + w.ends) as we
      from o
      join public.availability_windows w on w.offering_id = o.id and w.kind = 'weekly'
      cross join today
      cross join lateral generate_series(today.d::timestamp, (today.d + p_days)::timestamp, interval '1 day') as g(dd)
     where extract(dow from g.dd)::integer = w.weekday
       and not exists (
         select 1 from public.availability_windows b
          where b.offering_id = o.id and b.kind = 'blocked' and b.exception_date = g.dd::date
            and (b.starts is null or (b.starts < w.ends and b.ends > w.starts)))
    union all
    select (w.exception_date + w.starts), (w.exception_date + w.ends)
      from o
      join public.availability_windows w on w.offering_id = o.id and w.kind = 'extra'
      cross join today
     where w.exception_date between today.d and today.d + p_days
  ),
  window_slots as (
    select distinct (s.local_start at time zone 'Africa/Nairobi') as starts_at
      from o
      cross join windows
      cross join lateral generate_series(windows.ws, windows.we - make_interval(mins => o.duration_minutes),
                                         make_interval(mins => o.duration_minutes)) as s(local_start)
     where o.format = 'one_to_one'
  ),
  free_slots as (
    select ws.starts_at
      from window_slots ws
      cross join o
     where ws.starts_at > now()
       and not exists (
         select 1 from public.bookings b
          where b.teacher_id = o.teacher_id and b.kind <> 'seat' and b.status not in ('cancelled', 'lapsed')
            and b.starts_at < ws.starts_at + make_interval(mins => o.duration_minutes)
            and ws.starts_at < b.starts_at + make_interval(mins => b.duration_minutes))
       and not exists (
         select 1 from public.sessions s join public.runs r on r.id = s.run_id
          where r.teacher_id = o.teacher_id and s.status <> 'cancelled'
            and s.starts_at < ws.starts_at + make_interval(mins => o.duration_minutes)
            and ws.starts_at < s.ends_at)
       and not exists (
         select 1 from public.runs r
          where r.teacher_id = o.teacher_id and r.format in ('workshop', 'site_visit')
            and r.status in ('open', 'confirmed', 'in_progress')
            and r.starts_at < ws.starts_at + make_interval(mins => o.duration_minutes)
            and ws.starts_at < r.ends_at)
  ),
  run_slots as (
    select r.starts_at
      from o
      join public.runs r on r.offering_id = o.id
     where o.format <> 'one_to_one'
       and r.status in ('open', 'confirmed')
       and r.starts_at > now()
       and r.seats_reserved < r.capacity_max
  )
  select x.starts_at
    from (select starts_at from free_slots union select starts_at from run_slots) x
   order by x.starts_at
   limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- public.explore_offers: one row per Explore card
-- ---------------------------------------------------------------------------
create view public.explore_offers with (security_invoker = false) as
select
  o.id,
  o.slug,
  o.title,
  o.summary,
  o.category,
  o.track,
  o.format,
  (case o.format
     when 'one_to_one' then round(o.price_hour_kes * o.duration_minutes / 60.0)
     when 'site_visit' then coalesce(nr.price_kes, o.price_visit_kes)
     else coalesce(nr.price_kes, o.price_seat_kes)
   end)::integer as price_kes,
  f.price_basis,
  o.duration_minutes,
  o.sessions_in_run,
  o.modes,
  (case when o.modes && array['in_home', 'teacher_premises', 'hybrid', 'site']::text[]
        then coalesce(sc.label, tc.label) end) as county,
  (case when o.format <> 'site_visit' and o.modes && array['in_home', 'teacher_premises', 'hybrid']::text[]
        then te.label end) as estate,
  (case when o.format = 'one_to_one' then ns.starts_at else nr.starts_at end) as next_start,
  (case when o.format <> 'one_to_one' then nr.seats_left end)::integer as seats_left,
  (case when rv.review_count >= private.rating_min_reviews() then rv.rating_avg end) as rating_avg,
  rv.review_count::integer as review_count,
  t.slug as teacher_slug,
  t.display_name as teacher_name,
  t.headline as teacher_headline,
  t.photo_url as teacher_photo_url,
  private.teacher_badges(t.id, o.id) as badges,
  o.published_at,
  coalesce(tt.tier, 0)::integer as rank_tier
from public.offerings o
join private.visible_offerings v on v.id = o.id
join public.teachers t on t.id = o.teacher_id
join public.formats f on f.code = o.format
left join public.teacher_tracks tt on tt.teacher_id = t.id and tt.track = o.track
left join public.counties tc on tc.code = t.county_code
left join public.estates te on te.code = t.base_estate_code
left join public.locations sl on sl.id = o.location_id
left join public.counties sc on sc.code = sl.county_code
left join lateral (
  select count(*) as review_count, round(avg(r.rating)::numeric, 2) as rating_avg
    from public.reviews r
   where r.offering_id = o.id and r.status = 'published') rv on true
left join lateral (
  select r.starts_at, r.capacity_max - r.seats_reserved as seats_left, r.price_kes
    from public.runs r
   where r.offering_id = o.id and r.status in ('open', 'confirmed') and r.starts_at > now()
   order by r.starts_at
   limit 1) nr on true
left join lateral (
  select min(x.ts) as starts_at
    from private.offering_open_slots(o.id, 1) as x(ts)
   where o.format = 'one_to_one') ns on true
-- FR-MATCH-5 / FR-MATCH-6 default order: tier, rated before unrated, rating, response time,
-- on-platform hours, then soonest start. Callers may re-order.
order by coalesce(tt.tier, 0) desc,
         (rv.review_count >= private.rating_min_reviews()) desc,
         rv.rating_avg desc nulls last,
         t.response_median_minutes asc nulls last,
         t.on_platform_hours desc,
         (case when o.format = 'one_to_one' then ns.starts_at else nr.starts_at end) asc nulls last,
         o.published_at desc;

comment on view public.explore_offers is
  'Explore cards. price_kes is per session (one_to_one, hourly price x duration), per seat (small_group per session, workshop), full programme (cohort) or per visit (site_visit), as price_basis states.';

-- ---------------------------------------------------------------------------
-- public.offer_details: the offer page, beyond the Explore card
-- ---------------------------------------------------------------------------
create view public.offer_details with (security_invoker = false) as
select
  o.id,
  o.slug,
  o.description,
  o.outcomes,
  private.language_labels(o.language_codes) as languages,
  (case when o.modes && array['online', 'hybrid']::text[] then
     case o.meeting_tool when 'google_meet' then 'Google Meet' when 'zoom' then 'Zoom' end
   end) as meeting_tool,
  (case when o.format = 'one_to_one' and o.trial_discount_pct is not null then
     round(o.price_hour_kes * o.duration_minutes / 60.0)
     - round(round(o.price_hour_kes * o.duration_minutes / 60.0) * o.trial_discount_pct / 100.0)
   end)::integer as trial_price_kes,
  (select jsonb_agg(jsonb_build_object('sessions', p.sessions, 'price_kes', p.price_kes) order by p.sessions)
     from (values (8, o.price_pkg8_kes), (12, o.price_pkg12_kes), (16, o.price_pkg16_kes)) as p(sessions, price_kes)
    where p.price_kes is not null and o.format = 'one_to_one') as package_prices,
  coalesce(array(select s.ts from private.offering_open_slots(o.id, 6) as s(ts) order by s.ts), '{}'::timestamptz[]) as next_slots
from public.offerings o
join private.visible_offerings v on v.id = o.id;

-- ---------------------------------------------------------------------------
-- public.public_teachers: teacher profile pages
-- ---------------------------------------------------------------------------
create view public.public_teachers with (security_invoker = false) as
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
  (t.created_at at time zone 'Africa/Nairobi')::date as member_since
from public.teachers t
join private.visible_teachers v on v.id = t.id
left join public.counties c on c.code = t.county_code
left join lateral (
  select count(*) as review_count, round(avg(r.rating)::numeric, 2) as rating_avg
    from public.reviews r
   where r.teacher_id = t.id and r.status = 'published') rv on true;

-- ---------------------------------------------------------------------------
-- public.public_reviews: published reviews of visible teachers (first name only)
-- ---------------------------------------------------------------------------
create view public.public_reviews with (security_invoker = false) as
select
  r.offering_id,
  t.slug as teacher_slug,
  r.rating::integer as rating,
  r.body,
  r.created_at,
  nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), '') as reviewer_first_name
from public.reviews r
join public.teachers t on t.id = r.teacher_id
join private.visible_teachers v on v.id = t.id
left join public.profiles p on p.id = r.author_user_id
where r.status = 'published'
order by r.created_at desc;

-- ---------------------------------------------------------------------------
-- Signed-in helper views (owner rights, filtered to the caller)
-- ---------------------------------------------------------------------------
-- Teachers see the status of their own checks, never result summaries or documents (§2.2).
create view public.my_verification_checks with (security_invoker = false) as
select vc.id, vc.teacher_id, vc.offering_id, vc.track, vc.tier, vc.check_type, ct.label as check_label,
       ct.badge_label, vc.status, vc.passed_at, vc.expires_at, vc.created_at, vc.updated_at
  from public.verification_checks vc
  join public.check_types ct on ct.code = vc.check_type
 where vc.teacher_id = (select public.my_teacher_id())
    or (select public.has_any_role('{concierge,reviewer,admin}'));

-- Minimal learner fields for the teacher of a paid booking (§2.2 "R pair (minimal fields)").
create view public.teacher_learner_cards with (security_invoker = false) as
select distinct l.id as learner_id, l.alias, l.is_minor, l.curriculum_code, l.level_code, l.language_code,
       l.special_needs_codes
  from public.learners l
  join public.bookings b on b.learner_id = l.id
 where b.teacher_id = (select public.my_teacher_id())
   and b.status not in ('requested', 'awaiting_payment', 'cancelled', 'lapsed');

-- Open requests a teacher may apply to (FR-MATCH-3); no requester identity, no free-text notes.
create view public.teacher_open_requests with (security_invoker = false) as
select r.id, r.category, r.track, r.format_pref, r.subject, r.goal, r.level, r.mode, r.county, r.estate,
       r.budget_max_kes, r.schedule_notes, r.learner_time_zone, r.created_at
  from public.requests r
 where r.status in ('submitted', 'triaged')
   and public.request_open_to_me(r.id);

-- ---------------------------------------------------------------------------
-- Grants (Supabase's default privileges grant ALL on new views; reset them)
-- ---------------------------------------------------------------------------
revoke all on public.explore_offers, public.offer_details, public.public_teachers, public.public_reviews,
              public.my_verification_checks, public.teacher_learner_cards, public.teacher_open_requests
  from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

grant select on public.explore_offers, public.offer_details, public.public_teachers, public.public_reviews
  to anon, authenticated;
grant select on public.my_verification_checks, public.teacher_learner_cards, public.teacher_open_requests
  to authenticated;
grant select on all tables in schema public to service_role;

revoke all on function private.rating_min_reviews(), private.teacher_badges(uuid, uuid), private.language_labels(text[]),
                       private.offering_open_slots(uuid, integer, integer)
  from public;
grant execute on function private.rating_min_reviews(), private.teacher_badges(uuid, uuid), private.language_labels(text[]),
                          private.offering_open_slots(uuid, integer, integer)
  to anon, authenticated, service_role;
