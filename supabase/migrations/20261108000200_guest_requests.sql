-- Koobi: "Request a match" without an account.
--
-- A visitor sends what they need with their name, email and phone. The request has no owner until
-- the person signs up or signs in with that same, confirmed email; then it becomes theirs and they
-- can answer the shortlist like any other request. The concierge sees guest requests in the same
-- queue, with the contact details.

alter table public.requests alter column requester_id drop not null;

alter table public.requests
  add column contact_name            text check (contact_name is null or char_length(btrim(contact_name)) between 2 and 80),
  add column contact_email           text check (contact_email is null or (contact_email = lower(contact_email) and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(contact_email) <= 254)),
  add column contact_phone           text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column contact_consent_at      timestamptz,
  add column contact_consent_version text check (contact_consent_version is null or contact_consent_version ~ '^[a-z0-9][a-z0-9.-]{2,39}$'),
  add column preferred_times         text[] not null default '{}'
    constraint requests_preferred_times check (preferred_times <@ array['morning', 'afternoon', 'evening', 'flexible']),
  add column preferred_days          text[] not null default '{}'
    constraint requests_preferred_days check (preferred_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  add column claimed_at              timestamptz,
  add constraint requests_owner_or_contact
    check (requester_id is not null or (contact_name is not null and contact_email is not null and contact_consent_at is not null));

create index requests_guest_email_idx on public.requests (contact_email) where requester_id is null;

-- The one way a request arrives from the public form, signed in or not. Online only for now.
create or replace function public.submit_match_request(
  p_category text, p_need text, p_format text, p_times text[], p_days text[], p_budget integer,
  p_name text, p_email text, p_phone text, p_consent_version text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_need  text := btrim(coalesce(p_need, ''), E' \n\r\t');
  v_name  text := btrim(coalesce(p_name, ''));
  v_track text;
  v_when  text;
  v_id    uuid;
begin
  select c.default_track into v_track from public.categories c where c.code = p_category;
  if v_track is null then
    raise exception 'choose what you would like to learn' using errcode = 'check_violation';
  end if;
  if char_length(v_need) not between 10 and 500 then
    raise exception 'say what you need in 10 to 500 characters' using errcode = 'check_violation';
  end if;
  if p_format is not null and p_format not in ('one_to_one', 'small_group', 'workshop', 'cohort') then
    raise exception 'unknown type of learning' using errcode = 'check_violation';
  end if;
  if p_budget is not null and (p_budget < 100 or p_budget > 1000000) then
    raise exception 'check the budget' using errcode = 'check_violation';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'tell us your name' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'enter a valid email address' using errcode = 'check_violation';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'enter a valid phone number' using errcode = 'check_violation';
  end if;
  if p_consent_version is null then
    raise exception 'tick the box so we may contact you about this request' using errcode = 'check_violation';
  end if;
  -- A light brake on a form anyone can post to: three open requests a day for one address.
  if v_uid is null and (select count(*) from public.requests r
                         where r.requester_id is null and r.contact_email = v_email
                           and r.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'you have sent three requests today; we will reply to those first' using errcode = 'check_violation';
  end if;

  v_when := nullif(concat_ws(' · ',
    nullif(array_to_string(array(select initcap(t) from unnest(coalesce(p_times, '{}')) t), ', '), ''),
    nullif(array_to_string(array(select initcap(d) from unnest(coalesce(p_days, '{}')) d), ', '), '')), '');

  insert into public.requests (requester_id, category, track, subject, goal, mode, budget_max_kes, schedule_notes, format_pref,
                               contact_name, contact_email, contact_phone, contact_consent_at, contact_consent_version,
                               preferred_times, preferred_days)
  values (v_uid, p_category, v_track, left(split_part(v_need, E'\n', 1), 80), v_need, 'online', p_budget, v_when, p_format,
          v_name, v_email, p_phone, now(), p_consent_version, coalesce(p_times, '{}'), coalesce(p_days, '{}'))
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.submit_match_request(text, text, text, text[], text[], integer, text, text, text, text) from public;
grant execute on function public.submit_match_request(text, text, text, text[], text[], integer, text, text, text, text) to anon, authenticated;

-- Links guest requests to the signed-in person when their confirmed email is the one on the request.
-- Called after sign-in and after email confirmation. Returns how many were linked.
create or replace function public.claim_guest_requests()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_n     integer;
begin
  if v_uid is null then
    return 0;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  update public.requests set requester_id = v_uid, claimed_at = now()
   where requester_id is null and contact_email = v_email;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.claim_guest_requests() from public, anon;
grant execute on function public.claim_guest_requests() to authenticated;
