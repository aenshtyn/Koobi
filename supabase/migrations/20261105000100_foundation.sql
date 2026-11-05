-- Koobi 0100: foundation
-- Schemas, user roles, profiles, the generic state-machine guard (PRD §6.4 rule 3, §8),
-- the transactional outbox (§6.4 rule 1), the audit log and shared helpers.
--
-- Conventions used in every migration:
--   * ids are uuid; money is whole KES in integer columns named *_kes (§7).
--   * every table has created_at/updated_at unless it is append-only.
--   * internal helpers, triggers and jobs live in schema `private`, which the Data API does not expose.
--   * state columns are guarded by private.enforce_transition(machine, column) against public.state_transitions.

create schema if not exists private;
comment on schema private is 'Koobi internals: trigger functions, policy helpers used by triggers, jobs. Not exposed through the Data API.';

-- ---------------------------------------------------------------------------
-- Roles (PRD §2.1, FR-ACC-4). A user may hold several.
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('guardian', 'learner', 'teacher', 'concierge', 'reviewer', 'finance', 'admin');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- True when the caller is the platform itself: the service role (webhook ingress, relay, document
-- service), the migration owner, or a SECURITY DEFINER function owned by it. Must be called from
-- SECURITY INVOKER code so current_user is the real caller.
create or replace function private.is_system()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
      or coalesce((select r.rolsuper or r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user), false)
$$;

create or replace function private.slugify(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-')
$$;

-- Append-only guard for ledger, audit and history tables.
create or replace function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; post a reversing entry instead', tg_table_name
    using errcode = 'check_violation';
end
$$;

-- ---------------------------------------------------------------------------
-- Profiles (PRD §7.2 User). auth.users holds credentials; this holds the product fields.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (display_name is null or char_length(display_name) between 1 and 80),
  phone_e164       text unique check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email            text,
  country_code     text not null default 'KE' check (country_code ~ '^[A-Z]{2}$'),
  time_zone        text not null default 'Africa/Nairobi',
  display_currency text not null default 'KES' check (display_currency in ('KES', 'USD')),
  locale           text not null default 'en' check (locale in ('en', 'sw')),
  status           text not null default 'active' check (status in ('active', 'suspended', 'erased')),
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. phone_e164 is copied from auth.users and is never exposed publicly (§2.2).';

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Roles per user. guardian, learner and teacher are self-service; staff roles are granted by admin only.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- has_role / has_any_role / is_staff: used by RLS policies. SECURITY DEFINER so they read
-- user_roles without recursing through its own policies.
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
  )
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
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_any_role(array['concierge', 'reviewer', 'finance', 'admin']::public.app_role[])
$$;

create or replace function public.my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}')
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
$$;

-- Self-service role claim used by the welcome screen: supabase.rpc('claim_role', { p_role }).
-- Only guardian, learner and teacher can be claimed; staff roles are granted by admin only.
create or replace function public.claim_role(p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_role requires a signed-in user' using errcode = 'insufficient_privilege';
  end if;
  if p_role is null or p_role not in ('guardian', 'learner', 'teacher') then
    raise exception 'role % cannot be self-assigned', coalesce(p_role, 'null') using errcode = 'insufficient_privilege';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (v_uid, p_role::public.app_role, v_uid)
  on conflict (user_id, role) do nothing;
end
$$;

-- Profile creation on sign-up, and phone/email sync on change.
create or replace function private.normalise_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(coalesce(p, '')), '');
begin
  if v is null then
    return null;
  end if;
  if left(v, 1) <> '+' then
    v := '+' || v;
  end if;
  if v !~ '^\+[1-9][0-9]{6,14}$' then
    return null;
  end if;
  return v;
end
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalise_phone(new.phone);
  v_name  text := nullif(pg_catalog.btrim(coalesce(
                    new.raw_user_meta_data ->> 'display_name',
                    new.raw_user_meta_data ->> 'full_name',
                    new.raw_user_meta_data ->> 'name', '')), '');
begin
  if v_phone is not null and exists (select 1 from public.profiles p where p.phone_e164 = v_phone) then
    v_phone := null;
  end if;
  insert into public.profiles (id, display_name, phone_e164, email)
  values (new.id, left(v_name, 80), v_phone, new.email)
  on conflict (id) do nothing;
  return new;
end
$$;

create or replace function private.handle_user_contact_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalise_phone(new.phone);
begin
  if v_phone is not null and exists (select 1 from public.profiles p where p.phone_e164 = v_phone and p.id <> new.id) then
    v_phone := null;
  end if;
  update public.profiles
     set phone_e164 = v_phone,
         email = new.email
   where id = new.id;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_contact_updated
  after update of phone, email on auth.users
  for each row execute function private.handle_user_contact_update();

-- ---------------------------------------------------------------------------
-- Transactional outbox (§6.4 rule 1; §9.7 rules 7-8)
-- ---------------------------------------------------------------------------
create table public.outbox (
  id               uuid primary key default gen_random_uuid(),
  topic            text not null,
  aggregate_type   text not null,
  aggregate_id     uuid,
  payload          jsonb not null default '{}',
  idempotency_key  text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'dead')),
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  delivered_at     timestamptz,
  dead_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.outbox is 'Events written in the same transaction as the state change. The relay delivers them to Edge Functions; dead = dead-letter (alert).';
create index outbox_due_idx on public.outbox (next_attempt_at) where status = 'pending';
create index outbox_dead_idx on public.outbox (dead_at) where status = 'dead';
create trigger outbox_updated_at before update on public.outbox
  for each row execute function private.set_updated_at();

create or replace function private.enqueue(
  p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_idempotency_key text,
  p_max_attempts integer default 5)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.outbox (topic, aggregate_type, aggregate_id, payload, idempotency_key, max_attempts)
  values (p_topic, p_aggregate_type, p_aggregate_id, coalesce(p_payload, '{}'), p_idempotency_key, p_max_attempts)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- Claim due events for delivery (used by the relay Edge Function through the service role).
create or replace function private.outbox_claim(p_batch integer default 50, p_worker text default 'relay')
returns setof public.outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.outbox o
     set status = 'processing', locked_at = now(), locked_by = p_worker, attempts = o.attempts + 1
   where o.id in (
     select x.id from public.outbox x
      where x.status = 'pending' and x.next_attempt_at <= now()
      order by x.next_attempt_at
      limit p_batch
      for update skip locked)
  returning o.*;
end
$$;

create or replace function private.outbox_ack(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.outbox
     set status = 'delivered', delivered_at = now(), locked_at = null, locked_by = null, last_error = null
   where id = p_id and status = 'processing'
$$;

-- Failure: exponential backoff with jitter, dead-letter after max_attempts (§9.7 rule 8).
create or replace function private.outbox_fail(p_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.outbox
     set status = case when attempts >= max_attempts then 'dead' else 'pending' end,
         dead_at = case when attempts >= max_attempts then now() end,
         next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, attempts)) * (0.75 + random() * 0.5)),
         last_error = left(p_error, 2000),
         locked_at = null,
         locked_by = null
   where id = p_id and status = 'processing'
$$;

-- ---------------------------------------------------------------------------
-- Audit log (§7.2 AuditLog). Append-only.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,          -- no FK: the log outlives erased users
  actor_role    text,
  actor         text not null, -- 'user:<uuid>' or 'system:<job>'
  action        text not null, -- e.g. document.view, payout.approve, parameter.update, waitlist.release
  entity_type   text,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  ip            inet,
  user_agent    text,
  at            timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at);
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();

create or replace function private.current_actor()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.actor', true), ''),
    case when auth.uid() is not null then 'user:' || auth.uid()::text else 'system' end)
$$;

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_user_id, actor, action, entity_type, entity_id, before, after, reason)
  values (auth.uid(), private.current_actor(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
$$;

-- ---------------------------------------------------------------------------
-- State machines as data (§6.4 rule 3, §8)
-- ---------------------------------------------------------------------------
create table public.state_transitions (
  machine     text not null,
  from_state  text not null,              -- '[*]' = creation
  to_state    text not null,
  allowed     text[] not null default '{any}',
  description text,
  primary key (machine, from_state, to_state),
  check (allowed <@ array['any', 'system', 'guardian', 'learner', 'teacher', 'concierge', 'reviewer', 'finance', 'admin']::text[])
);
comment on table public.state_transitions is
  'Legal transitions per machine. allowed: ''any'' = any caller that passes RLS; ''system'' = service role or SECURITY DEFINER code only; role names = holders of that role. The system may always perform a legal transition.';

create table public.state_history (
  id           bigint generated always as identity primary key,
  entity_table text not null,
  entity_id    uuid not null,
  machine      text not null,
  from_state   text,
  to_state     text not null,
  actor_id     uuid,
  actor        text not null,
  reason       text,
  at           timestamptz not null default now()
);
create index state_history_entity_idx on public.state_history (entity_table, entity_id, at);
create trigger state_history_append_only before update or delete on public.state_history
  for each row execute function private.forbid_mutation();

-- Writes history and the outbox event for a transition. SECURITY DEFINER so callers need no
-- direct rights on state_history or outbox.
create or replace function private.log_transition(
  p_table text, p_id uuid, p_machine text, p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hist bigint;
begin
  insert into public.state_history (entity_table, entity_id, machine, from_state, to_state, actor_id, actor, reason)
  values (p_table, p_id, p_machine, nullif(p_from, '[*]'), p_to, auth.uid(), private.current_actor(),
          nullif(current_setting('app.transition_reason', true), ''))
  returning id into v_hist;

  perform private.enqueue(
    p_machine || '.' || p_to, p_table, p_id,
    jsonb_build_object('id', p_id, 'from', nullif(p_from, '[*]'), 'to', p_to, 'history_id', v_hist),
    'transition:' || v_hist::text);
end
$$;

create or replace function private.caller_may(p_allowed text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select 'any' = any (p_allowed)
      or exists (select 1 from public.user_roles ur
                  where ur.user_id = (select auth.uid()) and ur.role::text = any (p_allowed))
$$;

-- Trigger: tg_argv[0] = machine name, tg_argv[1] = state column (default 'status').
-- Rejects any transition not in state_transitions, and any transition the caller's roles do not allow.
create or replace function private.enforce_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_machine text := tg_argv[0];
  v_col     text := coalesce(tg_argv[1], 'status');
  v_new     text := to_jsonb(new) ->> v_col;
  v_old     text;
  v_allowed text[];
begin
  if tg_op = 'INSERT' then
    if v_new is null then
      return new;
    end if;
    v_old := '[*]';
  else
    v_old := to_jsonb(old) ->> v_col;
    if v_new is not distinct from v_old then
      return new;
    end if;
    if v_new is null then
      raise exception 'illegal % transition: % -> null', v_machine, v_old using errcode = 'check_violation';
    end if;
    v_old := coalesce(v_old, '[*]');
  end if;

  select t.allowed into v_allowed
    from public.state_transitions t
   where t.machine = v_machine and t.from_state = v_old and t.to_state = v_new;

  if not found then
    raise exception 'illegal % transition: % -> %', v_machine, v_old, v_new
      using errcode = 'check_violation',
            hint = 'See public.state_transitions for the legal moves.';
  end if;

  if not private.is_system() and not private.caller_may(v_allowed) then
    raise exception '% transition % -> % is not allowed for this caller', v_machine, v_old, v_new
      using errcode = 'insufficient_privilege';
  end if;

  perform private.log_transition(tg_table_name, (to_jsonb(new) ->> 'id')::uuid, v_machine, v_old, v_new);
  return new;
end
$$;
