-- Koobi 1800: the learner workspace (redesign of November 2026).
--
-- 1. Following: a learner follows an expert and is told, in the app, when that expert publishes a
--    new learning experience, opens new dates for a group, or adds times that can be booked.
--    One notice per event per follower; a learner can switch these notices off; unfollowing only
--    removes the follow and never touches bookings, payments or packages.
-- 2. Messages: the payer of a paid booking can open a conversation with its expert (until now a
--    conversation opened only from a concierge shortlist).
-- 3. Learning preferences on the profile: categories, formats and languages the learner likes.

-- ---------------------------------------------------------------------------
-- 1. Following
-- ---------------------------------------------------------------------------
create table public.teacher_follows (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, teacher_id)
);
create index teacher_follows_teacher_idx on public.teacher_follows (teacher_id);
alter table public.teacher_follows enable row level security;
revoke all on public.teacher_follows from anon, authenticated;
grant all on public.teacher_follows to service_role;
grant select on public.teacher_follows to authenticated;
create policy teacher_follows_read_own on public.teacher_follows for select to authenticated
  using (user_id = (select auth.uid()));
comment on table public.teacher_follows is 'Who follows which expert. Written only through follow_teacher and unfollow_teacher.';

alter table public.notification_preferences add column follow_updates boolean not null default true;

insert into public.message_templates (key, channel, subject, body, urgent) values
  ('follow_new_experience', 'in_app', null, '{teacher} has a new learning experience: {title}.', false),
  ('follow_new_dates',      'in_app', null, '{teacher} opened new dates for {title}.', false),
  ('follow_new_times',      'in_app', null, '{teacher} added new times you can book.', false)
on conflict (key, channel, locale) do nothing;

create or replace function public.follow_teacher(p_slug text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_teacher uuid;
  v_owner   uuid;
begin
  if v_uid is null then
    raise exception 'sign in to follow an expert' using errcode = 'insufficient_privilege';
  end if;
  select t.id, t.user_id into v_teacher, v_owner
    from public.teachers t
    join private.visible_teachers v on v.id = t.id
   where t.slug = p_slug;
  if not found then
    raise exception 'this profile is not open right now' using errcode = 'check_violation';
  end if;
  if v_owner = v_uid then
    raise exception 'this is your own profile' using errcode = 'check_violation';
  end if;
  insert into public.teacher_follows (user_id, teacher_id) values (v_uid, v_teacher)
  on conflict (user_id, teacher_id) do nothing;
end
$$;

create or replace function public.unfollow_teacher(p_slug text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.teacher_follows f
   using public.teachers t
   where t.id = f.teacher_id and t.slug = p_slug and f.user_id = (select auth.uid())
$$;

-- The experts the caller follows, newest follow first, with what is new from each.
create or replace function public.my_following()
returns table (
  slug text, display_name text, headline text, followed_at timestamptz, visible boolean, experiences integer,
  categories text[], latest_title text, latest_slug text, latest_format text, latest_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.slug, t.display_name, t.headline, f.created_at, v.id is not null,
         coalesce(n.experiences, 0), coalesce(n.categories, '{}'::text[]),
         l.title, l.slug, l.format, l.published_at
    from public.teacher_follows f
    join public.teachers t on t.id = f.teacher_id
    left join private.visible_teachers v on v.id = t.id
    left join lateral (
      select count(*)::integer as experiences, array_agg(distinct o.category) as categories
        from public.offerings o
        join private.visible_offerings vo on vo.id = o.id
       where o.teacher_id = t.id) n on true
    left join lateral (
      select o.title, o.slug, o.format, o.published_at
        from public.offerings o
        join private.visible_offerings vo on vo.id = o.id
       where o.teacher_id = t.id
       order by o.published_at desc nulls last
       limit 1) l on true
   where f.user_id = (select auth.uid())
   order by f.created_at desc
$$;

-- Tells every follower who has not switched these notices off. private.notify keeps one row per
-- (person, template, entity), so the same event is never told twice.
create or replace function private.notify_followers(p_teacher uuid, p_key text, p_entity_type text, p_entity_id uuid, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select f.user_id
      from public.teacher_follows f
      left join public.notification_preferences np on np.user_id = f.user_id
     where f.teacher_id = p_teacher and coalesce(np.follow_updates, true)
  loop
    perform private.notify(r.user_id, p_key, p_entity_type, p_entity_id, p_payload);
  end loop;
end
$$;

-- A learning experience becomes public (this covers a new programme or workshop too).
create or replace function private.follow_offering_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_status = 'approved' and old.listing_status is distinct from 'approved'
     and exists (select 1 from private.visible_offerings v where v.id = new.id) then
    perform private.notify_followers(new.teacher_id, 'follow_new_experience', 'offering', new.id,
      jsonb_build_object('teacher', (select t.display_name from public.teachers t where t.id = new.teacher_id),
                         'title', new.title, 'link', '/offers/' || new.slug));
  end if;
  return null;
end
$$;
create trigger offerings_90_follow after update of listing_status on public.offerings
  for each row execute function private.follow_offering_published();

-- New dates open for booking on a group class, workshop or programme.
create or replace function private.follow_run_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_slug  text;
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open')
     and exists (select 1 from private.visible_offerings v where v.id = new.offering_id) then
    select o.title, o.slug into v_title, v_slug from public.offerings o where o.id = new.offering_id;
    perform private.notify_followers(new.teacher_id, 'follow_new_dates', 'run', new.id,
      jsonb_build_object('teacher', (select t.display_name from public.teachers t where t.id = new.teacher_id),
                         'title', v_title, 'link', '/offers/' || v_slug));
  end if;
  return null;
end
$$;
create trigger runs_90_follow after insert or update of status on public.runs
  for each row execute function private.follow_run_opened();

-- New bookable times. Saving a schedule writes many rows at once, so this runs once per save and a
-- follower hears about new times from one expert at most once a week.
create or replace function private.follow_times_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct t.id, t.slug, t.display_name
      from added a
      join public.offerings o on o.id = a.offering_id
      join private.visible_offerings v on v.id = o.id
      join public.teachers t on t.id = o.teacher_id
     where a.kind in ('weekly', 'extra')
  loop
    perform private.notify_followers(r.id, 'follow_new_times',
      'teacher_week_' || to_char(now() at time zone 'Africa/Nairobi', 'IYYY"w"IW'), r.id,
      jsonb_build_object('teacher', r.display_name, 'link', '/teachers/' || r.slug));
  end loop;
  return null;
end
$$;
create trigger availability_windows_90_follow after insert on public.availability_windows
  referencing new table as added
  for each statement execute function private.follow_times_added();

revoke all on function private.notify_followers(uuid, text, text, uuid, jsonb), private.follow_offering_published(),
  private.follow_run_opened(), private.follow_times_added() from public, anon, authenticated;
revoke all on function public.follow_teacher(text), public.unfollow_teacher(text), public.my_following() from public, anon;
grant execute on function public.follow_teacher(text), public.unfollow_teacher(text), public.my_following() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A conversation with the expert of a paid booking
-- ---------------------------------------------------------------------------
-- Returns the pair's conversation, opening one if there is none. The booking is paid, so the pair's
-- phone numbers are already shared (FR-MSG-2) and the new conversation starts with contacts revealed.
create or replace function public.open_pair_thread(p_booking uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  b         public.bookings%rowtype;
  v_teacher uuid;
  v_thread  uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.booked_by_user_id is distinct from v_uid then
    raise exception 'not your booking' using errcode = 'insufficient_privilege';
  end if;
  if b.status in ('requested', 'awaiting_payment') or (b.paid_at is null and b.status in ('cancelled', 'lapsed')) then
    raise exception 'you can message the expert once the booking is paid' using errcode = 'check_violation';
  end if;
  select t.user_id into v_teacher from public.teachers t where t.id = b.teacher_id;
  if v_teacher is null or v_teacher = v_uid then
    raise exception 'there is nobody to message on this booking' using errcode = 'check_violation';
  end if;
  select th.id into v_thread
    from public.message_threads th
   where th.kind = 'pair'
     and exists (select 1 from public.thread_participants a where a.thread_id = th.id and a.user_id = v_uid and a.role = 'payer')
     and exists (select 1 from public.thread_participants c where c.thread_id = th.id and c.user_id = v_teacher and c.role = 'teacher')
   order by th.created_at
   limit 1;
  if v_thread is not null then
    return v_thread;
  end if;
  insert into public.message_threads (kind, booking_id, contact_revealed_at) values ('pair', b.id, now())
  returning id into v_thread;
  insert into public.thread_participants (thread_id, user_id, role) values (v_thread, v_uid, 'payer'), (v_thread, v_teacher, 'teacher');
  return v_thread;
end
$$;
revoke all on function public.open_pair_thread(uuid) from public, anon;
grant execute on function public.open_pair_thread(uuid) to authenticated, service_role;

-- A conversation opened from a booking takes its title and the expert's name from that booking
-- (one opened from a shortlist still takes them from the match).
create or replace function public.my_threads()
returns table (
  id uuid, kind text, my_role text, title text, other_name text, last_body text, last_at timestamptz,
  unread integer, contact_revealed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select th.id, th.kind, me.role,
         coalesce(o.title, 'Conversation'),
         case when me.role = 'payer' then coalesce(t.display_name, 'Your teacher')
              when me.role = 'teacher' then coalesce(nullif(split_part(btrim(coalesce(pp.display_name, '')), ' ', 1), ''), 'Learner')
              else 'Koobi team' end,
         lm.body, coalesce(lm.created_at, th.created_at),
         (select count(*)::integer from public.messages x
           where x.thread_id = th.id and x.sender_user_id <> me.user_id
             and x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
             and (x.recipient_user_id is null or x.recipient_user_id = me.user_id)),
         th.contact_revealed_at is not null
    from public.thread_participants me
    join public.message_threads th on th.id = me.thread_id
    left join public.matches m on m.id = th.match_id
    left join public.bookings bk on bk.id = th.booking_id
    left join public.offerings o on o.id = coalesce(m.offering_id, bk.offering_id)
    left join public.teachers t on t.id = coalesce(m.teacher_id, bk.teacher_id)
    left join public.thread_participants payer on payer.thread_id = th.id and payer.role = 'payer'
    left join public.profiles pp on pp.id = payer.user_id
    left join lateral (
      select x.body, x.created_at from public.messages x
       where x.thread_id = th.id and (x.recipient_user_id is null or x.recipient_user_id = me.user_id or x.sender_user_id = me.user_id)
       order by x.created_at desc limit 1
    ) lm on true
   where me.user_id = (select auth.uid())
   order by coalesce(lm.created_at, th.created_at) desc
$$;

create or replace function public.thread_details(p_thread uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'started_at', th.created_at,
           'other_last_seen_at', (select p.last_seen_at from public.thread_participants other
                                    join public.profiles p on p.id = other.user_id
                                   where other.thread_id = th.id and other.user_id <> me.user_id and other.role <> 'staff'
                                   order by p.last_seen_at desc nulls last limit 1),
           'offering', case when o.id is null then null else
             jsonb_build_object('id', o.id, 'title', o.title, 'slug', o.slug, 'format', o.format,
                                'published', o.listing_status = 'approved') end,
           'bookings', coalesce((
             select jsonb_agg(jsonb_build_object('id', b.id, 'title', bo.title, 'kind', b.kind, 'status', b.status,
                                                 'starts_at', b.starts_at) order by b.starts_at desc)
               from public.bookings b
               join public.offerings bo on bo.id = b.offering_id
               join public.teachers bt on bt.id = b.teacher_id
              where b.booked_by_user_id = payer.user_id
                and bt.user_id = teacher.user_id
                and b.status not in ('requested', 'awaiting_payment')), '[]'::jsonb))
    from public.thread_participants me
    join public.message_threads th on th.id = me.thread_id
    left join public.matches m on m.id = th.match_id
    left join public.bookings bk on bk.id = th.booking_id
    left join public.offerings o on o.id = coalesce(m.offering_id, bk.offering_id)
    left join public.thread_participants payer on payer.thread_id = th.id and payer.role = 'payer'
    left join public.thread_participants teacher on teacher.thread_id = th.id and teacher.role = 'teacher'
   where me.thread_id = p_thread and me.user_id = (select auth.uid())
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Learning preferences (My Profile). Empty means no preference.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column interest_categories text[] not null default '{}',
  add column preferred_formats   text[] not null default '{}',
  add column preferred_languages text[] not null default '{}',
  add constraint profiles_interest_categories check (interest_categories <@
    array['career_professional_growth', 'business_entrepreneurship', 'school_academic', 'digital_practical_skills']::text[]),
  add constraint profiles_preferred_formats check (preferred_formats <@ array['one_to_one', 'small_group', 'workshop', 'cohort']::text[]),
  add constraint profiles_preferred_languages check (preferred_languages <@ array['en', 'sw']::text[]);
grant update (interest_categories, preferred_formats, preferred_languages) on public.profiles to authenticated;
