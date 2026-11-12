-- Koobi: email and password accounts (decided 2026-11-11). The phone becomes a contact detail.
--
-- 1. Sign-up carries the person's answer to "what brings you here" and the terms they ticked; the
--    profile trigger grants the matching self-service role and records the accepted terms version.
-- 2. Accepted terms are kept per person and version.
-- 3. Repeated wrong passwords lock an email address for a while, whether or not it has an account,
--    so the sign-in form gives nothing away.
-- 4. How long a session may last depends on the person's roles; the app asks here and enforces it.

-- ---------------------------------------------------------------------------
-- 1 and 2. Terms accepted, and roles from sign-up
-- ---------------------------------------------------------------------------
create table public.terms_acceptances (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     text not null check (version ~ '^[a-z0-9][a-z0-9.-]{2,39}$'),
  accepted_at timestamptz not null default now(),
  source      text not null default 'signup' check (source in ('signup', 'welcome', 'request')),
  primary key (user_id, version)
);
comment on table public.terms_acceptances is 'Which version of the terms each person ticked, and when. Written by the sign-up trigger and accept_terms().';
alter table public.terms_acceptances enable row level security;
grant select on public.terms_acceptances to authenticated;
grant all on public.terms_acceptances to service_role;
create policy terms_acceptances_read on public.terms_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('admin')));

-- For accounts that did not come through the sign-up form (invited staff, older phone accounts).
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_version !~ '^[a-z0-9][a-z0-9.-]{2,39}$' then
    raise exception 'unknown terms version' using errcode = 'check_violation';
  end if;
  insert into public.terms_acceptances (user_id, version, source)
  values (auth.uid(), p_version, 'welcome')
  on conflict (user_id, version) do nothing;
end
$$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone  text := private.normalise_phone(new.phone);
  v_name   text := nullif(pg_catalog.btrim(coalesce(
                     new.raw_user_meta_data ->> 'display_name',
                     new.raw_user_meta_data ->> 'full_name',
                     new.raw_user_meta_data ->> 'name', '')), '');
  v_intent text := new.raw_user_meta_data ->> 'intent';
  v_terms  text := new.raw_user_meta_data ->> 'terms_version';
  v_role   text := case v_intent when 'self' then 'learner' when 'child' then 'guardian' when 'teach' then 'teacher' end;
begin
  if v_phone is not null and exists (select 1 from public.profiles p where p.phone_e164 = v_phone) then
    v_phone := null;
  end if;
  insert into public.profiles (id, display_name, phone_e164, email)
  values (new.id, left(v_name, 80), v_phone, new.email)
  on conflict (id) do nothing;
  -- Only the three self-service roles can come from sign-up; staff roles are granted by an admin.
  if v_role is not null then
    insert into public.user_roles (user_id, role, granted_by)
    values (new.id, v_role::public.app_role, new.id)
    on conflict (user_id, role) do nothing;
  end if;
  if v_terms ~ '^[a-z0-9][a-z0-9.-]{2,39}$' then
    insert into public.terms_acceptances (user_id, version, source)
    values (new.id, v_terms, 'signup')
    on conflict (user_id, version) do nothing;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Lockout after repeated wrong passwords
--    Five failures inside 15 minutes lock the address for 15 minutes. Only a hash of the address is
--    kept. Anyone can already cause a lockout by typing wrong passwords, so recording a failure needs
--    no sign-in; clearing the count needs a successful one.
-- ---------------------------------------------------------------------------
create table private.sign_in_attempts (
  email_hash       text primary key,
  failures         integer not null default 0,
  first_failure_at timestamptz not null default now(),
  locked_until     timestamptz,
  updated_at       timestamptz not null default now()
);

create or replace function private.email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

-- Seconds until this address may try again; 0 when it is not locked.
create or replace function public.sign_in_wait(p_email text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select greatest(0, ceil(extract(epoch from (a.locked_until - now()))))::integer
      from private.sign_in_attempts a
     where a.email_hash = private.email_hash(p_email)), 0)
$$;

-- Records one wrong password. Returns the seconds the address is now locked for (0 = not locked).
create or replace function public.note_sign_in_failure(p_email text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text := private.email_hash(p_email);
  a      private.sign_in_attempts%rowtype;
begin
  if p_email is null or char_length(btrim(p_email)) not between 3 and 254 then
    return 0;
  end if;
  delete from private.sign_in_attempts where updated_at < now() - interval '1 day';
  insert into private.sign_in_attempts (email_hash, failures) values (v_hash, 0)
  on conflict (email_hash) do nothing;
  select * into a from private.sign_in_attempts where email_hash = v_hash for update;
  if a.locked_until is not null and a.locked_until > now() then
    return ceil(extract(epoch from (a.locked_until - now())))::integer;
  end if;
  if a.first_failure_at < now() - interval '15 minutes' or a.locked_until is not null then
    a.failures := 0;
    a.first_failure_at := now();
  end if;
  a.failures := a.failures + 1;
  a.locked_until := case when a.failures >= 5 then now() + interval '15 minutes' end;
  update private.sign_in_attempts
     set failures = a.failures, first_failure_at = a.first_failure_at, locked_until = a.locked_until, updated_at = now()
   where email_hash = v_hash;
  return case when a.locked_until is null then 0 else 900 end;
end
$$;

-- After a successful sign-in: the signed-in person's own address starts from zero again.
create or replace function public.clear_sign_in_failures()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is not null then
    delete from private.sign_in_attempts where email_hash = private.email_hash(v_email);
  end if;
end
$$;

revoke all on function public.sign_in_wait(text), public.note_sign_in_failure(text), public.clear_sign_in_failures() from public, anon, authenticated;
grant execute on function public.sign_in_wait(text), public.note_sign_in_failure(text) to anon, authenticated, service_role;
grant execute on function public.clear_sign_in_failures() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Session length by role: staff 12 hours, experts 7 days, learners and parents 30 days.
--    The strictest role wins. Supabase has one project-wide setting, so the app enforces this.
-- ---------------------------------------------------------------------------
create or replace function public.session_limit_hours()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.is_staff()) then 12
    when (select public.has_role('teacher')) then 168
    else 720
  end
$$;
revoke all on function public.session_limit_hours() from public, anon;
grant execute on function public.session_limit_hours() to authenticated;
