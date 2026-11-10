-- Koobi: the expert's own session packages (Create Learning Experience, pricing step).
--
-- An expert can name up to four packages for a one-to-one learning experience: how many sessions,
-- the total price and how long the learner has to use them. When an experience has its own packages
-- they replace the standard 8, 12 and 16 sizes. A package is still bought by its number of sessions,
-- so the purchase and payment flow is unchanged.

create table public.offering_packages (
  id             uuid primary key default gen_random_uuid(),
  offering_id    uuid not null references public.offerings (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 2 and 60),
  description    text check (char_length(description) <= 200),
  sessions       integer not null check (sessions between 2 and 52),
  price_kes      integer not null check (price_kes > 0),
  validity_weeks integer check (validity_weeks between 2 and 52),
  position       smallint not null default 1 check (position between 1 and 4),
  created_at     timestamptz not null default now(),
  unique (offering_id, sessions)
);
create index offering_packages_offering_idx on public.offering_packages (offering_id, position);

-- A package never costs more than the same number of single sessions, and four is the most.
create or replace function private.offering_packages_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o      public.offerings%rowtype;
  v_unit integer;
begin
  select * into o from public.offerings where id = new.offering_id;
  if o.format <> 'one_to_one' or o.price_hour_kes is null then
    raise exception 'packages need a one-to-one learning experience with a session price' using errcode = 'check_violation';
  end if;
  v_unit := round(o.price_hour_kes * o.duration_minutes / 60.0)::integer;
  if new.price_kes > v_unit * new.sessions then
    raise exception 'a package cannot cost more than % single sessions (KES %)', new.sessions, v_unit * new.sessions using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.offering_packages p where p.offering_id = new.offering_id) >= 4 then
    raise exception 'a learning experience can have up to four packages' using errcode = 'check_violation';
  end if;
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  return new;
end
$$;
create trigger offering_packages_05_rules before insert or update on public.offering_packages
  for each row execute function private.offering_packages_rules();
revoke all on function private.offering_packages_rules() from public, anon, authenticated;

alter table public.offering_packages enable row level security;
revoke all on public.offering_packages from anon, authenticated;
grant all on public.offering_packages to service_role;
grant select, delete on public.offering_packages to authenticated;
grant insert (offering_id, name, description, sessions, price_kes, validity_weeks, position) on public.offering_packages to authenticated;
create policy offering_packages_read on public.offering_packages for select to authenticated
  using (public.owns_offering(offering_id) or (select public.is_staff()));
create policy offering_packages_insert on public.offering_packages for insert to authenticated
  with check (public.owns_offering(offering_id));
create policy offering_packages_delete on public.offering_packages for delete to authenticated
  using (public.owns_offering(offering_id));

-- ---------------------------------------------------------------------------
-- Pricing and validity when a package is bought
-- ---------------------------------------------------------------------------
create or replace function private.quote_package(p_offering uuid, p_sessions integer)
returns table (teacher_id uuid, price_kes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o       public.offerings%rowtype;
  v_unit  integer;
  v_own   integer;
  v_named boolean;
begin
  select * into o from public.offerings where id = p_offering;
  if not found or o.listing_status <> 'approved' or o.format <> 'one_to_one' then
    raise exception 'offering % is not an approved one-to-one offering', p_offering using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.teachers t where t.id = o.teacher_id and t.listing_status = 'approved'
                  and t.status not in ('suspended', 'offboarded')) then
    raise exception 'teacher is not bookable' using errcode = 'check_violation';
  end if;
  v_unit := round(o.price_hour_kes * o.duration_minutes / 60.0)::integer;
  select op.price_kes into v_own from public.offering_packages op where op.offering_id = o.id and op.sessions = p_sessions;
  v_named := exists (select 1 from public.offering_packages op where op.offering_id = o.id);
  teacher_id := o.teacher_id;
  price_kes := case
                 when v_own is not null then v_own
                 when v_named then v_unit * p_sessions  -- not one of the expert's packages: no package rate
                 when p_sessions = 8  then coalesce(o.price_pkg8_kes,  v_unit * 8)
                 when p_sessions = 12 then coalesce(o.price_pkg12_kes, v_unit * 12)
                 when p_sessions = 16 then coalesce(o.price_pkg16_kes, v_unit * 16)
                 else v_unit * p_sessions
               end;
  return next;
end
$$;

-- Validity: the expert's own period when the package names one; otherwise sessions ÷ sessions per
-- week plus two weeks, as before.
create or replace function private.packages_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days  integer;
  v_weeks integer;
begin
  select op.validity_weeks into v_weeks from public.offering_packages op
   where op.offering_id = new.offering_id and op.sessions = new.sessions_total;
  new.ends_on := new.starts_on + (coalesce(v_weeks, (ceil(new.sessions_total::numeric / new.cadence_per_week) + 2)::integer) * 7);
  if new.plan_type = 'managed' then
    v_days := coalesce((private.param('commission_rate', null, 'one_to_one', 'in_home') ->> 'first_month_days')::integer, 30);
    if not exists (
      select 1 from public.bookings b
       where b.learner_id = new.learner_id and b.teacher_id = new.teacher_id and b.mode in ('in_home', 'teacher_premises')
         and b.status = 'confirmed' and b.starts_at <= now() - make_interval(days => v_days)) then
      raise exception 'the monthly plan opens after the first month of in-person lessons with this teacher' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- The offer page lists the expert's own packages
-- ---------------------------------------------------------------------------
create or replace view public.offer_details with (security_invoker = false) as
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
  -- The expert's own packages when there are any; otherwise the standard sizes that carry a price.
  coalesce(
    (select jsonb_agg(jsonb_build_object('sessions', op.sessions, 'price_kes', op.price_kes, 'name', op.name,
                                         'description', op.description, 'validity_weeks', op.validity_weeks)
                      order by op.position, op.sessions)
       from public.offering_packages op where op.offering_id = o.id and o.format = 'one_to_one'),
    (select jsonb_agg(jsonb_build_object('sessions', p.sessions, 'price_kes', p.price_kes) order by p.sessions)
       from (values (8, o.price_pkg8_kes), (12, o.price_pkg12_kes), (16, o.price_pkg16_kes)) as p(sessions, price_kes)
      where p.price_kes is not null and o.format = 'one_to_one')) as package_prices,
  coalesce(array(select s.ts from private.offering_open_slots(o.id, 6) as s(ts) order by s.ts), '{}'::timestamptz[]) as next_slots
from public.offerings o
join private.visible_offerings v on v.id = o.id;
