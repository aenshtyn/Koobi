-- Koobi sprint 3: concierge shortlists, accepting a match, the teacher requests inbox, the thread list,
-- and hiding contact details in messages until the first paid booking.
-- PRD FR-MATCH-2, FR-MATCH-3, FR-MATCH-4, FR-MSG-1, FR-MSG-2; §3.2.
--
-- Every function runs as its owner (security definer) but checks the caller itself, and every state
-- change still goes through the transition triggers, which read the caller's roles from auth.uid().

-- ---------------------------------------------------------------------------
-- 1. Concierge sends a shortlist in one transaction (FR-MATCH-2)
--    p_items: [{"offering_id": uuid, "rank": 1-5, "reason": text, "source": "concierge"|"teacher_applied",
--               "snapshot": {...}}]; ranks 1-3 are primary, 4-5 reserve.
-- ---------------------------------------------------------------------------
create or replace function public.send_shortlist(p_request uuid, p_minutes integer, p_note text, p_items jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r          public.requests%rowtype;
  v_list     uuid;
  v_item     jsonb;
  v_offering public.offerings%rowtype;
  v_match    uuid;
  v_count    integer := 0;
begin
  if not (select public.has_any_role('{concierge,admin}')) then
    raise exception 'only the concierge can send a shortlist' using errcode = 'insufficient_privilege';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'log the minutes spent (1 to 1440)' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 5 then
    raise exception 'a shortlist has 1 to 5 teachers' using errcode = 'check_violation';
  end if;

  select * into r from public.requests where id = p_request for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if r.status = 'submitted' then
    update public.requests set status = 'triaged' where id = r.id;
  elsif r.status <> 'triaged' then
    raise exception 'request is %, not open for a shortlist', r.status using errcode = 'check_violation';
  end if;

  insert into public.staff_time_log (staff_user_id, subject_type, subject_id, minutes, note)
  values (auth.uid(), 'request', r.id, p_minutes, nullif(btrim(p_note), ''));

  -- Earlier candidates that were never sent are dropped; a new shortlist replaces them.
  update public.matches set status = 'declined', decline_reason = 'Replaced by a new shortlist.'
   where request_id = r.id and status = 'proposed';

  insert into public.shortlists (request_id, status, sent_at, expires_at)
  values (r.id, 'sent', now(), now() + interval '7 days')
  returning id into v_list;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_offering from public.offerings where id = (v_item ->> 'offering_id')::uuid;
    if not found or v_offering.listing_status <> 'approved' then
      raise exception 'offer % is not approved', v_item ->> 'offering_id' using errcode = 'check_violation';
    end if;
    if v_offering.track <> r.track then
      raise exception 'offer % is on another track', v_offering.id using errcode = 'check_violation';
    end if;
    insert into public.matches (request_id, teacher_id, offering_id, rank, source, concierge_reason, ranking_snapshot)
    values (r.id, v_offering.teacher_id, v_offering.id, (v_item ->> 'rank')::smallint,
            coalesce(v_item ->> 'source', 'concierge'), left(v_item ->> 'reason', 200), coalesce(v_item -> 'snapshot', '{}'))
    on conflict (request_id, offering_id) do update
      set rank = excluded.rank, concierge_reason = excluded.concierge_reason, ranking_snapshot = excluded.ranking_snapshot
    returning id into v_match;
    -- A candidate the requester declined earlier cannot be offered again on this request.
    if (select status from public.matches where id = v_match) <> 'proposed' then
      raise exception 'offer % was already answered on this request', v_offering.id using errcode = 'check_violation';
    end if;
    insert into public.shortlist_entries (shortlist_id, match_id, position, is_primary)
    values (v_list, v_match, (v_item ->> 'rank')::smallint, (v_item ->> 'rank')::smallint <= 3);
    update public.matches set status = 'sent' where id = v_match;
    update public.teacher_applications set status = 'shortlisted', match_id = v_match
     where request_id = r.id and offering_id = v_offering.id and status = 'submitted';
    v_count := v_count + 1;
  end loop;

  update public.requests set status = 'shortlisted' where id = r.id;
  return v_list;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Requester accepts one teacher (FR-MATCH-4): the others are declined, the request is matched,
--    and a pair thread opens with contacts masked (FR-MSG-1, FR-MSG-2). Returns the thread id.
-- ---------------------------------------------------------------------------
create or replace function public.accept_match(p_match uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m        public.matches%rowtype;
  r        public.requests%rowtype;
  v_owner  uuid;
  v_thread uuid;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then
    raise exception 'match not found' using errcode = 'no_data_found';
  end if;
  select * into r from public.requests where id = m.request_id for update;
  if r.requester_id is distinct from auth.uid() then
    raise exception 'not your request' using errcode = 'insufficient_privilege';
  end if;
  if m.status <> 'sent' or r.status <> 'shortlisted' then
    raise exception 'this shortlist is no longer open' using errcode = 'check_violation';
  end if;

  update public.matches set status = 'accepted' where id = m.id;
  update public.matches set status = 'declined', decline_reason = 'Another teacher was chosen.'
   where request_id = r.id and id <> m.id and status = 'sent';
  update public.requests set status = 'matched' where id = r.id;
  update public.shortlists set status = 'answered' where request_id = r.id and status = 'sent';

  select user_id into v_owner from public.teachers where id = m.teacher_id;
  insert into public.message_threads (kind, match_id, request_id) values ('pair', m.id, r.id) returning id into v_thread;
  insert into public.thread_participants (thread_id, user_id, role)
  values (v_thread, r.requester_id, 'payer'), (v_thread, v_owner, 'teacher');
  return v_thread;
end
$$;

-- Requester declines every teacher on the shortlist, or asks for more: back to the concierge.
create or replace function public.decline_shortlist(p_request uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.requests%rowtype;
begin
  select * into r from public.requests where id = p_request for update;
  if not found or r.requester_id is distinct from auth.uid() then
    raise exception 'not your request' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'shortlisted' then
    raise exception 'this shortlist is no longer open' using errcode = 'check_violation';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say briefly why, so the concierge can do better' using errcode = 'check_violation';
  end if;
  update public.matches set status = 'declined', decline_reason = left(btrim(p_reason), 500)
   where request_id = r.id and status = 'sent';
  update public.shortlists set status = 'answered' where request_id = r.id and status = 'sent';
  update public.requests set status = 'triaged' where id = r.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Teacher requests inbox (FR-MATCH-3): open requests on the caller's approved offers' category and
--    track, with a compatible mode. No requester identity, no free-text notes.
-- ---------------------------------------------------------------------------
create or replace function public.open_requests_for_teacher()
returns table (
  id uuid, category text, track text, subject text, goal text, level text, mode text, county text,
  budget_max_kes integer, schedule_notes text, created_at timestamptz, offering_ids uuid[], applied boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.track, r.subject, r.goal, r.level, r.mode, r.county, r.budget_max_kes, r.schedule_notes,
         r.created_at,
         array_agg(o.id order by o.created_at),
         exists (select 1 from public.teacher_applications a where a.request_id = r.id and a.teacher_id = t.id)
    from public.requests r
    join public.offerings o on o.category = r.category and o.track = r.track and o.listing_status = 'approved'
    join public.teachers t on t.id = o.teacher_id
   where r.status in ('submitted', 'triaged')
     and t.user_id = (select auth.uid())
     and t.listing_status = 'approved'
     and t.status not in ('suspended', 'offboarded')
     and (r.mode = 'hybrid' or r.mode = any (o.modes))
   group by r.id, t.id
   order by r.created_at
$$;

-- ---------------------------------------------------------------------------
-- 4. The caller's threads with the other side's public name, the last message and the unread count.
--    Learners see the teacher's display name; teachers see the learner's first name only.
-- ---------------------------------------------------------------------------
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
    left join public.offerings o on o.id = m.offering_id
    left join public.teachers t on t.id = m.teacher_id
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

-- ---------------------------------------------------------------------------
-- 5. Hide phone numbers and email addresses in messages until the pair's first paid booking
--    (FR-MSG-2). A run of digits counts as a phone number when it holds at least 9 digits, so prices,
--    dates and times are left alone.
-- ---------------------------------------------------------------------------
create or replace function private.redact_contact_details()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_revealed timestamptz;
  v_body     text := new.body;
  v_hit      text;
begin
  select contact_revealed_at into v_revealed from public.message_threads where id = new.thread_id;
  if v_revealed is not null then
    return new;
  end if;
  for v_hit in select (regexp_matches(new.body, '\+?\d[\d\s().-]{6,}\d', 'g'))[1] loop
    if char_length(regexp_replace(v_hit, '\D', '', 'g')) >= 9 then
      v_body := replace(v_body, v_hit, '[number hidden until the first paid booking]');
    end if;
  end loop;
  v_body := regexp_replace(v_body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email hidden until the first paid booking]', 'g');
  if v_body <> new.body then
    new.body := v_body;
    new.redacted := true;
    new.flagged_reason := 'contact_detail';
  end if;
  return new;
end
$$;

create trigger messages_05_redact before insert on public.messages
  for each row execute function private.redact_contact_details();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.send_shortlist(uuid, integer, text, jsonb), public.accept_match(uuid),
  public.decline_shortlist(uuid, text), public.open_requests_for_teacher(), public.my_threads()
  from public, anon;
grant execute on function public.send_shortlist(uuid, integer, text, jsonb), public.accept_match(uuid),
  public.decline_shortlist(uuid, text), public.open_requests_for_teacher(), public.my_threads()
  to authenticated, service_role;
revoke all on function private.redact_contact_details() from public, anon, authenticated;
