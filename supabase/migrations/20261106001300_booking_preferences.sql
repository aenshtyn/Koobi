-- Koobi: each expert's own booking rules (Availability & Schedule, T13).
--
-- Until now every expert had the same rules: 2 hours' notice, 28 days ahead, no gap between lessons.
-- An expert can now set their own shortest notice, how far ahead learners can book, and a gap to keep
-- free before and after each booked lesson. The open-slot function applies them; it is the one place
-- that decides which times a learner is offered.

alter table public.teachers
  add column min_notice_hours smallint not null default 2 check (min_notice_hours between 2 and 72),
  add column advance_days     smallint not null default 28 check (advance_days between 7 and 60),
  add column buffer_minutes   smallint not null default 0 check (buffer_minutes between 0 and 60);

create or replace function public.set_booking_preferences(p_notice_hours integer, p_advance_days integer, p_buffer_minutes integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := (select public.my_teacher_id());
begin
  if v_teacher is null then
    raise exception 'apply to teach first' using errcode = 'insufficient_privilege';
  end if;
  if p_notice_hours is null or p_notice_hours not between 2 and 72 then
    raise exception 'shortest notice must be between 2 and 72 hours' using errcode = 'check_violation';
  end if;
  if p_advance_days is null or p_advance_days not between 7 and 60 then
    raise exception 'learners can book between 7 and 60 days ahead' using errcode = 'check_violation';
  end if;
  if p_buffer_minutes is null or p_buffer_minutes not between 0 and 60 then
    raise exception 'the gap between lessons must be between 0 and 60 minutes' using errcode = 'check_violation';
  end if;
  update public.teachers
     set min_notice_hours = p_notice_hours, advance_days = p_advance_days, buffer_minutes = p_buffer_minutes
   where id = v_teacher;
end
$$;
revoke all on function public.set_booking_preferences(integer, integer, integer) from public, anon;
grant execute on function public.set_booking_preferences(integer, integer, integer) to authenticated, service_role;

-- The caller's own rules, for the settings form.
create or replace function public.my_booking_preferences()
returns table (min_notice_hours integer, advance_days integer, buffer_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.min_notice_hours::integer, t.advance_days::integer, t.buffer_minutes::integer
    from public.teachers t where t.id = (select public.my_teacher_id())
$$;
revoke all on function public.my_booking_preferences() from public, anon;
grant execute on function public.my_booking_preferences() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Open slots, with the expert's notice, horizon and gap. A block that covers only some hours now
-- removes only the slots it overlaps (it used to remove the whole weekly window). Otherwise as in
-- 20261105001000.
-- ---------------------------------------------------------------------------
create or replace function private.offering_open_slots(p_offering uuid, p_limit integer default 6, p_days integer default 60)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select o.id, o.teacher_id, o.format, o.duration_minutes,
           t.min_notice_hours, least(p_days, t.advance_days) as horizon, t.buffer_minutes
      from public.offerings o
      join private.visible_offerings v on v.id = o.id
      join public.teachers t on t.id = o.teacher_id
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
      cross join lateral generate_series(today.d::timestamp, (today.d + o.horizon)::timestamp, interval '1 day') as g(dd)
     where extract(dow from g.dd)::integer = w.weekday
    union all
    select (w.exception_date + w.starts), (w.exception_date + w.ends)
      from o
      join public.availability_windows w on w.offering_id = o.id and w.kind = 'extra'
      cross join today
     where w.exception_date between today.d and today.d + o.horizon
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
     where ws.starts_at >= now() + make_interval(hours => o.min_notice_hours)
       -- A blocked date beats weekly and extra hours: the whole day, or only the hours it covers.
       and not exists (
         select 1 from public.availability_windows bl
          where bl.offering_id = o.id and bl.kind = 'blocked'
            and bl.exception_date = (ws.starts_at at time zone 'Africa/Nairobi')::date
            and (bl.starts is null
                 or ((ws.starts_at at time zone 'Africa/Nairobi')::time < bl.ends
                     and ((ws.starts_at at time zone 'Africa/Nairobi') + make_interval(mins => o.duration_minutes))::time > bl.starts)))
       and not exists (
         select 1 from public.bookings b
          where b.teacher_id = o.teacher_id and b.kind <> 'seat' and b.status not in ('cancelled', 'lapsed')
            and b.starts_at < ws.starts_at + make_interval(mins => o.duration_minutes + o.buffer_minutes)
            and ws.starts_at < b.starts_at + make_interval(mins => b.duration_minutes + o.buffer_minutes))
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
